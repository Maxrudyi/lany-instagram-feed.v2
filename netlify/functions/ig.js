// netlify/functions/ig.js
exports.handler = async function (event) {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";

  if (!token) return json(500, { error: "Missing IG_TOKEN" });

  const qs        = event.queryStringParameters || {};
  const limit     = Number(qs.limit || 6);
  const expand    = qs.expand === "1";              // розкривати діти для каруселей у власних постах
  const includeTags = qs.notags === "1" ? false : true; // можна вимкнути /tags параметром ?notags=1
  const product   = (qs.product || "ALL").toUpperCase(); // ALL | FEED | REELS
  const debug     = qs.debug === "1";

  // Базові поля
  const baseFields = [
    "id","caption","media_type","media_product_type",
    "media_url","thumbnail_url","permalink","timestamp"
  ];

  // Для /media дозволяємо (опційно) розкриття дітей каруселі
  const mediaFields = expand
    ? baseFields.concat("children{media_type,media_url,thumbnail_url,id}")
    : baseFields;

  // Для /tags робимо запит легшим: без children
  const tagsFields = [
    "id","media_type","media_product_type","media_url",
    "thumbnail_url","permalink","timestamp"
  ];

  try {
    // беремо невеликі порції, щоб не впертись у «complexity»
    const mediaPromise = getEdge("media", mediaFields, 25);
    let tagsPromise = Promise.resolve([]);
    let tagError = null;

    if (includeTags) {
      tagsPromise = getEdge("tags", tagsFields, 15).catch(e => {
        // не валимо всю відповідь, якщо /tags важкий
        tagError = e.message;
        return [];
      });
    }

    const [own, tagged] = await Promise.all([mediaPromise, tagsPromise]);

    // мердж + де-дуп
    const merged = dedupeById([...own, ...tagged])
      // забрати сторіз
      .filter(i => i.media_type !== "STORY")
      // фільтр продукту (за потреби)
      .filter(i => product === "ALL" ? true : (i.media_product_type || "FEED") === product)
      // новіші зверху
      .sort((a,b) => +new Date(b.timestamp) - +new Date(a.timestamp));

    const result = merged.slice(0, limit);

    if (debug) {
      return json(200, {
        ok: true,
        counts: { own: own.length, tagged: tagged.length, merged: merged.length, returned: result.length },
        tagError,
        sample: result.map(i => ({
          id: i.id, product: i.media_product_type || "FEED", type: i.media_type,
          ts: i.timestamp, permalink: i.permalink
        }))
      });
    }

    return json(200, result);

  } catch (e) {
    return json(500, { error: "Instagram proxy error", details: e.message });
  }

  // -------- helpers ----------
  async function getEdge(edge, fields, perPageLimit) {
    const u = new URL(`https://graph.facebook.com/v18.0/${igUserId}/${edge}`);
    u.searchParams.set("fields", fields.join(","));
    u.searchParams.set("limit", String(perPageLimit));
    u.searchParams.set("access_token", token);

    const r = await fetch(u);
    const j = await r.json();
    if (j.error) throw new Error(`${edge}: ${j.error.message}`);
    return j.data || [];
  }

  function dedupeById(arr) {
    const seen = new Set();
    return arr.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  }

  function json(code, obj) {
    return {
      statusCode: code,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(obj, null, 2)
    };
  }
};
