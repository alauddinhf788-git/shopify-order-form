// /api/create-order.js

// CORS Allowed Domains
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Shopify API Helper
async function shopifyFetch(path, opts = {}) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}${path}`;
  const headers = {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    "Content-Type": "application/json",
    ...(opts.headers || {})
  };

  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => null);

  return { ok: res.ok, status: res.status, json };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;

  // CORS
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    // Required Fields Check
    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ---------- Normalize Bangladeshi Phone ----------
    let digits = String(phone).replace(/\D/g, "");
    let fixedPhone = phone;

    if (digits.length === 11 && digits.startsWith("01")) {
      fixedPhone = "+88" + digits;
    } else if (digits.length === 13 && digits.startsWith("880")) {
      fixedPhone = "+" + digits;
    } else if (digits.length === 10 && digits.startsWith("1")) {
      fixedPhone = "+880" + digits;
    } else if (digits.length > 0) {
      fixedPhone = "+" + digits;
    }

    // ---------- Fetch Product Variant Info ----------
    const variantRes = await shopifyFetch(`/admin/api/2025-01/variants/${variant_id}.json`, { method: "GET" });

    if (!variantRes.ok) {
      return res.status(500).json({
        error: "Failed to fetch variant info",
        details: variantRes.json
      });
    }

    const variant = variantRes.json.variant;
    const productName = variant.title || "Unnamed Product";
    const productPrice = Number(variant.price || 0);
    const totalPrice = productPrice + Number(delivery_charge || 0);

    // ---------- Shopify Order Note (Beautiful Format) ----------
    const fullNote =
      `নাম: ${name}\n` +
      `ফোন: ${phone}\n` +
      `ঠিকানা: ${address}\n` +
      `কাস্টমার নোট: ${note}\n` +
      `প্রোডাক্ট: ${productName}\n` +
      `প্রোডাক্ট মূল্য: ${productPrice}৳\n` +
      `ডেলিভারি চার্জ: ${delivery_charge}৳\n` +
      `মোট: ${totalPrice}৳`;

    // ---------- Customer Search ----------
    let customerId = null;
    const fallbackEmail = `${digits}@noemail.com`;

    const searchQueries = [
      `phone:${fixedPhone}`,
      `phone:${digits}`,
      `email:${fallbackEmail}`
    ];

    for (let q of searchQueries) {
      const s = await shopifyFetch(
        `/admin/api/2025-01/customers/search.json?query=${encodeURIComponent(q)}`,
        { method: "GET" }
      );
      if (s.ok && s.json.customers?.length) {
        customerId = s.json.customers[0].id;
        break;
      }
    }

    // ---------- Create Customer If Not Exists ----------
    if (!customerId) {
      const newCustomer = {
        customer: {
          first_name: name,
          email: fallbackEmail,
          phone: fixedPhone,
          addresses: [
            {
              first_name: name,
              address1: address,
              phone: fixedPhone,
              country: "Bangladesh"
            }
          ]
        }
      };

      const createRes = await shopifyFetch(`/admin/api/2025-01/customers.json`, {
        method: "POST",
        body: JSON.stringify(newCustomer)
      });

      if (!createRes.ok) {
        return res.status(500).json({ error: "Customer create failed", details: createRes.json });
      }

      customerId = createRes.json.customer.id;
    }

    // ---------- Create Order ----------
    const orderPayload = {
      order: {
        customer_id: customerId,
        email: fallbackEmail,
        phone: fixedPhone,
        note: fullNote,
        tags: `LandingPage, Delivery-${delivery_charge}`,

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],

        shipping_address: {
          first_name: name,
          address1: address,
          phone: fixedPhone,
          country: "Bangladesh"
        },

        billing_address: {
          first_name: name,
          address1: address,
          phone: fixedPhone,
          country: "Bangladesh"
        },

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge).toFixed(2),
            code: "CUSTOM_DELIVERY"
          }
        ],

        financial_status: "pending"
      }
    };

    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order create failed", details: orderRes.json });
    }

    return res.status(200).json({
      success: true,
      order: orderRes.json.order
    });

  } catch (err) {
    return res.status(500).json({ error: "Server Error", details: String(err) });
  }
}
