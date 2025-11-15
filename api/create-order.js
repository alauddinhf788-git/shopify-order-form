export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const {
      name,
      phone,
      address,
      note,
      delivery,
      variant_id,
      product_title,
      product_price
    } = req.body;

    if (!name || !phone || !address || !delivery || !variant_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API;

    // Convert Phone → E.164
    let formattedPhone = phone;
    if (phone.startsWith("0")) {
      formattedPhone = "+880" + phone.substring(1);
    }

    // Price Convert
    const finalTotal = Number(product_price) + Number(delivery);

    const orderData = {
      order: {
        line_items: [
          {
            title: product_title,
            price: Number(product_price),
            quantity: 1,
            variant_id: Number(variant_id)
          },
          {
            title: "Delivery Charge",
            price: Number(delivery),
            quantity: 1
          }
        ],
        billing_address: {
          first_name: name,
          address1: address,
          phone: formattedPhone
        },
        shipping_address: {
          first_name: name,
          address1: address,
          phone: formattedPhone
        },
        note: note,
        tags: "Custom-Order-Form"
      }
    };

    const response = await fetch(`https://${shop}/admin/api/2024-10/orders.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (!response.ok) return res.status(500).json({ error: result });

    return res.status(200).json({ success: true, order: result.order });

  } catch (err) {
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
