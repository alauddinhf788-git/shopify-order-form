// /api/create-order.js

// Allowed origins list (Vercel ENV: ALLOWED_ORIGIN = "https://a.com,https://b.com")
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function shopifyFetch(path, opts = {}) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}${path}`;
  const headers = {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;

  // CORS handling
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    if (!name || !phone || !address || !variant_id) {
      return res.status(400).json({ error: "Missing required fields (name, phone, address, variant_id)" });
    }

    // ---- normalize & fix phone for Shopify ----
    let digits = String(phone || "").replace(/\D/g, ""); // only numbers
    // Many Bangladeshi phones: 01XXXXXXXXX (11 digits) -> +8801XXXXXXXXX
    let fixedPhone = digits;
    if (digits.length === 11 && digits.startsWith("01")) {
      fixedPhone = "+88" + digits;
    } else if (digits.length === 13 && digits.startsWith("880")) {
      fixedPhone = "+" + digits;
    } else if (digits.length === 10 && digits.startsWith("1")) {
      // if user omitted leading zero: 1XXXXXXXXX
      fixedPhone = "+880" + digits;
    } else if (digits.length === 0) {
      fixedPhone = phone; // fallback raw
    } else {
      // fallback: try adding + if not present
      fixedPhone = digits.length ? "+" + digits : phone;
    }

    // Build a readable combined note
    const fullNote = [
      `নাম: ${name}`,
      `ফোন: ${phone}`,
      `ঠিকানা: ${address}`,
      `কাস্টমার নোট: ${note || ""}`,
      `ডেলিভারি চার্জ: ${delivery_charge || ""}৳`,
    ].join(" | ");

    // ---- 1) Try find existing customer ----
    // Try several query forms because Shopify search can be picky
    let customerId = null;
    let existingCustomer = null;

    // helper to search
    async function trySearch(query) {
      const encoded = encodeURIComponent(query);
      const path = `/admin/api/2025-01/customers/search.json?query=${encoded}`;
      const { ok, json } = await shopifyFetch(path, { method: "GET" });
      if (ok && json && Array.isArray(json.customers) && json.customers.length) {
        return json.customers[0];
      }
      return null;
    }

    // Try multiple search queries
    // 1) search by normalized phone (+8801...)
    existingCustomer = await trySearch(`phone:${fixedPhone}`);
    // 2) if not found, try without plus / local format (017...)
    if (!existingCustomer) {
      const localPhone = digits.startsWith("88") ? digits.slice(2) : digits; // maybe 8801...
      if (localPhone) {
        existingCustomer = await trySearch(`phone:${localPhone}`);
      }
    }
    // 3) try by email fallback (we use phone@noemail.com) just in case earlier orders saved that
    if (!existingCustomer) {
      const fallbackEmail = `${digits}@noemail.com`;
      existingCustomer = await trySearch(`email:${fallbackEmail}`);
    }

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // ---- 2) Create new customer if not found ----
      const newCustomerBody = {
        customer: {
          first_name: name,
          email: `${digits}@noemail.com`,
          phone: fixedPhone,
          addresses: [
            {
              address1: address,
              phone: fixedPhone,
              first_name: name,
              country: "Bangladesh",
            },
          ],
        },
      };

      const { ok: createOk, json: createdJson } = await shopifyFetch("/admin/api/2025-01/customers.json", {
        method: "POST",
        body: JSON.stringify(newCustomerBody),
      });

      if (!createOk) {
        console.error("Shopify create customer error:", createdJson);
        // return error but do not leak token; return Shopify's response
        return res.status(500).json({ error: "Failed creating customer", details: createdJson });
      }

      customerId = createdJson?.customer?.id;
      existingCustomer = createdJson?.customer || null;
    }

    if (!customerId) {
      return res.status(500).json({ error: "Could not find or create customer" });
    }

    // ---- 3) Create order attaching the customer_id ----
    const orderPayload = {
      order: {
        customer_id: customerId,
        email: `${digits}@noemail.com`,
        phone: fixedPhone,
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1,
          },
        ],
        shipping_address: {
          first_name: name,
          phone: fixedPhone,
          address1: address,
          country: "Bangladesh",
        },
        billing_address: {
          first_name: name,
          phone: fixedPhone,
          address1: address,
          country: "Bangladesh",
        },
        note: fullNote,
        tags: `LandingPage, Delivery-${delivery_charge || ""}`,
        financial_status: "pending",
        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge || 0).toFixed(2),
            code: "CUSTOM_DELIVERY",
          },
        ],
      },
    };

    const { ok: orderOk, json: orderJson, status: orderStatus } = await shopifyFetch("/admin/api/2025-01/orders.json", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    if (!orderOk) {
      console.error("Shopify create order error:", orderJson);
      return res.status(500).json({ error: "Failed creating order", details: orderJson });
    }

    // Success — return created order + customer data
    return res.status(200).json({
      success: true,
      customer: existingCustomer || null,
      order: orderJson.order || orderJson, // shopify returns { order: {...} }
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server failed", details: String(err) });
  }
}
