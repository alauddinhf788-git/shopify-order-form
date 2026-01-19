import fetch from "node-fetch";

export async function fireTikTokPurchaseBackend(orderId, totalPrice, ttclid) {
  const eventTime = Math.floor(Date.now()/1000);
  const eventId = "manual_"+(orderId||Date.now());

  const payload = {
    pixel_code: process.env.TIKTOK_PIXEL_ID,
    event: "CompletePayment",
    event_id: eventId,
    timestamp: eventTime,
    properties: { value: totalPrice, currency: "BDT", ttclid: ttclid||undefined }
  };

  try {
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/",{
      method:"POST",
      headers:{"Content-Type":"application/json","Access-Token":process.env.TIKTOK_ACCESS_TOKEN},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Manual TikTok backend response:", data);
    return data;
  } catch(err){
    console.error("TikTok API error:", err);
    throw err;
  }
}
