// netlify/functions/ig.js
export async function handler(event) {
  const token  = process.env.IG_TOKEN;
  const fields = "id,media_url,permalink,media_type,thumbnail_url,caption";
  const limit  = (event.queryStringParameters && event.queryStringParameters.limit) || 9;

  const url = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${token}&limit=${limit}`;

  try {
    const r = await fetch(url);
    const json = await r.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(json.data || [])
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Instagram proxy error", details: e.message })
    };
  }
}
