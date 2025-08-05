// netlify/functions/ig.js
export async function handler(event) {
  const token  = process.env.IG_TOKEN;
  const igUser = process.env.IG_USER_ID || '17841458100536914';
  if (!token) {
    return json(500, { error: 'Missing IG_TOKEN env var' });
  }

  // вузькі поля для фіда
  const FEED_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

  // якщо просять children для каруселі
  const qs = event.queryStringParameters || {};
  if (qs.children) {
    const fields = 'id,media_type,media_url,thumbnail_url';
    const url = `https://graph.facebook.com/v18.0/${qs.children}/children?fields=${encodeURIComponent(fields)}&limit=20&access_token=${token}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) return json(r.status, j);
      return json(200, j.data || []);
    } catch (e) {
      return json(500, { error: 'children fetch failed', details: e.message });
    }
  }

  // звичайний фід
  const limit = Math.min(parseInt(qs.limit || '6', 10) || 6, 24);
  const feedUrl =
    `https://graph.facebook.com/v18.0/${igUser}/media?fields=${encodeURIComponent(FEED_FIELDS)}&limit=${limit}&access_token=${token}`;

  try {
    const r = await fetch(feedUrl);
    const j = await r.json();
    if (!r.ok) return json(r.status, j);
    return json(200, j.data || [], {
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
  } catch (e) {
    return json(500, { error: 'Instagram proxy error', details: e.message });
  }
}

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
