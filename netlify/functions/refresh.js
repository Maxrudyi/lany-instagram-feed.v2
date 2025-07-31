// netlify/functions/refresh.js
import { getStore } from '@netlify/blobs';

const IG_USER_ID = process.env.IG_USER_ID || '17841458100536914';
const IG_TOKEN   = process.env.IG_TOKEN;
const SITE_ID    = process.env.NETLIFY_SITE_ID;
const API_TOKEN  = process.env.NETLIFY_API_TOKEN;

const FB     = 'https://graph.facebook.com/v18.0';
const FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

// один запит з тайм-аутом
async function fetchJSON(url, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

export async function handler(event) {
  try {
    const qs        = new URLSearchParams(event.queryStringParameters || {});
    const own       = Math.min(Number(qs.get('own') || 12), 24);     // скільки своїх
    const tagged    = Math.min(Number(qs.get('tagged') || 6), 24);   // скільки позначених
    const perTagged = Math.min(Number(qs.get('perTagged') || 6), 6); // обрізка tagged

    if (!IG_TOKEN)  throw new Error('IG_TOKEN env is missing');
    if (!SITE_ID || !API_TOKEN) throw new Error('NETLIFY_SITE_ID or NETLIFY_API_TOKEN is missing');

    const ownUrl = `${FB}/${IG_USER_ID}/media?fields=${FIELDS}&limit=${own}&access_token=${IG_TOKEN}`;
    const tagUrl = `${FB}/${IG_USER_ID}/tags?fields=${FIELDS}&limit=${tagged}&access_token=${IG_TOKEN}`;

    // паралельно, кожен з тайм-аутом
    const [ownJ, tagJ] = await Promise.all([
      fetchJSON(ownUrl, 4500),
      fetchJSON(tagUrl, 4500).catch(() => ({ data: [] })), // якщо теги повільні — просто пропустимо
    ]);

    const ownItems = ownJ?.data || [];
    const tagItems = (tagJ?.data || []).slice(0, perTagged);

    const merged = [...ownItems, ...tagItems]
      .filter(m => ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(m.media_type) && m.media_url)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const store = getStore({ name: 'ig-cache', siteID: SITE_ID, token: API_TOKEN });
    await store.set('latest.json', JSON.stringify(merged), { contentType: 'application/json' });

    return json({ ok: true, own: ownItems.length, tagged: tagItems.length, saved: merged.length });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
