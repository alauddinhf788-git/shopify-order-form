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
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body || {};

    // Required fields
    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Phone Validation (11+ digits)
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 11) {
      return res.status(400).json({ error: "Phone number must be at least 11 digits" });
    }

    const rawPhone = phone;

    // Fetch Variant Info
    const variantRes = await shopifyFetch(`/admin/api/2025-01/variants/${variant_id}.json`, { method: "GET" });

    if (!variantRes.ok) {
      return res.status(500).json({ error: "Failed to fetch variant info", details: variantRes.json });
    }

    const variant = variantRes.json.variant;
    const productName = variant.title || "Product";
    const productPrice = Number(variant.price || 0);
    const totalPrice = productPrice + Number(delivery_charge || 0);

    // Clean + SteadFast Friendly NOTE format
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

    // Order Payload WITHOUT source_name
    const orderPayload = {
      order: {
        tags: `LandingPage, AutoSync-SF, Delivery-${delivery_charge}`,

        note: fullNote,

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
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

    // Create order
    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order create failed", details: orderRes.json });
    }

    return res.status(200).json({ success: true, order: orderRes.json.order });

  } catch (err) {
    return res.status(500).json({ error: "Server Error", details: String(err) });
  }
}
