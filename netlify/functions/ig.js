const handler = async (event, context) => {
  const token = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
  const limit = event.queryStringParameters?.limit || 6;

  const url = `https://graph.facebook.com/v18.0/${igUserId}/media?fields=${fields}&limit=100&access_token=${token}`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (!json.data || json.data.length === 0) {
      throw new Error("No media returned from Instagram API");
    }

    const sorted = json.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limited = sorted.slice(0, limit);

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
};

module.exports = { handler };
