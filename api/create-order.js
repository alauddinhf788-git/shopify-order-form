export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const {
      name,
      phone,
      address,
      product_title,
      product_price,
      delivery_charge
    } = req.body;

    // Phone validation (must be ≥ 11 digits)
    if (!phone || phone.length < 11) {
      return res.status(400).json({
        success: false,
        message: "ফোন নাম্বার সঠিক নয় (কমপক্ষে ১১ ডিজিট হতে হবে)"
      });
    }

    const totalPrice = Number(product_price) + Number(delivery_charge);

    const orderPayload = {
      order: {
        line_items: [
          {
            title: product_title,
            quantity: 1,
            price: totalPrice.toString()
          }
        ],
        shipping_address: {
          first_name: name,
          address1: address,
          phone: phone,
          country: "Bangladesh"
        },
        billing_address: {
          first_name: name,
          address1: address,
          phone: phone,
          country: "Bangladesh"
        },
        note: `Phone: ${phone} | Address: ${address} | Delivery Charge: ${delivery_charge}`,
        financial_status: "pending"
      }
    };

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API
        },
        body: JSON.stringify(orderPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    res.status(200).json({
      success: true,
      message: "Order created successfully!",
      order: data.order
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
