// netlify/functions/refresh.js
export async function handler(event) {
  const token   = process.env.IG_TOKEN;
  const igUserId = process.env.IG_USER_ID || "17841458100536914";

  if (!token) {
    return json(500, { ok: false, error: "IG_TOKEN is missing" });
  }

  // Параметри з можливістю ручного зменшення під час тесту
  const ownTake    = clampInt(event.queryStringParameters?.own,    24, 1, 100);
  const taggedTake = clampInt(event.queryStringParameters?.tagged,  8, 0,  50);
  const perOwn     = clampInt(event.queryStringParameters?.perOwn, 10, 5,  25); // розмір сторінки
  const perTagged  = clampInt(event.queryStringParameters?.perTagged, 6, 3, 15);

  const base = "https://graph.facebook.com/v18.0";
  const fields = "id,caption,media_type,media_url,permalink,timestamp"; // легкий набір полів

  try {
    // 1) Власні пости (пагінацією малими сторінками)
    const own = await getPaged(
      `${base}/${igUserId}/media?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      ownTake,
      perOwn
    );

    // 2) Tagged-пости (часто падає, робимо окремо і обережно)
    let tagged = [];
    if (taggedTake > 0) {
      try {
        tagged = await getPaged(
          `${base}/${igUserId}/tags?fields=${fields}&access_token=${encodeURIComponent(token)}`,
          taggedTake,
          perTagged
        );
      } catch (e) {
        // Якщо саме /tags «задушився», віддаємо хоча б own і підказуємо як зменшити
        return json(200, {
          ok: true,
          partial: true,
          saved: own.length,
          hint: "Tagged fetch failed; try smaller tagged/perTagged (e.g. tagged=4&perTagged=5).",
          error: e.message
        });
      }
    }

    // 3) Дедуп + сортування
    const merged = dedupeById([...own, ...tagged])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return json(200, { ok: true, saved: merged.length });
  } catch (e) {
    return json(500, { ok: false, error: e.message });
  }
}

// ------ helpers ------

function clampInt(raw, def, min, max) {
  const n = parseInt(raw ?? def, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Пагінація малими сторінками, поки не зберемо take або не закінчиться cursor
async function getPaged(urlBase, take, pageSize) {
  let out = [];
  let after = null;

  while (out.length < take) {
    const url = `${urlBase}&limit=${pageSize}${after ? `&after=${after}` : ""}`;
    const r = await fetch(url);
    const j = await r.json();

    if (j.error) {
      // IG «code 1» виглядає як j.error.message містить "Please reduce the amount of data…"
      throw new Error(j.error.message || "Instagram API error");
    }

    const batch = Array.isArray(j.data) ? j.data : [];
    out = out.concat(batch);

    after = j.paging?.cursors?.after;
    if (!after || batch.length === 0) break;
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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj)
  };
}
