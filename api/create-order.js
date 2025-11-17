// ✅ CORS
const allowedOrigins = process.env.ALLOWED_ORIGIN.split(",");

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { name, phone, address, note, delivery_charge, variant_id } = req.body;

    // ⭐ FIX PHONE
    let fixedPhone = phone.trim().replace(/[^0-9]/g, "");
    if (fixedPhone.startsWith("0")) fixedPhone = "+88" + fixedPhone;
    else if (fixedPhone.startsWith("1")) fixedPhone = "+880" + fixedPhone;

    // ⭐ NOTE FORMAT
    const fullNote = `
নাম: ${name}
ফোন: ${phone}
ঠিকানা: ${address}
নোট: ${note}
ডেলিভারি চার্জ: ${delivery_charge}৳
    `.trim();

    // --------------------------------------------------
    // ⭐ STEP 1 → CREATE SHOPIFY CUSTOMER
    // --------------------------------------------------
    const customerPayload = {
      customer: {
        first_name: name,
        phone: fixedPhone,
        email: `${phone}@noemail.com`,
        addresses: [
          {
            address1: address,
            phone: fixedPhone,
            first_name: name,
            country: "Bangladesh"
          }
        ]
      }
    };

    const customerRes = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/customers.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(customerPayload)
      }
    );

    const customerData = await customerRes.json();

    let customerId;

    // যদি Customer আগে থেকে থাকে – Shopify Error দেয় → তখন Fetch by Phone
    if (!customerRes.ok) {
      const existing = await fetch(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/customers/search.json?query=phone:${fixedPhone}`,
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          }
        }
      );

      const exData = await existing.json();
      customerId = exData.customers.length ? exData.customers[0].id : null;
    } else {
      customerId = customerData.customer.id;
    }

    // --------------------------------------------------
    // ⭐ STEP 2 → CREATE ORDER WITH CUSTOMER ID
    // --------------------------------------------------
    const orderPayload = {
      order: {
        customer_id: customerId,

        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],

        shipping_address: {
          first_name: name,
          phone: fixedPhone,
          address1: address,
          country: "Bangladesh"
        },

        billing_address: {
          first_name: name,
          phone: fixedPhone,
          address1: address,
          country: "Bangladesh"
        },

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: Number(delivery_charge),
            code: "CUSTOM_DELIVERY"
          }
        ],

        note: fullNote,
        tags: `LandingPage, Delivery-${delivery_charge}`,
        financial_status: "pending"
      }
    };

    const orderRes = await fetch(
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

    const orderData = await orderRes.json();

    return res.status(200).json({
      success: true,
      order: orderData.order
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server Error" });
  }
}
