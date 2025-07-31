// netlify/functions/refresh.js
const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  if (!token) return json(500, { error: 'Missing IG_TOKEN' });

  const store = getStore('instagram');

  const baseFields   = ['id','caption','media_type','media_product_type','media_url','thumbnail_url','permalink','timestamp'];
  const mediaFields  = baseFields.concat('children{media_type,media_url,thumbnail_url,id}');
  const tagsFields   = baseFields; // без children – щоб не падало по «complexity»

  try {
    const own   = await getEdge('media', mediaFields, 25);
    const tagged = await safeGetTags(); // може повернути []

    const merged = dedupeById([...own, ...tagged])
      .filter(i => i.media_type !== 'STORY')
      .sort((a,b) => +new Date(b.timestamp) - +new Date(a.timestamp));

    // зберігаємо весь список (не тільки 6)
    await store.set('feed', JSON.stringify({
      updatedAt: Date.now(),
      items: merged
    }), { metadata: { updatedAt: String(Date.now()) } });

    return json(200, { ok: true, saved: merged.length });
  } catch (e) {
    return json(500, { error: 'refresh failed', details: e.message });
  }

  async function safeGetTags() {
    try { return await getEdge('tags', tagsFields, 15); }
    catch { return []; }
  }

  async function getEdge(edge, fields, perPageLimit) {
    const u = new URL(`https://graph.facebook.com/v18.0/${igUserId}/${edge}`);
    u.searchParams.set('fields', fields.join(','));
    u.searchParams.set('limit', String(perPageLimit));
    u.searchParams.set('access_token', token);

    const r = await fetch(u);
    const j = await r.json();
    if (j.error) throw new Error(`${edge}: ${j.error.message}`);
    return j.data || [];
  }

  function dedupeById(arr) {
    const s = new Set();
    return arr.filter(x => (s.has(x.id) ? false : (s.add(x.id), true)));
  }

  function json(code, body) {
    return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
};
