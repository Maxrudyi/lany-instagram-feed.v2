// netlify/functions/ig.js
export async function handler(event, context) {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  const fields = "id,caption,media_type,media_url,permalink,thumbnail_url";
  const limit = event.queryStringParameters?.limit || 8;
  const url = `https://graph.facebook.com/v23.0/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${token}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data.data || [])
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Instagram proxy error",
        details: e.message
      })
    };
  }
}
