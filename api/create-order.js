// /api/create-order.js

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (Array.isArray(xf)) return xf[0];
  if (typeof xf === "string") return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
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
    const { name, phone, address, note, delivery_charge, variant_id, device_fp } = req.body || {};

    if (!name || !phone || !address || !note || !variant_id || !device_fp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length < 11) {
      return res.status(400).json({ error: "Invalid phone" });
    }

    const clientIp = getClientIp(req);

    // ✅ STRONG 24H BLOCK (PHONE + IP + DEVICE)
    const createdAtMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentRes = await shopifyFetch(
      `/admin/api/2025-01/orders.json?status=any&created_at_min=${encodeURIComponent(createdAtMin)}&fields=id,shipping_address,billing_address,note,browser_ip&limit=50`,
      { method: "GET" }
    );

    if (recentRes.ok && recentRes.json?.orders) {
      const blocked = recentRes.json.orders.some((o) => {
        const sp = o.shipping_address?.phone?.replace(/\D/g, "") || "";
        const bp = o.billing_address?.phone?.replace(/\D/g, "") || "";

        let np = "";
        let df = "";
        if (o.note) {
          const m1 = o.note.match(/ফোন[:\- ]*([0-9+\-\s]+)/i);
          if (m1 && m1[1]) np = m1[1].replace(/\D/g, "");
          const m2 = o.note.match(/DEVICE_FP:([a-zA-Z0-9_\-]+)/i);
          if (m2 && m2[1]) df = m2[1];
        }

        const phoneMatch = sp === rawPhone || bp === rawPhone || np === rawPhone;
        const ipMatch = clientIp && o.browser_ip === clientIp;
        const deviceMatch = df && df === device_fp;

        return phoneMatch || ipMatch || deviceMatch;
      });

      if (blocked) {
        return res.status(429).json({
          error_code: "ORDER_LIMIT_24H",
          message: "২৪ ঘন্টার মধ্যে একই ডিভাইস, মোবাইল নাম্বার অথবা আইপি দিয়ে আবার অর্ডার করা যাবে না!"
        });
      }
    }

    const variantRes = await shopifyFetch(`/admin/api/2025-01/variants/${variant_id}.json`);
    if (!variantRes.ok) {
      return res.status(500).json({ error: "Variant fetch failed" });
    }

    const productPrice = Number(variantRes.json.variant.price);
    const totalPrice = productPrice + Number(delivery_charge);

    const fullNote =
      `🔥 Landing Page Order\n` +
      `নাম: ${name}\n` +
      `ঠিকানা: ${address}\n` +
      `ফোন: ${rawPhone}\n` +
      `মোট: ${totalPrice}৳\n` +
      `প্রোডাক্টের কোড: ${note}\n` +
      `প্রোডাক্ট মূল্য: ${productPrice}৳\n` +
      `ডেলিভারি চার্জ: ${delivery_charge}৳\n` +
      `DEVICE_FP:${device_fp}\n";

    const orderPayload = {
      order: {
        note: fullNote,
        source_identifier: "landing-page",
        tags: `LandingPage, Delivery-${delivery_charge}`,
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
        browser_ip: clientIp
      }
    };

    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    if (!orderRes.ok) {
      return res.status(500).json({ error: "Order failed" });
    }

    return res.status(200).json({ success: true, order: orderRes.json.order });

  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
