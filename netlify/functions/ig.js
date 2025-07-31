// netlify/functions/ig.js
exports.handler = async function (event) {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";

  const qs      = event.queryStringParameters || {};
  const limit   = Number(qs.limit || 6);
  const expand  = qs.expand === "1";
  const product = (qs.product || "ALL").toUpperCase(); // ALL | FEED | REELS
  const debug   = qs.debug === "1";

  if (!token) {
    return json(500, { error: "Missing IG_TOKEN" });
  }

  const baseFields = [
    "id","caption","media_type","media_product_type",
    "media_url","thumbnail_url","permalink","timestamp"
  ];
  const fields = expand
    ? baseFields.concat("children{media_type,media_url,thumbnail_url,id}")
    : baseFields;

  try {
    const [own, tagged] = await Promise.all([
      getEdge("media"),   // ваші власні пости
      getEdge("tags")     // пости, де вас тегнули (може включати частину collab)
    ]);

    let all = [...own, ...tagged];

    // де-дуп
    const seen = new Set();
    all = all.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));

    // відсікаємо сторіз
    all = all.filter(x => x.media_type !== "STORY");

    // фільтр за продуктом (за потреби)
    if (product !== "ALL") {
      all = all.filter(x => (x.media_product_type || "FEED") === product);
    }

    // новіші зверху
    all.sort((a,b) => +new Date(b.timestamp) - +new Date(a.timestamp));

    const sliced = all.slice(0, limit);

    if (debug) {
      return json(200, {
        ok: true,
        own_count: own.length,
        tagged_count: tagged.length,
        merged: all.length,
        returned: sliced.length,
        types: countBy(all, i => `${i.media_product_type || "FEED"}:${i.media_type}`),
        sample: sliced.map(i => ({
          id: i.id,
          product: i.media_product_type || "FEED",
          type: i.media_type,
          ts: i.timestamp,
          permalink: i.permalink
        }))
      });
    }

    return json(200, sliced);

  } catch (e) {
    return json(500, { error: "Instagram proxy error", details: e.message });
  }

  // helpers
  async function getEdge(edge) {
    const u = new URL(`https://graph.facebook.com/v18.0/${igUserId}/${edge}`);
    u.searchParams.set("fields", fields.join(","));
    u.searchParams.set("limit", "50");
    u.searchParams.set("access_token", token);
    const r = await fetch(u);
    const j = await r.json();
    if (j.error) throw new Error(`${edge}: ${j.error.message}`);
    return j.data || [];
  }
  function json(code, obj) {
    return {
      statusCode: code,
      headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      body: JSON.stringify(obj, null, 2)
    };
  }
  function countBy(arr, fn) { const m = {}; for (const v of arr) { const k = fn(v); m[k] = (m[k] || 0) + 1; } return m; }
};
