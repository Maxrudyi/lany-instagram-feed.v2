export async function handler(event, context) {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
  const limit = event.queryStringParameters?.limit || 6;

  const url = `https://graph.facebook.com/v18.0/${igUserId}/media?fields=${fields}&access_token=${token}&limit=25`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (!json.data) {
      throw new Error("No media returned from Instagram API");
    }

    // Сортуємо за датою
    const sorted = json.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Беремо тільки потрібну кількість
    const sliced = sorted.slice(0, limit);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(sliced)
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
