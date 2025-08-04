// netlify/functions/ig.js
export async function handler(event) {
  const token  = process.env.IG_TOKEN;
  const igUser = process.env.IG_USER_ID || '17841458100536914';

  // скільки віддати елементів (1..24)
  const asked   = Number(event.queryStringParameters?.limit ?? 6);
  const limit   = Number.isFinite(asked) ? Math.max(1, Math.min(asked, 24)) : 6;

  // ОБОВ’ЯЗКОВО: children для каруселей + thumbnail_url для постерів відео
  const fields = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'thumbnail_url',
    'permalink',
    'timestamp',
    'children{media_type,media_url,thumbnail_url,permalink}',
  ].join(',');

  const url =
    `https://graph.facebook.com/v18.0/${igUser}/media` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=${limit}&access_token=${encodeURIComponent(token)}`;

  try {
    const resp = await fetch(url);
    const json = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: cors(),
        body: JSON.stringify(json?.error ?? { message: 'Upstream error' }),
      };
    }

    const data = Array.isArray(json?.data) ? json.data : [];
    // на всяк випадок відсортуємо (новіші зверху) і відріжемо до limit
    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const out = data.slice(0, limit);

    return {
      statusCode: 200,
      headers: {
        ...cors(),
        // невеликий кеш для фронту (5 хв)
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify(out),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({
        error: 'Instagram proxy error',
        details: String(e?.message || e),
      }),
    };
  }

  function cors() {
    return { 'Access-Control-Allow-Origin': '*' };
  }
}
