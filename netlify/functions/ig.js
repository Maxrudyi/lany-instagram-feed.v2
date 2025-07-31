// netlify/functions/ig.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const qs    = event.queryStringParameters || {};
  const limit = Number(qs.limit || 6);
  const fast  = qs.fast === '1';   // запасний швидкий режим з live-запиту без /tags

  const store = getStore('instagram');

  try {
    // 1) спроба взяти з кешу
    const cached = await store.get('feed', { type: 'json' });
    if (cached && cached.items) {
      const items = cached.items.slice(0, limit);
      return json(200, items, { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=60' });
    }

    // 2) якщо кешу немає — швидкий live (без /tags), щоб не було 14 с
    if (fast) {
      const data = await fetchOwnOnly(limit);
      return json(200, data, { 'X-Cache': 'MISS-LIVE' });
    }

    // 3) інакше — пусто, але не блокуємо сторінку
    return json(200, [], { 'X-Cache': 'MISS-EMPTY' });

  } catch (e) {
    return json(500, { error: 'Instagram proxy error', details: e.message });
  }

  async function fetchOwnOnly(limit) {
    const token    = process.env.IG_TOKEN;
    const igUserId = process.env.IG_USER_ID || "17841458100536914";
    const fields   = ['id','caption','media_type','media_product_type','media_url','thumbnail_url','permalink','timestamp'];

    const u = new URL(`https://graph.facebook.com/v18.0/${igUserId}/media`);
    u.searchParams.set('fields', fields.join(','));
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('access_token', token);

    const r = await fetch(u);
    const j = await r.json();
    return (j.data || []).filter(i => i.media_type !== 'STORY');
  }

  function json(code, body, extraHeaders = {}) {
    return {
      statusCode: code,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extraHeaders },
      body: JSON.stringify(body)
    };
  }
};
