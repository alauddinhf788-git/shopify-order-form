export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const {
      name,
      phone,
      address,
      note,
      variant_id,
      delivery_charge,
      product_price
    } = req.body;

    const total_price = Number(product_price) + Number(delivery_charge);

    const orderData = {
      order: {
        line_items: [
          {
            variant_id: Number(variant_id),
            quantity: 1
          }
        ],
        billing_address: {
          name: name,
          phone: phone,
          address1: address
        },
        shipping_address: {
          name: name,
          phone: phone,
          address1: address
        },
        note: `Customer Note: ${note}`,
        tags: "COD Order, Landing Page",
        financial_status: "pending",
        currency: "BDT",
        total_price: total_price
      }
    };

    const response = await fetch(
      "https://1jq6bu-kr.myshopify.com/admin/api/2024-01/orders.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API
        },
        body: JSON.stringify(orderData)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("Shopify Error:", data);
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({
      success: true,
      message: "Order Created Successfully",
      order_id: data.order.id
    });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
