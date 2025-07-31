// netlify/functions/ig-read.js
// Читає готовий кеш із Netlify Blobs і віддає перші N.

exports.handler = async (event) => {
  try {
    const limit = clamp(event.queryStringParameters?.limit, 6, 1, 24);

    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'ig-cache', consistency: 'strong',
      siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_API_TOKEN });

    const json = await store.get('feed.json', { type: 'json' });
    const items = Array.isArray(json?.items) ? json.items.slice(0, limit) : [];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // тепер це справді швидко і можна кешувати у браузері теж
        'Cache-Control': 'public, max-age=120'
      },
      body: JSON.stringify(items)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'read-failed', details: e.message }) };
  }
};

function clamp(v,def,min,max){ const n=parseInt(v??def,10); return Number.isNaN(n)?def:Math.max(min,Math.min(max,n)); }
