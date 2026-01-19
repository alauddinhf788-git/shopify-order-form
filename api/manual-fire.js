import { fireTikTokPurchaseBackend } from "../../utils/fire-tiktok-purchase";

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({ error:"Only POST allowed" });
  const { orderId, totalPrice, ttclid } = req.body;
  if(!orderId||!totalPrice) return res.status(400).json({ error:"orderId and totalPrice required" });

  try{
    const response = await fireTikTokPurchaseBackend(orderId, totalPrice, ttclid);
    return res.status(200).json({ success:true, response });
  }catch(err){
    return res.status(500).json({ error:"Failed to fire TikTok event" });
  }
}
