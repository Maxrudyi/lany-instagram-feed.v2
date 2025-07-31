export async function handler(event, context) {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
  const limit = event.queryStringParameters?.limit || 8;
  const url = `https://graph.facebook.com/v23.0/${igUserId}/media?fields=${fields}&limit=25&access_token=${token}`;

  try {
    const response = await fetch(url);
    const json = await response.json();
    let data = json.data || [];

    // Сортуємо за датою, щоб отримати найновіші
    data = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Беремо тільки потрібну кількість
    const limited = data.slice(0, limit);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(limited)
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
