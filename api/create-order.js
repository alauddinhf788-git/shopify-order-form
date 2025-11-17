export default async function handler(req, res) {
  // CORS SETTINGS
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body;

    // ⭐ Combined Note for Shopify Order
    const fullNote = `
নাম: ${name}
ফোন: ${phone}
ঠিকানা: ${address}
কাস্টমার নোট: ${note}
ডেলিভারি চার্জ: ${delivery_charge}৳
    `;

    // FINAL ORDER PAYLOAD
    const orderPayload = {
      order: {
        email: `${phone}@noemail.com`, // Dummy email (required field)
        phone: phone,

        customer: {
          first_name: name,
          phone: phone,
          addresses: [
            {
              address1: address,
              phone: phone,
              first_name: name
            }
          ]
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

        note: fullNote.trim(),

        tags: `LandingPage, Delivery-${delivery_charge}`,

        financial_status: "pending",

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: String(delivery_charge),
            code: "CUSTOM_DELIVERY"
          }
        ]
      }
    };

    // CALL SHOPIFY API
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
      order: data.order,
      order_id: data.order.id
    });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: "Server failed" });
  }
}
