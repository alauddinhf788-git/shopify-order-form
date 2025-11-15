// api/create-order.js

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // CORS (allow any origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const {
      name,
      phone,
      address,
      note,
      delivery,
      variant_id,
    } = req.body;

    if (!name || !phone || !address || !delivery || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Shopify credentials
    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API;

    if (!shop || !token) {
      return res.status(500).json({ error: "Missing ENV variables" });
    }

    // Prepare order data
    const orderData = {
      order: {
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],
        customer: {
          first_name: name,
          phone: phone
        },
        billing_address: {
          first_name: name,
          address1: address,
          phone: phone,
        },
        shipping_address: {
          first_name: name,
          address1: address,
          phone: phone,
        },
        note: note ? `${note} | Delivery Charge: ${delivery}` : `Delivery Charge: ${delivery}`,
        tags: `Custom-Order-Form`,
      }
    };

    // Call Shopify Admin API
    const response = await fetch(`https://${shop}/admin/api/2024-10/orders.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: result });
    }

    return res.status(200).json({
      success: true,
      order: result.order
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error: " + err.message
    });
  }
}

