const allowedOrigins = process.env.ALLOWED_ORIGIN.split(",");

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // আপনার নিচের Shopify order create কোড এখানে যাবে...
}

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body;

    // Format delivery charge properly
    const chargeFormatted = `${Number(delivery_charge).toFixed(2)}`;

    // Combine for Shopify Note
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
        email: `${phone}@noemail.com`,
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
            price: chargeFormatted,
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
