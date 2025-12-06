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

// ✅ NEW: Client IP Helper (২৪ ঘন্টার ব্লকের জন্য)
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (Array.isArray(xf)) return xf[0];
  if (typeof xf === "string") return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
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

    // ✅ NEW: 24 Hour Block Check (Phone + IP)
    const clientIp = getClientIp(req);
    const createdAtMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentRes = await shopifyFetch(
      `/admin/api/2025-01/orders.json?status=any&created_at_min=${encodeURIComponent(createdAtMin)}&fields=id,created_at,shipping_address,billing_address,note,browser_ip&limit=50`,
      { method: "GET" }
    );

    if (recentRes.ok && recentRes.json?.orders) {
      const blocked = recentRes.json.orders.some((o) => {
        const sp = o.shipping_address?.phone?.replace(/\D/g, "") || "";
        const bp = o.billing_address?.phone?.replace(/\D/g, "") || "";

        let np = "";
        if (o.note) {
          const m = o.note.match(/ফোন[:\- ]*([0-9+\-\s]+)/i);
          if (m && m[1]) np = m[1].replace(/\D/g, "");
        }

        const phoneMatch =
          (sp && sp === rawPhone) ||
          (bp && bp === rawPhone) ||
          (np && np === rawPhone);

        const ipMatch =
          clientIp &&
          o.browser_ip &&
          String(o.browser_ip).trim() === String(clientIp).trim();

        return phoneMatch || ipMatch;
      });

      if (blocked) {
        return res.status(429).json({
          error_code: "ORDER_LIMIT_24H",
          message: "২৪ ঘন্টার মধ্যে একই মোবাইল দিয়ে দুইবার অর্ডার করা যাবে না! হোয়াটসঅ্যাপ: 01764315836"
        });
      }
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

    // Full order note message (UNCHANGED)
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
        line_items: [{ variant_id: Number(variant_id), quantity: 1 }],
        shipping_lines: [{ title: "Delivery Charge", price: Number(delivery_charge).toFixed(2) }],
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
        browser_ip: clientIp   // ✅ NEW (Only this added)
      }
    };

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
