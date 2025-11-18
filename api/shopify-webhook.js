// /api/shopify-webhook.js

import crypto from "crypto";

// Vercel requires raw body for Shopify webhook HMAC
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper: Read raw request body (required for HMAC check)
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Step 1 — Raw body
    const rawBody = await readRawBody(req);

    // Step 2 — Verify HMAC Signature
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

    const generatedHash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    if (generatedHash !== hmacHeader) {
      return res.status(401).json({ error: "Unauthorized - HMAC Mismatch" });
    }

    // Step 3 — Parse Shopify Order JSON
    const order = JSON.parse(rawBody.toString());

    console.log("📦 Shopify Webhook Received Order:", order.id);

    // Extract fields created in create-order.js
    const name = order.shipping_address?.first_name || "";
    const phone = order.shipping_address?.phone || "";
    const address = order.shipping_address?.address1 || "";
    const note = order.note || "";
    const deliveryCharge = order.shipping_lines?.[0]?.price || 0;

    // Line item (first product)
    const lineItem = order.line_items?.[0];
    const productName = lineItem?.title || "Product";
    const quantity = lineItem?.quantity || 1;

    // Step 4 — Prepare Steadfast Payload
    const payload = {
      invoice: String(order.id),
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      cod_amount: Number(order.total_price),   // COD = Shopify মোট দাম
      note: note,                               // তোমার তৈরি করা detail NOTE
      product_details: `${productName} x${quantity}`,
      delivery_area: "Dhaka",
      pickup_address: "Default Pickup",        // চাইলে ভবিষ্যতে পরিবর্তন করা যাবে
    };

    console.log("🚚 Sending To Steadfast:", payload);

    // Step 5 — Send To Steadfast API
    const response = await fetch(process.env.STEADFAST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.STEADFAST_API_KEY,
        "secret-key": process.env.STEADFAST_SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });

    const sfRes = await response.json();
    console.log("✅ Steadfast Response:", sfRes);

    return res.status(200).json({ success: true, sent_to_steadfast: sfRes });

  } catch (err) {
    console.error("Webhook Error:", err);
    return res.status(500).json({ error: "Webhook Processing Failed", details: String(err) });
  }
}
