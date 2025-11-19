// /api/create-order.js

// CORS Allowed Domains
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
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

  // CORS CHECK
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

    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length < 11) {
      return res.status(400).json({ error: "Phone must be at least 11 digits" });
    }

    // Fetch product variant information
    const variantRes = await shopifyFetch(`/admin/api/2025-01/variants/${variant_id}.json`, { method: "GET" });

    if (!variantRes.ok) {
      return res.status(500).json({ error: "Failed to fetch variant", details: variantRes.json });
    }

    const variant = variantRes.json.variant;
    const productName = variant.title;
    const productPrice = Number(variant.price);
    const totalPrice = productPrice + Number(delivery_charge);

    // Full order note message
    const fullNote =
      `🔥 Landing Page Order\n` +
      `নাম: ${name}\n` +
      `ফোন: ${rawPhone}\n` +
      `ঠিকানা: ${address}\n` +
      `কাস্টমার নোট: ${note}\n` +
      `প্রোডাক্ট: ${productName}\n` +
      `প্রোডাক্ট মূল্য: ${productPrice}৳\n` +
      `ডেলিভারি চার্জ: ${delivery_charge}৳\n` +
      `মোট: ${totalPrice}৳\n` +
      `Source: Web-Landing`;

    // Payload for Shopify only (No courier send)
    const orderPayload = {
  order: {
    note: fullNote,
    source_name: "web",
    send_receipt: true,
    send_fulfillment_receipt: false,
    tags: `LandingPage, ManualApproval`,
    financial_status: "pending",
    fulfillment_status: null,
    line_items: [{ variant_id: Number(variant_id), quantity: 1 }],
    shipping_lines: [
      { title: "Delivery Charge", price: Number(delivery_charge).toFixed(2) }
    ],
    shipping_address: {
      first_name: name,
      phone: rawPhone,
      address1: address,
      country: "Bangladesh"
    },
    billing_address: {
      first_name: name,
      phone: rawPhone,
      address1: address,
      country: "Bangladesh"
    }
  }
};

    // Create Shopify order
    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order failed", details: orderRes.json });
    }

    return res.status(200).json({ success: true, order: orderRes.json.order });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
}
