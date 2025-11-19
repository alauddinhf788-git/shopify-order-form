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
    ...(opts.headers || {}),
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
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { name, phone, address, note, delivery_charge, variant_id } =
      req.body || {};

    // Basic validation
    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 11) {
      return res
        .status(400)
        .json({ error: "Phone number must be at least 11 digits" });
    }

    // name → first + last
    const parts = name.trim().split(" ");
    const firstName = parts[0] || name;
    const lastName = parts.slice(1).join(" ") || "-";

    const rawPhone = digits;

    // Get variant info
    const variantRes = await shopifyFetch(
      `/admin/api/2025-01/variants/${variant_id}.json`,
      { method: "GET" }
    );

    if (!variantRes.ok) {
      return res
        .status(500)
        .json({ error: "Failed to fetch variant info", details: variantRes.json });
    }

    const variant = variantRes.json.variant;
    const productName = variant.title || "Product";
    const productPrice = Number(variant.price || 0);
    const totalPrice = productPrice + Number(delivery_charge || 0);

    // Full note (যেটা তুমি আগের মত চাচ্ছ)
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

    const orderPayload = {
      order: {
        note: fullNote,
        tags: `LandingPage, Delivery-${delivery_charge}`,
        financial_status: "pending",

        // 📞 টপ-লেভেল phone (কিছু অ্যাপ এটা ব্যবহার করে)
        phone: rawPhone,

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1,
          },
        ],

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge).toFixed(2),
            code: "CUSTOM_DELIVERY",
          },
        ],

        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          phone: rawPhone,
          address1: address,
          country: "Bangladesh",
        },

        billing_address: {
          first_name: firstName,
          last_name: lastName,
          phone: rawPhone,
          address1: address,
          country: "Bangladesh",
        },
      },
    };

    // Create order in Shopify
    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      return res
        .status(500)
        .json({ error: "Order create failed", details: orderRes.json });
    }

    return res.status(200).json({ success: true, order: orderRes.json.order });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server Error", details: String(err) });
  }
}
