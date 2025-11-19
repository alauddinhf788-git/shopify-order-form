// /api/create-order.js

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function shopifyFetch(path, opts = {}) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01${path}`;
  const headers = {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 11) {
      return res.status(400).json({ error: "Phone number must be at least 11 digits" });
    }

    // get variant
    const variantRes = await shopifyFetch(`/variants/${variant_id}.json`);
    if (!variantRes.ok) {
      return res.status(500).json({ error: "Variant fetch failed", details: variantRes.json });
    }

    const variant = variantRes.json.variant;
    const productName = variant.title;
    const productPrice = Number(variant.price);
    const totalPrice = productPrice + Number(delivery_charge);

    // Note content
    const fullNote =
      `🔥 Landing Page Order\nনাম: ${name}\nফোন: ${digits}\nঠিকানা: ${address}\nকাস্টমার নোট: ${note}\nপ্রোডাক্ট: ${productName}\nপ্রোডাক্ট মূল্য: ${productPrice}৳\nডেলিভারি চার্জ: ${delivery_charge}৳\nমোট: ${totalPrice}৳\nSource: Web-Landing`;

    // Create Shopify Order
    const orderRes = await shopifyFetch(`/orders.json`, {
      method: "POST",
      body: JSON.stringify({
        order: {
          note: fullNote,
          financial_status: "pending",
          phone: digits,
          line_items: [{ variant_id: Number(variant_id), quantity: 1 }],
          shipping_lines: [{ title: "Delivery Charge", price: delivery_charge }],
          shipping_address: {
            first_name: name,
            phone: digits,
            address1: address,
            country: "Bangladesh",
          },
        },
      }),
    });

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order failed", details: orderRes.json });
    }

    return res.status(200).json({ success: true, order: orderRes.json.order });

  } catch (e) {
    console.error("SERVER ERROR", e);
    return res.status(500).json({ error: "Server crashed" });
  }
}
