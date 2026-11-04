// Node 18+. Coleta vídeos do YouTube por hashtag, salva no Supabase e gera ideias com Claude.
const { YT_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY } = process.env;
const BASE = (SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const QUERIES = ["#gta6", "#gta6trailer", "#gta6leonida", "#gtavi"];
const sbH = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" };

const dur = (iso) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };

async function yt(path, params) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: YT_KEY })}`);
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sb(path, opts = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { ...opts, headers: { ...sbH, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function makeIdea(v) {
  const prompt = `Você ajuda criadores brasileiros de conteúdo sobre GTA 6. Com base neste vídeo, sugira UM ângulo original para outro criador fazer a sua própria versão (sem copiar). Responda só JSON: {"format":"Short|Vídeo|Teoria|Comparação","idea":"até 220 caracteres, em português, com um gancho"}.\nTítulo: ${v.title}\nCanal: ${v.channel}\nDuração: ${v.duration_s}s\nDescrição: ${(v.description || "").slice(0, 500)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json();
  const txt = (j.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
  return JSON.parse(txt);
}

(async () => {
  const after = new Date(Date.now() - 48 * 3600e3).toISOString();
  const ids = new Set();
  for (const q of QUERIES) {
    const s = await yt("search", { part: "id", q, type: "video", order: "date", maxResults: 50, publishedAfter: after, regionCode: "BR", relevanceLanguage: "pt" });
    s.items.forEach((i) => ids.add(i.id.videoId));
  }
  const list = [...ids];
  const rows = [], desc = {};
  for (let i = 0; i < list.length; i += 50) {
    const d = await yt("videos", { part: "snippet,statistics,contentDetails", id: list.slice(i, i + 50).join(",") });
    for (const v of d.items) {
      const txt = (v.snippet.title + " " + v.snippet.description).toLowerCase();
      if (!/#?gta\s?(6|vi)|leonida|vice city/.test(txt)) continue;
      desc[v.id] = v.snippet.description;
      rows.push({
        id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, duration_s: dur(v.contentDetails.duration),
        views: +v.statistics.viewCount || 0, published_at: v.snippet.publishedAt,
        thumb: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
      });
    }
  }
  if (rows.length) await sb("videos?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  console.log(`${rows.length} vídeos salvos`);

  if (!ANTHROPIC_API_KEY) return;
  const have = new Set((await sb("ideas?select=video_id")).map((x) => x.video_id));
  for (const v of rows.filter((r) => !have.has(r.id)).slice(0, 40)) {
    try {
      const o = await makeIdea({ ...v, description: desc[v.id] });
      await sb(`videos?id=eq.${v.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ format: o.format }) });
      await sb("ideas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ video_id: v.id, idea: o.idea }) });
    } catch (e) { console.error("ideia falhou", v.id, e.message); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
