// /api/get-order.js

// Load allowed origins from ENV
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Shopify Fetch Helper
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
  const origin = req.headers.origin || "";

  // CORS SETUP
  if (allowedOrigins.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*"); // Dev mode fallback
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET allowed" });

  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: "order_id missing" });

  try {
    const orderRes = await shopifyFetch(`/admin/api/2025-01/orders/${order_id}.json`, {
      method: "GET",
    });

    if (!orderRes.ok) {
      return res.status(500).json({
        error: "Failed to fetch order",
        details: orderRes.json,
      });
    }

    return res.status(200).json({
      success: true,
      order: orderRes.json.order,
    });
  } catch (err) {
    console.error("get-order ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      details: String(err),
    });
  }
}
