// /api/create-order.js

// ---- Allowed origins (comma separated) ----
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Shopify API Wrapper ----
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

  // ---- CORS Handling ----
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST requests allowed" });

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    // ---- Validation ----
    if (!name || !phone || !address || !variant_id) {
      return res.status(400).json({
        error: "Missing required fields (name, phone, address, variant_id)",
      });
    }

    // ---- Normalize phone ----
    let digits = String(phone).replace(/\D/g, "");
    let fixedPhone = digits;

    if (digits.length === 11 && digits.startsWith("01")) {
      fixedPhone = "+88" + digits;
    } else if (digits.length === 13 && digits.startsWith("880")) {
      fixedPhone = "+" + digits;
    } else if (digits.length === 10 && digits.startsWith("1")) {
      fixedPhone = "+880" + digits;
    } else if (digits.length > 0) {
      fixedPhone = "+" + digits;
    }

    // ---- Build combined note ----
    const fullNote = [
      `নাম: ${name}`,
      `ফোন: ${phone}`,
      `ঠিকানা: ${address}`,
      `কাস্টমার নোট: ${note || ""}`,
      `ডেলিভারি চার্জ: ${delivery_charge || ""}৳`,
    ].join(" | ");

    // ---- Search Customer Helper ----
    async function trySearch(query) {
      const encoded = encodeURIComponent(query);
      const path = `/admin/api/2025-01/customers/search.json?query=${encoded}`;

      const { ok, json } = await shopifyFetch(path, { method: "GET" });
      if (ok && json?.customers?.length) return json.customers[0];

      return null;
    }

    // ---- Try Find Existing Customer ----
    let existingCustomer = null;
    let customerId = null;

    // 1) search by normalized phone
    existingCustomer = await trySearch(`phone:${fixedPhone}`);

    // 2) try local phone (017..., 019...)
    if (!existingCustomer) {
      const localPhone = digits.startsWith("88") ? digits.slice(2) : digits;
      if (localPhone) {
        existingCustomer = await trySearch(`phone:${localPhone}`);
      }
    }

    // 3) search by fallback email
    if (!existingCustomer) {
      const fallbackEmail = `${digits}@noemail.com`;
      existingCustomer = await trySearch(`email:${fallbackEmail}`);
    }

    // ---- If Customer not found → Create new ----
    if (!existingCustomer) {
      const newCustomerBody = {
        customer: {
          first_name: name,
          email: `${digits}@noemail.com`,
          phone: fixedPhone,
          addresses: [
            {
              first_name: name,
              phone: fixedPhone,
              address1: address,
              country: "Bangladesh",
            },
          ],
        },
      };

      const { ok, json } = await shopifyFetch("/admin/api/2025-01/customers.json", {
        method: "POST",
        body: JSON.stringify(newCustomerBody),
      });

      if (!ok) {
        console.error("Shopify create customer error:", json);
        return res.status(500).json({
          error: "Failed creating customer",
          details: json,
        });
      }

      existingCustomer = json.customer;
    }

    customerId = existingCustomer.id;

    // ---- Create Order ----
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

    const { ok: orderOk, json: orderJson } = await shopifyFetch(
      "/admin/api/2025-01/orders.json",
      {
        method: "POST",
        body: JSON.stringify(orderPayload),
      }
    );

    if (!orderOk) {
      console.error("Shopify create order error:", orderJson);
      return res.status(500).json({
        error: "Failed creating order",
        details: orderJson,
      });
    }

    // ---- Success ----
    return res.status(200).json({
      success: true,
      customer: existingCustomer,
      order: orderJson.order || orderJson,
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      error: "Server failed",
      details: String(err),
    });
  }
}
