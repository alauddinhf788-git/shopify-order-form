import crypto from "crypto";

// Vercel requires raw body for Shopify HMAC verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Only POST allowed");
    }

    // Load ENV
    const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
    const SF_API_KEY = process.env.STEADFAST_API_KEY;
    const SF_URL = process.env.STEADFAST_API_URL;

    // Read raw body
    const rawBody = await readRawBody(req);

    // Verify HMAC
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const calculated = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    if (calculated !== hmacHeader) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // Parse order JSON
    const data = JSON.parse(rawBody.toString("utf8"));

    // Extract order fields
    const orderId = data.id;
    const invoice = data.name;
    const total = Number(data.total_price);

    const shipping = data?.shipping_address || {};
    const customerName = shipping.first_name || "Customer";
    const customerPhone = shipping.phone || "";
    const address = `${shipping.address1 || ""}, ${shipping.city || ""}`;

    const item = data?.line_items?.[0] || {};
    const productName = item.title || "Product";
    const productPrice = Number(item.price) || 0;

    const deliveryCharge =
      Number(data?.shipping_lines?.[0]?.price) || 0;

    // Prepare SteadFast Payload
    const payload = {
      invoice,
      consignee_name: customerName,
      consignee_phone: customerPhone,
      consignee_address: address,
      product_name: productName,
      product_price: productPrice,
      cod_amount: total,
      delivery_charge: deliveryCharge,
      order_id: orderId,
    };

    // Send to SteadFast API
    const sfRes = await fetch(SF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const sfJson = await sfRes.json();

    if (!sfRes.ok) {
      return res.status(500).json({
        error: "SteadFast API failed",
        details: sfJson,
      });
    }

    return res.status(200).json({
      message: "Success",
      steadfast_response: sfJson,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server Error",
      details: err.toString(),
    });
  }
}

