// netlify/functions/refresh.js
import { getStore } from '@netlify/blobs';

// ==== ENV ====
const IG_USER_ID = process.env.IG_USER_ID || '17841458100536914';
const IG_TOKEN   = process.env.IG_TOKEN;
const SITE_ID    = process.env.NETLIFY_SITE_ID;
const API_TOKEN  = process.env.NETLIFY_API_TOKEN;

// ==== CONST ====
const STORE_NAME = 'ig-cache';
const BLOB_KEY   = 'latest.json';
const FB         = 'https://graph.facebook.com/v18.0';
const FIELDS     = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';

// Helper: JSON response
function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

// Helper: paging fetch
async function fetchAll(url) {
  const acc = [];
  let next = url;
  while (next) {
    const r = await fetch(next);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    acc.push(...(j.data || []));
    next = j?.paging?.next || null;
  }
  return acc;
}

// Netlify handler
export async function handler(event) {
  try {
    const qs      = new URLSearchParams(event.queryStringParameters || {});
    const own     = Number(qs.get('own')       || 24);
    const tagged  = Number(qs.get('tagged')    || 8);
    const perTag  = Number(qs.get('perTagged') || 6);

    if (!IG_TOKEN)  throw new Error('IG_TOKEN env is missing');
    if (!SITE_ID || !API_TOKEN) throw new Error('NETLIFY_SITE_ID or NETLIFY_API_TOKEN is missing');

    // 1) власні пости
    const ownUrl   = `${FB}/${IG_USER_ID}/media?fields=${FIELDS}&access_token=${IG_TOKEN}&limit=${own}`;
    const ownItems = await fetchAll(ownUrl);

    // 2) позначені (collab / згадки)
    const tagUrl   = `${FB}/${IG_USER_ID}/tags?fields=${FIELDS}&access_token=${IG_TOKEN}&limit=${tagged}`;
    const tagItems = (await fetchAll(tagUrl)).slice(0, perTag);

    // 3) об’єднуємо, чистимо, сортуємо
    const merged = [...ownItems, ...tagItems]
      .filter(m =>
        (m.media_type === 'IMAGE' || m.media_type === 'VIDEO' || m.media_type === 'CAROUSEL_ALBUM') &&
        m.media_url
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 4) зберігаємо у Blobs
    const store = getStore({ name: STORE_NAME, siteID: SITE_ID, token: API_TOKEN });
    await store.set(BLOB_KEY, JSON.stringify(merged), { contentType: 'application/json' });

    return json({ ok: true, saved: merged.length });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
