// netlify/functions/refresh.js
// Збирає власні пости + collab (/tags), додає обкладинки каруселям і кладе у Netlify Blobs.

const API = 'v18.0';

exports.handler = async (event) => {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID; // 1784...
  if (!token || !igUserId) return send(500, { ok:false, error:'Missing IG_TOKEN or IG_USER_ID' });

  // Можеш регулювати без деплою: /refresh?own=30&tagged=10
  const ownTake    = clamp(event.queryStringParameters?.own,    30, 1, 100);
  const taggedTake = clamp(event.queryStringParameters?.tagged, 10, 0,  50);

  try {
    const [own, tagged] = await Promise.all([
      getEdgePaged(igUserId, 'media',  ownTake,    8, token), // малими сторінками
      getEdgePaged(igUserId, 'tags',   taggedTake, 5, token).catch(()=>[]) // якщо /tags «важкий» — пропускаємо, але не падаємо
    ]);

    // Мердж + дедуп
    let items = dedupe([...own, ...tagged]);

    // Обкладинки для каруселей (обмежимо до 8 дод. запитів)
    items = await enrichCovers(items, 8, token);

    // Сортуємо за часом новіші зверху
    items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Пишемо у Blobs
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'ig-cache', consistency: 'strong',
      siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_API_TOKEN });

    const payload = { updatedAt: new Date().toISOString(), count: items.length, items };
    await store.set('feed.json', JSON.stringify(payload), {
      metadata: { updatedAt: payload.updatedAt, count: String(payload.count) }
    });

    return send(200, { ok:true, saved: items.length, updatedAt: payload.updatedAt });
  } catch (e) {
    return send(500, { ok:false, error: e.message });
  }
};

async function getEdgePaged(igUserId, edge, take, page, token) {
  const fields = 'id,media_type,media_url,thumbnail_url,permalink,timestamp';
  const base = https://graph.facebook.com/${API}/${igUserId}/${edge}?fields=${fields}&access_token=${encodeURIComponent(token)};
  let out = [], after = null;
  while (out.length < take) {
    const url = ${base}&limit=${page}${after ? `&after=${after} : ''}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j?.error) throw new Error(`${edge}: ${j.error.message}`);
    const arr = Array.isArray(j.data) ? j.data : [];
    out = out.concat(arr);
    after = j.paging?.cursors?.after;
    if (!after || arr.length === 0) break;
  }
  return out.slice(0, take);
}

async function enrichCovers(items, maxFetch, token) {
  const out = [];
  let used = 0;
  for (const it of items) {
    const copy = { ...it, cover_url: null };
    if (it.media_type === 'VIDEO') {
      copy.cover_url = it.thumbnail_url || null;
    }
    if (it.media_type === 'CAROUSEL_ALBUM' && used < maxFetch) {
      try {
        const url = https://graph.facebook.com/${API}/${it.id}/children?fields=id,media_type,media_url,thumbnail_url&limit=10&access_token=${encodeURIComponent(token)};
        const jr = await (await fetch(url)).json();
        if (Array.isArray(jr.data) && jr.data.length) {
          const first = jr.data.find(c => c.media_type === 'IMAGE') || jr.data[0];
          copy.cover_url = first.media_url  first.thumbnail_url  copy.cover_url;
        }
        used++;
      } catch {}
    }
    out.push(copy);
  }
  return out;
}

function dedupe(arr){ const seen=new Set(); return arr.filter(x=>x?.id && !seen.has(x.id) && seen.add(x.id)); }
function clamp(v,def,min,max){ const n=parseInt(v??def,10); return Number.isNaN(n)?def:Math.max(min,Math.min(max,n)); }
function send(status, obj){ return { statusCode: status, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(obj) }; }
