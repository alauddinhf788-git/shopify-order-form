// ✅ CORS SETTINGS
const allowedOrigins = process.env.ALLOWED_ORIGIN.split(",");

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body;

    // -----------------------------
    // ⭐ FIX PHONE FOR SHOPIFY
    // -----------------------------
    let fixedPhone = phone.trim().replace(/[^0-9]/g, "");
    if (fixedPhone.startsWith("0")) fixedPhone = "+88" + fixedPhone;
    else if (fixedPhone.startsWith("1")) fixedPhone = "+880" + fixedPhone;

    // -----------------------------
    // ⭐ FORMAT NOTE
    // -----------------------------
    const fullNote = `
নাম: ${name}
ফোন: ${phone}
ঠিকানা: ${address}
অর্ডার নোট: ${note}
ডেলিভারি চার্জ: ${delivery_charge}৳
    `.trim();

    // -----------------------------
    // ⭐ FINAL SHOPIFY ORDER PAYLOAD
    // -----------------------------
    const orderPayload = {
      order: {
        email: `${phone}@noemail.com`,
        phone: fixedPhone,

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],

        shipping_address: {
          name: name,
          phone: fixedPhone,
          address1: address,
          country: "BD"
        },

        billing_address: {
          name: name,
          phone: fixedPhone,
          address1: address,
          country: "BD"
        },

        note: fullNote,

        tags: `LandingPage, Delivery-${delivery_charge}`,

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge),
            code: "CUSTOM_DELIVERY"
          }
        ],

        financial_status: "pending"
      }
    };

    // -----------------------------
    // 🔥 SEND TO SHOPIFY
    // -----------------------------
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
      console.log("❌ Shopify Error:", data);
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({
      success: true,
      order: data.order,
      order_id: data.order.id
    });

  } catch (err) {
    console.error("🔥 SERVER ERROR:", err);
    return res.status(500).json({ error: "Server failed" });
  }
}
