// netlify/functions/ig.js
exports.handler = async function (event) {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID; // напр. 17841458100536914
  if (!token || !igUserId) return json(500, { error: "Missing IG_TOKEN or IG_USER_ID" });

  const limit         = clampInt(event.queryStringParameters?.limit, 6, 1, 24);
  const includeTagged = toBool(event.queryStringParameters?.tagged ?? "1");

  // Мінімальний набір полів для швидкої відповіді
  const FIELDS = "id,media_type,media_url,thumbnail_url,permalink,timestamp";
  const BASE   = "https://graph.facebook.com/v18.0";
  const AT     = `access_token=${encodeURIComponent(token)}`;

  // Невеликі сторінки та обсяг — стабільніше й швидше
  const PAGE_OWN    = Math.max(3, Math.min(10, limit));
  const PAGE_TAGGED = Math.min(6, PAGE_OWN);
  const TAKE_OWN    = Math.min(20, Math.max(limit * 2, 8));
  const TAKE_TAGGED = includeTagged ? Math.min(10, Math.ceil(limit / 2)) : 0;

  try {
    // 1) Власні пости
    const own = await getPaged(
      `${BASE}/${igUserId}/media?fields=${FIELDS}&${AT}`,
      TAKE_OWN,
      PAGE_OWN
    );

    // 2) Tagged (щоб підхопити частину колабів); не валимо запит, якщо впаде
    let tagged = [];
    if (TAKE_TAGGED > 0) {
      try {
        tagged = await getPaged(
          `${BASE}/${igUserId}/tags?fields=${FIELDS}&${AT}`,
          TAKE_TAGGED,
          PAGE_TAGGED
        );
      } catch (_) {/* ігноруємо помилку /tags */}
    }

    // 3) Мердж, сортування, обрізання
    let items = dedupeById([...own, ...tagged])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    // 4) Для каруселей підтягнемо обкладинку (першу дитину)
    items = await enrichCovers(items, BASE, AT);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60"
      },
      body: JSON.stringify(items)
    };
  } catch (e) {
    return json(500, { error: "Instagram proxy error", details: e.message });
  }
};

/* ---------- helpers ---------- */

async function enrichCovers(items, BASE, AT) {
  // обмежуємо кількість додаткових запитів (наприклад до 6)
  let fetched = 0;
  const MAX = 6;

  const out = [];
  for (const it of items) {
    const res = { ...it, cover_url: null };

    if (it.media_type === "VIDEO") {
      // для відео — показуємо thumbnail як постер (якщо є)
      res.cover_url = it.thumbnail_url || null;
    }

    if (it.media_type === "CAROUSEL_ALBUM" && fetched < MAX) {
      try {
        const url = `${BASE}/${it.id}/children?fields=id,media_type,media_url,thumbnail_url&${AT}&limit=10`;
        const r = await fetch(url);
        const j = await r.json();
        if (Array.isArray(j.data) && j.data.length) {
          // обираємо першу дитину: спершу шукаємо IMAGE, інакше беремо першу будь-яку
          const first = j.data.find(c => c.media_type === "IMAGE") || j.data[0];
          res.cover_url = first.media_url || first.thumbnail_url || null;
        }
        fetched++;
      } catch (_) {/* ігноруємо помилки одиничних елементів */}
    }

    out.push(res);
  }
  return out;
}

async function getPaged(urlBase, take, pageSize) {
  let out = [], after = null;
  while (out.length < take) {
    const url = `${urlBase}&limit=${pageSize}${after ? `&after=${after}` : ""}`;
    const r   = await fetch(url);
    const j   = await r.json();

    if (j?.error) throw new Error(j.error.message || "Instagram API error");

    const arr = Array.isArray(j.data) ? j.data : [];
    out = out.concat(arr);

    after = j.paging?.cursors?.after;
    if (!after || arr.length === 0) break;
  }
  return out.slice(0, take);
}

function dedupeById(arr) {
  const seen = new Set(); const res = [];
  for (const it of arr) { if (!it?.id || seen.has(it.id)) continue; seen.add(it.id); res.push(it); }
  return res;
}
function clampInt(raw, def, min, max){ const n=parseInt(raw??def,10); if(Number.isNaN(n))return def; return Math.max(min,Math.min(max,n)); }
function toBool(v){ return String(v).trim()==="1" || String(v).toLowerCase()==="true"; }
function json(statusCode, obj){ return { statusCode, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify(obj)}; }
