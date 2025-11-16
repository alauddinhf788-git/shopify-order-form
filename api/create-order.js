// api/create-order.js
export default async function handler(req, res) {
  // Allow CORS for your storefront(s)
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN,               // e.g. https://comillastore.com
    process.env.ALLOWED_ORIGIN_WWW || null    // optional: https://www.comillastore.com
  ].filter(Boolean);

  const origin = req.headers.origin || "";
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  // allow credentials only if you need them (not needed here)
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      name,
      phone,
      address,
      note,
      variant_id,
      delivery_charge,   // string or number
      product_price      // string or number (unit price)
    } = req.body;

    // basic validation
    if (!variant_id) {
      return res.status(400).json({ error: "variant_id is required" });
    }

    // build order payload for Shopify

    const orderPayload = {
  order: {
    line_items: [
      {
        variant_id: Number(variant_id),
        quantity: 1
      }
    ],
    billing_address: {
      first_name: name,
      phone: phone,
      address1: address
    },
    shipping_address: {
      first_name: name,
      phone: phone,
      address1: address
    },
    note: note,
    tags: `LandingPage, Delivery-${delivery_charge}`,
    email: `${phone}@example.com`,  // Shopify requires unique email for customer
    financial_status: "pending",

    shipping_lines: [
      {
        title: "Delivery Charge",
        price: String(delivery_charge)
      }
    ]
  }
};


    // Use the API version supported by your store; per your screenshots use 2025-10
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const adminToken = process.env.SHOPIFY_ADMIN_API;
    const apiUrl = `https://${storeDomain}/admin/api/2025-10/orders.json`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Shopify API error:", response.status, data);
      return res.status(500).json({ error: "Shopify API error", details: data });
    }

    // success
    return res.status(200).json({ success: true, order: data.order });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
}
