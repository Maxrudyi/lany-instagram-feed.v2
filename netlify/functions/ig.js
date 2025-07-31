// netlify/functions/ig.js
export async function handler(event, context) {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  const fields = "id,caption,media_type,media_url,permalink,timestamp,thumbnail_url";
  const limit = event.queryStringParameters?.limit || 6;
  const url = `https://graph.facebook.com/v17.0/${igUserId}/media?fields=${fields}&access_token=${token}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    const filtered = (result.data || [])
      .filter(post =>
        post.media_type === "IMAGE" ||
        post.media_type === "VIDEO" ||
        post.media_type === "CAROUSEL_ALBUM"
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(filtered)
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
