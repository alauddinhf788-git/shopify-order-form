// api/create-order.js
// Vercel Node serverless (Next.js API style). Uses default bodyParser (JSON).

export const config = {
  api: {
    bodyParser: true
  }
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Only POST allowed" });

  try {
    const {
      name,
      phone,
      address,
      note,
      delivery,
      variant_id,
      product_title,
      product_price
    } = req.body || {};

    // Basic validation
    if (!name || !phone || !address || !delivery || !variant_id) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Env vars (set these in Vercel: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API)
    const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
    const TOKEN = process.env.SHOPIFY_ADMIN_API || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN;

    if (!SHOP || !TOKEN) {
      return res.status(500).json({ success: false, error: "Server misconfiguration: SHOPIFY_STORE_DOMAIN or admin token missing" });
    }

    // Normalize phone: ensure starts with +880 if looks like Bangladesh local
    let normalizedPhone = String(phone).trim();
    const digits = normalizedPhone.replace(/\D/g,'');
    if (digits.length === 11 && digits.startsWith("01")) {
      normalizedPhone = "+880" + digits.slice(1);
    } else if (digits.length === 13 && digits.startsWith("880")) {
      normalizedPhone = "+" + digits;
    } else if (normalizedPhone.startsWith("+")) {
      // assume ok
    } else {
      // fallback to digits-only
      normalizedPhone = digits;
    }

    // Build Shopify order payload
    // We'll NOT create a separate 'customer' record to avoid duplicate-phone conflicts.
    const orderPayload = {
      order: {
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1,
            // optional: price override
            // price: Number(product_price).toFixed(2)
          }
        ],
        billing_address: {
          first_name: name,
          phone: normalizedPhone,
          address1: address,
          country: "Bangladesh"
        },
        shipping_address: {
          first_name: name,
          phone: normalizedPhone,
          address1: address,
          country: "Bangladesh"
        },
        note: note || "",
        tags: ["Landing Page Order"],
        financial_status: "pending",
        payment_gateway_names: ["Cash on Delivery"],
        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery).toFixed(2),
            code: "DELIVERY_FEE",
            source: "custom"
          }
        ]
      }
    };

    // If product_title/product_price provided and you WANT a separate "Delivery" line as product,
    // you could also push an additional line_items entry; but shipping_lines is the correct approach
    // to show shipping + include in totals.

    const shopifyUrl = `https://${SHOP}/admin/api/2024-10/orders.json`;

    const shopifyRes = await fetch(shopifyUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(orderPayload)
    });

    const shopifyData = await shopifyRes.json();

    if (!shopifyRes.ok) {
      // return error details for easier debugging
      return res.status(shopifyRes.status || 500).json({ success: false, error: shopifyData || "Shopify API error" });
    }

    // Success
    return res.status(200).json({ success: true, order: shopifyData.order || shopifyData });

  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
