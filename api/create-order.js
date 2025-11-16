export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, address, note, delivery_charge } = req.body;

  try {
    const orderData = {
      order: {
        email: "noemail@placeholder.com",
        phone: phone,
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
        note: note,
        tags: "COD, Custom Order",
        
        financial_status: "pending",

        line_items: [
          {
            title: "Sunglass Order",
            price: "750",
            quantity: 1
          }
        ],

        shipping_lines: [
          {
            title: "Delivery Charge",
            price: delivery_charge
          }
        ]
      }
    };

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`,
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

    if (data.errors) {
      console.log("Shopify Error:", data);
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({
      message: "অর্ডার সফলভাবে কনফার্ম হয়েছে!",
      order: data.order
    });

  } catch (error) {
    return res.status(500).json({ error: error.toString() });
  }
}
