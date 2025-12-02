// /api/get-order.js

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
  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({ error: "order_id missing" });
  }

  const orderRes = await shopifyFetch(`/admin/api/2025-01/orders/${order_id}.json`, {
    method: "GET"
  });

  if (!orderRes.ok) {
    return res.status(500).json({ error: "Failed to fetch order", details: orderRes.json });
  }

  return res.status(200).json({ success: true, order: orderRes.json.order });
}
