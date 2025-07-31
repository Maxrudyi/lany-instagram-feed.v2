// netlify/functions/ig.js
const IG_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

exports.handler = async (event) => {
  try {
    const token   = process.env.IG_TOKEN || "";
    const igUserId = process.env.IG_USER_ID || "";
    const limit   = Number(event.queryStringParameters?.limit) || 6;
    const debug   = event.queryStringParameters?.debug === "1";

    if (!token || !igUserId) {
      throw new Error("Missing env vars IG_TOKEN or IG_USER_ID");
    }

    // ⚠️ На час дебагу можна ставити limit=100, але для фіналу достатньо 6
    const url = `https://graph.facebook.com/v18.0/${igUserId}/media` +
                `?fields=${encodeURIComponent(IG_FIELDS)}` +
                `&limit=100&access_token=${token}`;

    const resp = await fetch(url);
    const json = await resp.json();

    // Якщо просимо debug, віддаємо корисну діагностику
    if (debug) {
      return {
        statusCode: resp.status,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: resp.ok,
          status: resp.status,
          igUserId,
          tokenLength: token.length,
          fetched: Array.isArray(json?.data) ? json.data.length : 0,
          sample: Array.isArray(json?.data) ? json.data.slice(0, 2) : null,
          error: json?.error || null
        })
      };
    }

    // Якщо API вернув помилку — віддай її текстом, а не "No media..."
    if (!resp.ok) {
      const message = json?.error?.message || `HTTP ${resp.status}`;
      throw new Error(message);
    }

    const data = Array.isArray(json?.data) ? json.data : [];

    // Якщо масив є, але порожній — віддай порожній масив (це не помилка)
    if (data.length === 0) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify([])
      };
    }

    // Сортуємо за датою (на випадок, якщо API змішав порядок)
    const sorted = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limited = sorted.slice(0, limit);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(limited)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Instagram proxy error", details: e.message })
    };
  }
};
