export default async function handler(req, res) {
  // CORS SETTINGS
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
      delivery_charge,
      variant_id
    } = req.body;

    // ORDER PAYLOAD
    const orderPayload = {
      order: {
        customer: {
          first_name: name,
          phone: phone,
        
        },

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],

        billing_address: {
          first_name: name,
          phone: phone,
          address1: address
        },

        shipping_address: {
          first_name: name,
          phone: phone,
          address1: address
        },

        note: note,
        tags: `LandingPage, Delivery-${delivery_charge}`,
        financial_status: "pending",

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: String(delivery_charge)
          }
        ]
      }
    };

    // SHOPIFY API CALL
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(orderPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("Shopify Error:", data);
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({
      success: true,
      order: data
    });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: "Server failed" });
  }
}
