import { buffer } from "micro";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const rawBody = (await buffer(req)).toString();
    const data = JSON.parse(rawBody);

    const { name, phone, address, note, delivery, variant_id } = data;

    if (!name || !phone || !address || !variant_id) {
      return res.status(400).json({
        success: false,
        error: "Required fields missing!",
      });
    }

    const store = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API;

    const orderPayload = {
      order: {
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1,
          },
        ],
        shipping_lines: [
          {
            price: delivery,
            title: "Delivery Charge",
          },
        ],
        customer: {
          first_name: name,
          phone: phone,
        },
        billing_address: {
          address1: address,
          phone: phone,
          first_name: name,
        },
        shipping_address: {
          address1: address,
          phone: phone,
          first_name: name,
        },
        tags: "LP-Order",
        note: note || "",
        financial_status: "pending",
      },
    };

    const response = await fetch(
      `https://${store}/admin/api/2024-10/orders.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      }
    );

    const shopifyRes = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: shopifyRes,
      });
    }

    return res.status(200).json({
      success: true,
      order: shopifyRes.order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
