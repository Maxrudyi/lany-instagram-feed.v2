// netlify/functions/ig.js
export async function handler(event) {
  try {
    const token   = process.env.IG_TOKEN;
    const igUser  = process.env.IG_USER_ID || '17841458100536914';

    // ОБОВ’ЯЗКОВО лишаємо thumbnail_url
    const fields  = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

    const limit   = Math.min(
      parseInt(event.queryStringParameters?.limit || '6', 10) || 6,
      24
    );

    const url = `https://graph.facebook.com/v18.0/${igUser}/media` +
                `?fields=${encodeURIComponent(fields)}` +
                `&limit=${limit}&access_token=${token}`;

    const r = await fetch(url);
    const json = await r.json();

    if (!r.ok) {
      return {
        statusCode: r.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: json.error || 'Upstream error' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        // невеличкий кеш на 5 хв, щоб фронт не чекав кожного разу
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify(json.data || []),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Instagram proxy error', details: e.message }),
    };
  }
}
