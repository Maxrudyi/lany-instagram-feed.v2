// netlify/functions/ig.js
export async function handler(event) {
  const token   = process.env.IG_TOKEN;      // довгий user token (бізнес IG)
  const igUser  = process.env.IG_USER_ID;    // ID акаунта Instagram Business
  if (!token || !igUser) {
    return json(500, { ok:false, error: "Missing IG_TOKEN or IG_USER_ID" });
  }

  // скільки елементів віддати (обмежимо до 12 на всяк випадок)
  const limit = Math.min(
    parseInt(event.queryStringParameters?.limit || "6", 10) || 6,
    12
  );

  // беремо тільки те, що реально потрібно для відмалювання
  const fields = "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption";
  const url =
    `https://graph.facebook.com/v18.0/${igUser}/media` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      return json(resp.status, { ok:false, error: data?.error?.message || "Instagram API error" });
    }

    // відсікаємо зайве, формуємо display_url (постер для відео)
    const items = (data.data || [])
      .map(p => ({
        id: p.id,
        caption: p.caption || "",
        media_type: p.media_type,                 // IMAGE | VIDEO | CAROUSEL_ALBUM
        permalink: p.permalink,
        timestamp: p.timestamp,
        is_video: p.media_type === "VIDEO",
        display_url: p.media_type === "VIDEO" ? (p.thumbnail_url || p.media_url) : p.media_url
      }))
      .filter(p => p.permalink && p.display_url);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // невеличкий CDN-кеш на 60 сек, щоб не стукати в API на кожен хіт
        "Cache-Control": "public, max-age=60"
      },
      body: JSON.stringify(items)
    };
  } catch (e) {
    return json(500, { ok:false, error: e.message || "Fetch failed" });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
