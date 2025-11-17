// /api/create-order.js
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  const origin = req.headers.origin || "";

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    // basic validation
    if (!variant_id) return res.status(400).json({ error: "variant_id required" });
    if (!name || !phone || !address) return res.status(400).json({ error: "name, phone, address required" });

    // Format delivery charge to two decimals (Shopify expects price format)
    const chargeFormatted = Number(delivery_charge || 0).toFixed(2);

    // Compose a clear order note
    const fullNote = [
      `নাম: ${name}`,
      `ফোন: ${phone}`,
      `ঠিকানা: ${address}`,
      `কাস্টমার নোট: ${note || "-"}`,
      `ডেলিভারি চার্জ: ${Number(delivery_charge || 0)}৳`
    ].join("\n");

    // Build Shopify order payload
    const orderPayload = {
      order: {
        email: `${phone}@noemail.example`, // dummy unique email
        phone: String(phone),
        customer: {
          first_name: String(name),
          phone: String(phone),
          addresses: [
            {
              first_name: String(name),
              phone: String(phone),
              address1: String(address)
            }
          ]
        },
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],
        billing_address: {
          first_name: String(name),
          phone: String(phone),
          address1: String(address)
        },
        shipping_address: {
          first_name: String(name),
          phone: String(phone),
          address1: String(address)
        },
        note: fullNote,
        tags: `LandingPage`,
        financial_status: "pending",
        shipping_lines: [
          {
            title: "Delivery Charge",
            price: chargeFormatted
          }
        ]
      }
    };

    // Call Shopify Admin API (use your env names)
    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN; // e.g. 1jq6bu-kr.myshopify.com
    const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN; // your token

    const apiUrl = `https://${shopDomain}/admin/api/2025-01/orders.json`;

    const shopifyRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken
      },
      body: JSON.stringify(orderPayload)
    });

    const shopifyData = await shopifyRes.json();

    if (!shopifyRes.ok) {
      console.error("Shopify API error:", shopifyData);
      return res.status(500).json({ error: "Shopify API error", details: shopifyData });
    }

    // Success — return order id back
    return res.status(200).json({ success: true, order_id: shopifyData.order?.id || null, order: shopifyData.order });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
}
