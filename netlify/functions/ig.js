// netlify/functions/ig.js
export async function handler(event) {
  const token    = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";
  if (!token) return json(500, { error: "IG_TOKEN is missing" });

  // скільки показувати
  const limit = clampInt(event.queryStringParameters?.limit, 6, 1, 24);

  // чи підтягувати tagged (щоб закрити колаб/відмічені пости)
  const includeTagged = toBool(event.queryStringParameters?.tagged ?? "1");

  // мінімальний набір полів (без children, щоб не збільшувати відповідь)
  const FIELDS = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
  const BASE   = "https://graph.facebook.com/v18.0";
  const AT     = `access_token=${encodeURIComponent(token)}`;

  // маленькі сторінки — стабільніше
  const PER_OWN    = Math.max(3, Math.min(10, limit)); // 3..10
  const PER_TAGGED = Math.min(6, PER_OWN);             // 3..6

  // скільки брати “на вході”, щоб після сортування вистачило
  const TAKE_OWN    = Math.min(20, Math.max(limit * 2, 8));
  const TAKE_TAGGED = includeTagged ? Math.min(10, Math.ceil(limit / 2)) : 0;

  try {
    // 1) власні пости
    const own = await getPaged(
      `${BASE}/${igUserId}/media?fields=${FIELDS}&${AT}`,
      TAKE_OWN,
      PER_OWN
    );

    // 2) tagged (обережно, може віддати помилку — не валимо весь запит)
    let tagged = [];
    if (TAKE_TAGGED > 0) {
      try {
        tagged = await getPaged(
          `${BASE}/${igUserId}/tags?fields=${FIELDS}&${AT}`,
          TAKE_TAGGED,
          PER_TAGGED
        );
      } catch (_) {
        // ігноруємо — просто не буде tagged
      }
    }

    // 3) мерджимо, сортуємо, ріжемо
    const merged = dedupeById([...own, ...tagged])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    // 4) для каруселей докачуємо children тільки для відібраних
    const final = await enrichCarousels(merged, BASE, AT);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // CDN-кеш на 5 хв, а браузеру можна 0 — якщо потрібно
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60"
      },
      body: JSON.stringify(final)
    };
  } catch (e) {
    return json(500, { error: "Instagram proxy error", details: e.message });
  }
}

/* ---------- helpers ---------- */

async function enrichCarousels(items, BASE, AT) {
  // зменшуємо паралелізм: максимум 4 каруселі одночасно
  const carousels = items
    .map((it, i) => ({ it, i }))
    .filter(x => x.it.media_type === "CAROUSEL_ALBUM")
    .slice(0, 4);

  for (const { it, i } of carousels) {
    try {
      const url = `${BASE}/${it.id}/children?fields=id,media_type,media_url,thumbnail_url&${AT}&limit=10`;
      const r = await fetch(url);
      const j = await r.json();
      if (Array.isArray(j.data)) {
        items[i] = { ...it, children: j.data };
      }
    } catch (_) {
      // не критично — лишимо без children
    }
  }
  return items;
}

async function getPaged(urlBase, take, pageSize) {
  let out = [];
  let after = null;

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
  const seen = new Set();
  const res = [];
  for (const it of arr) {
    if (!it || !it.id) continue;
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    res.push(it);
  }
  return res;
}

function clampInt(raw, def, min, max) {
  const n = parseInt(raw ?? def, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function toBool(v) {
  return String(v).trim() === "1" || String(v).toLowerCase() === "true";
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj)
  };
}
