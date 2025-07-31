// netlify/functions/ig.js
export default async (req, res) => {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914"; // твій ID
  const fields = "id,caption,media_type,media_url,permalink,thumbnail_url";
  const limit = event.queryStringParameters?.limit || 8;
  const url = `https://graph.facebook.com/v23.0/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${token}`;

  try {
    const r = await fetch(url);
    const json = await r.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(json.data || []);
  } catch (e) {
    return res.status(500).json({ error: "Instagram proxy error", details: e.message });
  }
};
