// /api/shopify-order-paid.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const order = req.body;

    // ✅ Paid order check
    if (!order || order.financial_status !== "paid") {
      return res.status(200).json({ skipped: true });
    }

    // 🔑 TikTok required data
    const eventTime = Math.floor(Date.now() / 1000);

    const payload = {
      pixel_code: process.env.TIKTOK_PIXEL_ID,
      event: "Purchase",
      timestamp: eventTime,
      event_id: String(order.id), // 🔁 Deduplication key
      context: {
        page: {
          url: order.order_status_url || "",
        },
        user: {
          external_id: order.customer?.id
            ? String(order.customer.id)
            : String(order.email || order.phone || order.id),
        },
      },
      properties: {
        currency: order.currency || "BDT",
        value: parseFloat(order.total_price || 0),
        contents: order.line_items?.map(item => ({
          content_id: String(item.product_id),
          content_type: "product",
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
      },
    };

    // 🚀 Send to TikTok Events API
    const tiktokRes = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": process.env.TIKTOK_ACCESS_TOKEN,
        },
        body: JSON.stringify(payload),
      }
    );

    const tiktokData = await tiktokRes.json();

    console.log("TikTok response:", tiktokData);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
