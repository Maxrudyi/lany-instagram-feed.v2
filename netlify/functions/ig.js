// netlify/functions/ig.js
export async function handler(event) {
  try {
    const token  = process.env.IG_TOKEN;
    const igUser = process.env.IG_USER_ID || '17841458100536914';
    if (!token) {
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Missing IG_TOKEN' }) };
    }

    const q = event.queryStringParameters || {};
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

    // --- режим дітей каруселі ---
    if (q.children) {
      const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(q.children)}` +
                  `/children?fields=id,media_type,media_url,thumbnail_url&access_token=${token}`;
      const r = await fetch(url);
      const json = await r.json();
      if (!r.ok) {
        return { statusCode: r.status, headers: cors(), body: JSON.stringify(json) };
      }
      return { statusCode: 200, headers: cors(), body: JSON.stringify(json.data || []) };
    }

    // --- звичайний фід ---
    const limit = Math.min(parseInt(q.limit || '6', 10) || 6, 24);
    const url = `https://graph.facebook.com/v18.0/${igUser}/media` +
                `?fields=${encodeURIComponent(fields)}` +
                `&limit=${limit}&access_token=${token}`;

    const r = await fetch(url);
    const json = await r.json();
    if (!r.ok) {
      return { statusCode: r.status, headers: cors(), body: JSON.stringify(json) };
    }

    return {
      statusCode: 200,
      headers: { ...cors(), 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(json.data || []),
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Instagram proxy error', details: e.message }) };
  }
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*' };
}
