// /api/create-order.js

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// --------------------
// 24 Hour Block Store (Memory)
// --------------------
const BLOCK_24H = global.BLOCK_24H || new Map();
global.BLOCK_24H = BLOCK_24H;

function isBlocked(key) {
  const t = BLOCK_24H.get(key);
  if (!t) return false;
  if (Date.now() - t > 24 * 60 * 60 * 1000) {
    BLOCK_24H.delete(key);
    return false;
  }
  return true;
}

function setBlock(key) {
  BLOCK_24H.set(key, Date.now());
}

// --------------------
// Shopify Fetch Helper
// --------------------
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

  // --------------------
  // CORS
  // --------------------
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
const { name, phone, address, note, delivery_charge, variant_id, ttclid, tiktok_event_id } =
  req.body || {};

    if (!name || !phone || !address || !note || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length < 11) {
      return res.status(400).json({ error: "Phone must be at least 11 digits" });
    }

    // --------------------
    // IP + Device
    // --------------------
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress;

    const device = req.headers["user-agent"] || "unknown-device";

    const ipKey = `ip:${ip}`;
    const phoneKey = `phone:${rawPhone}`;
    const deviceKey = `device:${device}`;

    if (isBlocked(ipKey) || isBlocked(phoneKey) || isBlocked(deviceKey)) {
      return res.status(429).json({
        error: "24H_BLOCK",
        message:
          "২৪ ঘন্টার মধ্যে একই ডিভাইস, আইপি অথবা ফোন নাম্বার দিয়ে পুনরায় অর্ডার করা যাবে না"
      });
    }

    // --------------------
    // Fetch Variant
    // --------------------
    const variantRes = await shopifyFetch(
      `/admin/api/2025-01/variants/${variant_id}.json`,
      { method: "GET" }
    );

    if (!variantRes.ok) {
      return res.status(500).json({ error: "Failed to fetch variant" });
    }

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

    // --------------------
    // Create Order
    // --------------------
    const orderPayload = {
      order: {
        note: fullNote,
        source_identifier: "landing-page",
        tags: `LandingPage, AutoSync-Manual, Delivery-${delivery_charge}`,
        financial_status: "pending",

        customer: {
          first_name: name,
          phone: rawPhone,
          email: `${rawPhone}@auto.customer`
        },

        line_items: [{ variant_id: Number(variant_id), quantity: 1 }],
        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge).toFixed(2)
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
        }
      }
    };

    const orderRes = await shopifyFetch(
      `/admin/api/2025-01/orders.json`,
      {
        method: "POST",
        body: JSON.stringify(orderPayload)
      }
    );

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order failed" });
    }

    const orderId = orderRes.json.order.id;
    const eventId = "order_" + orderId;
    const eventTime = Math.floor(Date.now() / 1000);

    // --------------------
    // FACEBOOK CAPI — PURCHASE
    // --------------------
    try {
      await fetch(
        `https://graph.facebook.com/v18.0/${process.env.FB_PIXEL_ID}/events?access_token=${process.env.FB_CAPI_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [
              {
                event_name: "Purchase",
                event_time: eventTime,
                event_id: eventId,
                action_source: "website",
                user_data: {
                  ph: rawPhone,
                  client_ip_address: ip,
                  client_user_agent: device
                },
                custom_data: {
                  currency: "BDT",
                  value: totalPrice
                }
              }
            ]
          })
        }
      );
    } catch (e) {
      console.error("FB CAPI ERROR:", e);
    }

    // --------------------
    // TIKTOK EVENTS API — PURCHASE
    // --------------------
    try {
await fetch(
  "https://business-api.tiktok.com/open_api/v1.3/event/track/",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": process.env.TIKTOK_ACCESS_TOKEN
    },
    body: JSON.stringify({
      pixel_code: process.env.TIKTOK_PIXEL_ID,
      event: "Purchase",
      event_id: tiktok_event_id,
      timestamp: eventTime,
      properties: {
        value: totalPrice,
        currency: "BDT",
        ttclid: ttclid || undefined
      }
    })
  }
);
    } catch (e) {
      console.error("TIKTOK API ERROR:", e);
    }

    // --------------------
    // Apply 24h Block
    // --------------------
    setBlock(ipKey);
    setBlock(phoneKey);
    setBlock(deviceKey);

    return res.status(200).json({
      success: true,
      order: orderRes.json.order
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
