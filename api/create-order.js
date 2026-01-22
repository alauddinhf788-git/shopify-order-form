// /api/create-order.js

// ====================
// 24H BLOCK ENABLE FLAG
// ====================
const ENABLE_24H_BLOCK = true;

// ============================
// 24 Hour Block System (ISOLATED)
// ============================
const BLOCK_24H = global.BLOCK_24H || new Map();
global.BLOCK_24H = BLOCK_24H;

function isBlocked(key) {
  if (!ENABLE_24H_BLOCK) return false;
  const t = BLOCK_24H.get(key);
  if (!t) return false;
  if (Date.now() - t > 24 * 60 * 60 * 1000) {
    BLOCK_24H.delete(key);
    return false;
  }
  return true;
}

function setBlock(key) {
  if (!ENABLE_24H_BLOCK) return;
  BLOCK_24H.set(key, Date.now());
}

// ====================
// Allowed Origins
// ====================
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ====================
// Shopify Fetch Helper
// ====================
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

// ====================
// TikTok S2S Helper
// ====================
async function sendTikTokPurchase({
  ttclid,
  orderId,
  totalPrice,
  currency = "BDT",
  phone
}) {
  if (!process.env.TIKTOK_PIXEL_ID || !process.env.TIKTOK_ACCESS_TOKEN) return;

  const payload = {
    pixel_code: process.env.TIKTOK_PIXEL_ID,
    event: "Purchase",
    event_id: "order_" + orderId,
    timestamp: Math.floor(Date.now() / 1000),
    context: {
      page: { url: "" },
      user: {
        external_id: phone || orderId,
        client_ttclid: ttclid || undefined
      }
    },
    properties: { value: Number(totalPrice), currency }
  };

  try {
    await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": process.env.TIKTOK_ACCESS_TOKEN
        },
        body: JSON.stringify(payload)
      }
    );
  } catch (err) {
    console.error("TikTok S2S ERROR:", err);
  }
}

// ====================
// Main Handler
// ====================
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
    const {
      name,
      phone,
      address,
      note,
      delivery_charge,
      variant_id,
      ttclid
    } = req.body || {};

    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length < 11) {
      return res.status(400).json({ error: "Phone must be at least 11 digits" });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    const device = req.headers["user-agent"] || "unknown-device";

    const ipKey = `ip:${ip}`;
    const phoneKey = `phone:${rawPhone}`;
    const deviceKey = `device:${device}`;

    if (isBlocked(ipKey) || isBlocked(phoneKey) || isBlocked(deviceKey)) {
      return res.status(429).json({
        error: "24H_BLOCK",
        message: "২৪ ঘন্টার মধ্যে একই ডিভাইস, আইপি অথবা ফোন নাম্বার দিয়ে পুনরায় অর্ডার করা যাবে না"
      });
    }

    const variantRes = await shopifyFetch(`/admin/api/2025-01/variants/${variant_id}.json`, { method: "GET" });
    if (!variantRes.ok) return res.status(500).json({ error: "Failed to fetch variant" });

    const variant = variantRes.json.variant;
    const productName = variant.title;
    const productPrice = Number(variant.price);
    const totalPrice = productPrice + Number(delivery_charge);

    const fullNote =
      `🔥 Landing Page Order\n` +
      `নাম: ${name}\n` +
      `ঠিকানা: ${address}\n` +
      `ফোন: ${rawPhone}\n` +
      `মোট: ${totalPrice}৳\n` +
      `প্রোডাক্টের কোড: ${note}\n` +
      `প্রোডাক্ট: ${productName}\n` +
      `প্রোডাক্ট মূল্য: ${productPrice}৳\n` +
      `ডেলিভারি চার্জ: ${delivery_charge}৳\n`;

    const orderPayload = {
      order: {
        note: fullNote,
        source_identifier: "landing-page",
        tags: `LandingPage, AutoSync-Manual, Delivery-${delivery_charge}`,
        financial_status: "pending",
        customer: { first_name: name, phone: rawPhone, email: `${rawPhone}@auto.customer` },
        line_items: [{ variant_id: Number(variant_id), quantity: 1 }],
        shipping_lines: [{ title: "Delivery Charge", price: Number(delivery_charge).toFixed(2) }],
        shipping_address: { first_name: name, phone: rawPhone, address1: address, country: "Bangladesh" },
        billing_address: { first_name: name, phone: rawPhone, address1: address, country: "Bangladesh" }
      }
    };

    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    if (!orderRes.ok) return res.status(500).json({ error: "Order failed" });

    const orderId = orderRes.json.order.id;

    // Apply 24H Block
    setBlock(ipKey);
    setBlock(phoneKey);
    setBlock(deviceKey);

    // ===============================
    // TikTok S2S Purchase Event
    // ===============================
    await sendTikTokPurchase({ ttclid, orderId, totalPrice, currency: "BDT", phone: rawPhone });

    return res.status(200).json({ success: true, order: orderRes.json.order });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
