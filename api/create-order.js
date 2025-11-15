import { buffer } from "micro";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    // Read raw body
    const rawBody = (await buffer(req)).toString();

    // Parse JSON
    const data = JSON.parse(rawBody);

    const { name, phone, address, note, delivery, variant_id } = data;

    if (!name || !phone || !address || !variant_id) {
      return res.status(400).json({
        success: false,
        error: "Required fields missing!",
      });
    }

    // Shopify API Credentials
    const store = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API;

    // Convert to proper Shopify format
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

    // Shopify API request
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
