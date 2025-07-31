// netlify/functions/refresh.js
// Збирає власні пости + позначені (tags), нормалізує, сортує і кладе у Netlify Blobs.

const API_VER = 'v18.0';

// -------- helpers --------
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Bad JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    const msg = json?.error?.message || r.statusText;
    const code = json?.error?.code;
    throw new Error(`${r.status} ${msg}${code ? ` (code ${code})` : ''}`);
  }
  return json;
}

function normalizeItem(x, source) {
  const item = {
    id: x.id,
    caption: x.caption || '',
    type: x.media_type,
    media_url: x.media_url || null,
    thumbnail_url: x.thumbnail_url || null,
    permalink: x.permalink,
    timestamp: x.timestamp || null,
    source
  };
  item.preview_url =
    item.type === 'VIDEO'
      ? (item.thumbnail_url || item.media_url)
      : (item.media_url || item.thumbnail_url);
  return item;
}

async function enrichCarouselFirstFrame(token, id) {
  const fields = 'media_type,media_url,thumbnail_url';
  const url = `https://graph.facebook.com/${API_VER}/${id}/children?fields=${fields}&limit=1&access_token=${token}`;
  const json = await fetchJSON(url);
  const child = json?.data?.[0];
  if (!child) return null;
  return {
    media_url: child.media_url || null,
    thumbnail_url: child.thumbnail_url || null
  };
}

async function getOwnMedia(token, igUserId, take = 50) {
  const fields = [
    'id','caption','media_type','media_url','permalink','thumbnail_url','timestamp'
  ].join(',');
  const url = `https://graph.facebook.com/${API_VER}/${igUserId}/media?fields=${fields}&limit=${Math.max(take,25)}&access_token=${token}`;
  const json = await fetchJSON(url);
  return (json?.data || []).map(x => normalizeItem(x, 'own'));
}

async function getTaggedMedia(token, igUserId, take = 50) {
  const fields = [
    'id','caption','media_type','media_url','permalink','thumbnail_url','timestamp'
  ].join(',');
  const url = `https://graph.facebook.com/${API_VER}/${igUserId}/tags?fields=${fields}&limit=${Math.max(take,25)}&access_token=${token}`;
  const json = await fetchJSON(url);
  return (json?.data || []).map(x => normalizeItem(x, 'tagged'));
}

// -------- handler --------
exports.handler = async (event/*, context*/) => {
  const token  = process.env.IG_TOKEN;
  const igUser = process.env.IG_USER_ID || '17841458100536914';

  const send = (obj, status = 200) => ({
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj)
  });

  if (!token || !igUser) {
    return send({ ok: false, error: 'Missing IG_TOKEN or IG_USER_ID' }, 500);
    }

  const ownTake    = Math.min(parseInt(event.queryStringParameters?.own || '50', 10), 100);
  const taggedTake = Math.min(parseInt(event.queryStringParameters?.tagged || '50', 10), 100);
  const enrichMax  = Math.min(parseInt(event.queryStringParameters?.enrich || '12', 10), 50);

  try {
    // 1) тягнемо паралельно
    const [own, tagged] = await Promise.all([
      getOwnMedia(token, igUser, ownTake),
      getTaggedMedia(token, igUser, taggedTake)
    ]);

    let items = [...own, ...tagged];

    // 2) дозбагачуємо каруселі першою дитинкою (обмежуємо кількість запитів)
    let enriched = 0;
    for (let i = 0; i < items.length && enriched < enrichMax; i++) {
      const it = items[i];
      if (it.type === 'CAROUSEL_ALBUM' && !it.media_url) {
        try {
          const child = await enrichCarouselFirstFrame(token, it.id);
          if (child) {
            it.media_url = child.media_url || it.media_url;
            it.thumbnail_url = child.thumbnail_url || it.thumbnail_url;
            it.preview_url =
              it.type === 'VIDEO'
                ? (it.thumbnail_url || it.media_url)
                : (it.media_url || it.thumbnail_url);
          }
          enriched++;
        } catch { /* одиничні помилки ігноруємо */ }
      }
    }

    // 3) дедуп + сортування
    const byId = new Map();
    for (const x of items) if (!byId.has(x.id)) byId.set(x.id, x);
    items = Array.from(byId.values());
    items.sort((a,b) => (new Date(b.timestamp||0)) - (new Date(a.timestamp||0)));

    // 4) пишемо у Netlify Blobs
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'ig-cache', consistency: 'strong' });

    const payload = {
      updatedAt: new Date().toISOString(),
      count: items.length,
      items
    };

    await store.set(
      'feed.json',
      JSON.stringify(payload),
      { metadata: { updatedAt: payload.updatedAt, count: String(payload.count) } }
    );

    return send({ ok: true, saved: items.length, updatedAt: payload.updatedAt });
  } catch (e) {
    return send({ ok: false, error: e.message }, 500);
  }
};
