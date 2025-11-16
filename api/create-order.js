export default async function handler(req, res) {
  // --- CORS FIX ---
  res.setHeader("Access-Control-Allow-Origin", "https://comillastore.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { name, phone, address, note, variant_id, delivery_charge, product_price } = req.body;

    const totalPrice = Number(product_price) + Number(delivery_charge);

    const orderPayload = {
      order: {
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],
        customer: {
          first_name: name
        },
        billing_address: {
          address1: address,
          phone: phone,
          first_name: name
        },
        shipping_address: {
          address1: address,
          phone: phone,
          first_name: name
        },
        note: note,
        financial_status: "pending",
        tags: `Custom-Order, DeliveryCharge-${delivery_charge}`,
        shipping_lines: [
          {
            price: delivery_charge,
            title: "Delivery Charge"
          }
        ]
      }
    };

    const response = await fetch(
      "https://1jq6bu-kr.myshopify.com/admin/api/2025-01/orders.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(orderPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("Shopify Error:", data);
      return res.status(500).json({ error: "Shopify Error", details: data });
    }

    return res.status(200).json({ success: true, order: data });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "Server Error" });
  }
}
