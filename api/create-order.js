// api/create-order.js
import { buffer } from "micro";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS (allow from anywhere for testing; tighten later if needed)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Only POST allowed" });
  }

  try {
    // Read raw body safely
    const raw = (await buffer(req)).toString();
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return res.status(400).json({ success: false, error: "Invalid JSON body" });
    }

    // Read fields exactly as frontend sends them
    const {
      name,
      phone,
      address,
      note = "",
      delivery = "0",
      variant_id
    } = body || {};

    // Validate required fields (matches frontend)
    if (!name || !phone || !address || !variant_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, phone, address, variant_id"
      });
    }

    // Environment variables (support common variants)
    const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
    const SHOP_TOKEN =
      process.env.SHOPIFY_ADMIN_TOKEN ||
      process.env.SHOPIFY_ADMIN_API ||
      process.env.SHOPIFY_ADMIN;

    if (!SHOP_DOMAIN || !SHOP_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "Server misconfiguration: SHOPIFY_STORE_DOMAIN or admin token missing"
      });
    }

    // Normalize values
    const variantIdNum = Number(variant_id);
    const deliveryAmount = Number(delivery || 0);
    const deliveryPrice = Number.isFinite(deliveryAmount)
      ? deliveryAmount.toFixed(2)
      : "0.00";

    // Build Shopify order payload (will include customer & addresses)
    const orderPayload = {
      order: {
        line_items: [
          {
            variant_id: variantIdNum,
            quantity: 1
          }
        ],
        billing_address: {
          first_name: name,
          phone: phone,
          address1: address,
          country: "Bangladesh"
        },
        shipping_address: {
          first_name: name,
          phone: phone,
          address1: address,
          country: "Bangladesh"
        },
        note: note || "",
        tags: ["Landing Page Order"],
        financial_status: "pending",
        payment_gateway_names: ["Cash on Delivery"],
        shipping_lines: [
          {
            title: "Delivery Charge",
            price: deliveryPrice,
            code: "DELIVERY_FEE",
            source: "custom"
          }
        ]
      }
    };

    // Send request to Shopify admin API
    const shopifyUrl = `https://${SHOP_DOMAIN}/admin/api/2024-10/orders.json`;
    const resp = await fetch(shopifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOP_TOKEN,
        Accept: "application/json"
      },
      body: JSON.stringify(orderPayload)
    });

    const result = await resp.json();

    if (!resp.ok) {
      // forward Shopify's status + error body
      return res.status(resp.status || 500).json({
        success: false,
        error: result || "Shopify API error"
      });
    }

    // Success → return created order
    return res.status(200).json({
      success: true,
      order: result.order || result
    });
  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
