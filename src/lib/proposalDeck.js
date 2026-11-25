// Proposal presentation (Project → Proposals): a slide deck to present the proposal to a future
// customer. The AI only turns the proposal document into slide text (deckPrompt); the cover, the
// investment slides (numbers computed by the platform, same as the document) and the closing slide
// are added here. buildDeckHtml returns a self-contained 16:9 presentation: arrows / click / swipe
// to move, F for full screen, and Print → one slide per PDF page.
import { proposalMdToHtml } from "./proposals.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = s => esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
// Arena "Nova" mark, static: the orb with the A, two orbit rings and three orbiting dots
// (same proportions and colors as NovaLandingMark in the landing page).
export function novaMarkSvg(size = 40, uid = "n") {
  const dot = (deg, r, z, c) => { const a = deg * Math.PI / 180; return `<circle cx="${(76 + r * Math.cos(a)).toFixed(1)}" cy="${(76 + r * Math.sin(a)).toFixed(1)}" r="${z / 2}" fill="${c}" filter="url(#${uid}g)"/>`; };
  return `<svg width="${size}" height="${size}" viewBox="0 0 152 152" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><radialGradient id="${uid}o" cx="36%" cy="33%" r="70%"><stop offset="0" stop-color="#4F6EF7"/><stop offset="1" stop-color="#0D1F3C"/></radialGradient>
<filter id="${uid}g" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${uid}s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#4F6EF7" flood-opacity=".55"/></filter></defs>
<circle cx="76" cy="76" r="54" fill="none" stroke="rgba(79,110,247,.35)" stroke-width="1.5"/>
<circle cx="76" cy="76" r="74" fill="none" stroke="rgba(79,110,247,.18)" stroke-width="1.5"/>
<circle cx="76" cy="76" r="26" fill="url(#${uid}o)" filter="url(#${uid}s)"/>
<text x="76" y="76" dy=".35em" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-weight="800" font-size="30" fill="#fff" letter-spacing="-1">A</text>
${dot(0, 54, 13, "#2563EB")}${dot(195, 54, 10, "#60A5FA")}${dot(100, 74, 11, "#3B82F6")}
</svg>`;
}

const LAYOUTS = ["statement", "bullets", "cards", "steps", "timeline", "two_columns"];

/** System + user prompt that turns the proposal document (markdown) into slide JSON. */
export function deckPrompt({ markdown, lang, title, customer, project, type }) {
  const langName = lang === "es" ? "Spanish" : "English";
  const system = `You turn a commercial proposal document into the slides of a short sales presentation for the customer.
Write in ${langName}. Use ONLY facts from the document: never invent figures, durations, names, clients or results.
Never write prices, rates, amounts or hour totals: the platform adds the investment slides itself.
Return ONLY a JSON object (no code fences): {"slides":[...]} with 6 to 9 slides, in this order where the document has the material:
1. why we are here (the customer's situation and needs), 2. objectives / what they get, 3. proposed scope (${type === "cases" ? "one card per case" : "the service and its structure"}),
4. approach / how we work, 5. timeline or service process, 6. team / roles, 7. deliverables or what is included, 8. key assumptions, 9. next steps.
Each slide: {"layout": one of ${LAYOUTS.map(l => `"${l}"`).join(", ")}, "title": short (max 8 words), "kicker": 1-3 word label, "lead": optional one sentence,
"items": [{"title": short (max 6 words), "text": max 25 words}] (2 to 6 items; for "bullets" use only "text"), and for "two_columns" also "left_title","right_title" with items having "side":"left"|"right"}.
Use "statement" (no items, a strong "lead") at most once. Use "timeline" or "steps" for sequences. Keep text short: slides, not paragraphs.`;
  const user = `PROPOSAL: ${title}\nCustomer: ${customer || "—"}\nProject: ${project || "—"}\n\nDOCUMENT:\n${String(markdown ?? "").slice(0, 30000)}`;
  return { system, user };
}

/** Parse the AI answer into a clean slide list. */
export function parseDeck(text) {
  const raw = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  const obj = JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw);
  const slides = (Array.isArray(obj) ? obj : obj.slides ?? []).filter(s => s && s.title).slice(0, 12).map(s => ({
    layout: LAYOUTS.includes(s.layout) ? s.layout : "bullets",
    title: String(s.title).slice(0, 120), kicker: s.kicker ? String(s.kicker).slice(0, 40) : "",
    lead: s.lead ? String(s.lead).slice(0, 300) : "",
    left_title: s.left_title ?? "", right_title: s.right_title ?? "",
    items: (Array.isArray(s.items) ? s.items : []).slice(0, 8).map(i => typeof i === "string" ? { text: i } : {
      title: i.title ? String(i.title).slice(0, 80) : "", text: i.text ? String(i.text).slice(0, 300) : "", side: i.side === "right" ? "right" : "left",
    }),
  }));
  if (!slides.length) throw new Error("The AI returned no slides.");
  return slides;
}

// Split the investment markdown into slides: one per "### " block (the first block keeps the intro).
function investmentChunks(md) {
  const lines = String(md ?? "").split("\n").filter(l => !/^## /.test(l));
  const chunks = []; let cur = [];
  for (const l of lines) {
    if (/^### /.test(l) && cur.some(x => x.trim())) { chunks.push(cur.join("\n")); cur = []; }
    cur.push(l);
  }
  if (cur.some(x => x.trim())) chunks.push(cur.join("\n"));
  // Long tables continue on the next slide (header repeated) so nothing is cut off.
  const MAX_ROWS = 8;
  return chunks.flatMap(c => {
    const ls = c.split("\n");
    const t0 = ls.findIndex(l => l.startsWith("|"));
    if (t0 < 0) return [c];
    let t1 = t0; while (t1 < ls.length && ls[t1].startsWith("|")) t1++;
    const head = ls.slice(t0, t0 + 2), rows = ls.slice(t0 + 2, t1);
    if (rows.length <= MAX_ROWS) return [c];
    const pages = [];
    for (let k = 0; k < rows.length; k += MAX_ROWS) {
      const before = k === 0 ? ls.slice(0, t0) : [];
      const after = k + MAX_ROWS >= rows.length ? ls.slice(t1) : [];
      pages.push([...before, ...head, ...rows.slice(k, k + MAX_ROWS), ...after].join("\n"));
    }
    return pages;
  });
}

function slideHtml(s, i, chrome = "") {
  const items = s.items ?? [];
  const head = `${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}<h2>${esc(s.title)}</h2>${s.lead ? `<p class="lead">${fmt(s.lead)}</p>` : ""}`;
  let body = "";
  if (s.layout === "statement") {
    return `<section class="slide statement">${chrome}<div class="inner">${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}<h2>${esc(s.title)}</h2>${s.lead ? `<p class="big">${fmt(s.lead)}</p>` : ""}${items.length ? `<ul class="bul">${items.map(it => `<li>${fmt(it.text || it.title)}</li>`).join("")}</ul>` : ""}</div><div class="pg">${i}</div></section>`;
  }
  if (s.layout === "bullets") body = `<ul class="bul">${items.map(it => `<li>${it.title ? `<strong>${esc(it.title)}</strong> — ` : ""}${fmt(it.text)}</li>`).join("")}</ul>`;
  else if (s.layout === "cards") body = `<div class="cards c${Math.min(items.length, 4)}">${items.map((it, k) => `<div class="card"><div class="num">${String(k + 1).padStart(2, "0")}</div><h3>${esc(it.title)}</h3><p>${fmt(it.text)}</p></div>`).join("")}</div>`;
  else if (s.layout === "steps") body = `<div class="steps">${items.map((it, k) => `<div class="step"><div class="dot">${k + 1}</div><h3>${esc(it.title)}</h3><p>${fmt(it.text)}</p></div>`).join("")}</div>`;
  else if (s.layout === "timeline") body = `<div class="tl">${items.map(it => `<div class="tl-row"><div class="tl-when">${esc(it.title)}</div><div class="tl-bar"></div><div class="tl-what">${fmt(it.text)}</div></div>`).join("")}</div>`;
  else if (s.layout === "two_columns") {
    const col = side => items.filter(it => (it.side ?? "left") === side).map(it => `<li>${it.title ? `<strong>${esc(it.title)}</strong> — ` : ""}${fmt(it.text)}</li>`).join("");
    body = `<div class="cols"><div class="col"><h3>${esc(s.left_title)}</h3><ul class="bul">${col("left")}</ul></div><div class="col"><h3>${esc(s.right_title)}</h3><ul class="bul">${col("right")}</ul></div></div>`;
  }
  return `<section class="slide">${chrome}<div class="inner">${head}${body}</div><div class="pg">${i}</div></section>`;
}

/**
 * Self-contained presentation HTML.
 * slides: from parseDeck · investmentMd: the platform's investment markdown (never AI)
 * figures: [{label, value}] key numbers for the cover of the investment section
 */
export function buildDeckHtml({ slides, lang = "en", title, customer, project, preparedBy, logoUrl, date, validUntil, investmentMd, figures = [], contact }) {
  const es = lang === "es";
  const T = es
    ? { inv: "Inversión", invK: "Inversión", thanks: "Gracias", next: "Siguiente paso", valid: "Propuesta válida hasta", for: "Propuesta para", by: "Preparada por", help: "← → para avanzar · F pantalla completa · P imprimir / PDF", full: "Pantalla completa" }
    : { inv: "Investment", invK: "Investment", thanks: "Thank you", next: "Next step", valid: "Proposal valid until", for: "Proposal for", by: "Prepared by", help: "← → to move · F full screen · P print / PDF", full: "Full screen" };
  // Partner logo (as uploaded, transparent background) followed by the partner name.
  const partnerMark = cls => `<span class="partner ${cls}">${logoUrl ? `<img class="plogo" src="${esc(logoUrl)}" alt="">` : ""}${preparedBy ? `<span class="pname">${esc(preparedBy)}</span>` : ""}</span>`;
  const arena = (size, uid) => `<span class="arena-brand">${novaMarkSvg(size, uid)}<span class="aw"><b>Arena</b> Solutions Platform</span></span>`;
  let u = 0;
  const chrome = () => `<div class="chrome">${arena(34, `c${u++}`)}${partnerMark("")}</div>`;
  const coverBrands = () => `<div class="brands">${arena(52, `v${u++}`)}${logoUrl || preparedBy ? `<span class="x">×</span>${partnerMark("big")}` : ""}</div>`;
  const out = [];
  out.push(`<section class="slide cover"><div class="glow"></div><div class="grid"></div><div class="orbit-deco">${novaMarkSvg(520, "deco1")}</div><div class="inner">${coverBrands()}<div class="kicker">${esc(T.for)} ${esc(customer || "")}</div><h1>${esc(title)}</h1><p class="sub">${esc(project || "")}</p><div class="cover-meta"><span class="by">${esc(T.by)}: ${partnerMark("inline")}</span>${date ? `<span>${esc(date)}</span>` : ""}</div></div></section>`);
  let n = 2;
  for (const s of slides) out.push(slideHtml(s, n++, chrome()));
  const chunks = investmentChunks(investmentMd);
  chunks.forEach((c, k) => {
    const figs = k === 0 && figures.length ? `<div class="figs">${figures.map(f => `<div class="fig"><div class="fv">${esc(f.value)}</div><div class="fl">${esc(f.label)}</div></div>`).join("")}</div>` : "";
    out.push(`<section class="slide inv">${chrome()}<div class="inner"><div class="kicker">${esc(T.invK)}</div><h2>${esc(T.inv)}</h2>${figs}<div class="md">${proposalMdToHtml(c)}</div></div><div class="pg">${n++}</div></section>`);
  });
  out.push(`<section class="slide cover closing"><div class="glow"></div><div class="grid"></div><div class="orbit-deco">${novaMarkSvg(520, "deco2")}</div><div class="inner">${coverBrands()}<h1>${esc(T.thanks)}</h1><p class="sub">${esc(title)}</p><div class="cover-meta">${validUntil ? `<span>${esc(T.valid)}: <b>${esc(validUntil)}</b></span>` : ""}${contact ? `<span>${esc(contact)}</span>` : ""}</div></div></section>`);

  return `<!DOCTYPE html>
<html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(customer || "")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
:root{--accent:#4F6EF7;--accent-d:#3A56D4;--ink:#0B0F1A;--muted:#64748B;--border:#E2E8F0;--surface2:#F1F5FE;--base:#F8FAFF;--emerald:#10B981}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0B0F1A;font-family:'Inter',system-ui,sans-serif;color:var(--ink)}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
#deck{width:1280px;height:720px;flex:none;position:relative;transform-origin:center center}
.slide{position:absolute;inset:0;background:var(--base);display:none;overflow:hidden;border-radius:6px}
.slide.on{display:block}
.inner{position:absolute;inset:112px 80px 64px}
.chrome{position:absolute;top:0;left:0;right:0;height:72px;padding:0 48px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#0B0F1A 0%,#111829 50%,#0D1630 100%);border-bottom:1px solid rgba(79,110,247,.35)}
.chrome .aw{color:rgba(255,255,255,.6)}
.arena-brand{display:inline-flex;align-items:center;gap:10px}
.aw{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:600;color:var(--muted);letter-spacing:-.01em}.aw b{color:var(--accent);font-weight:800;font-size:18px;margin-right:2px}
.partner{display:inline-flex;align-items:center;gap:10px}.plogo{height:36px;max-width:150px;object-fit:contain;display:block}
.pname{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:16px;color:#fff;letter-spacing:-.01em}
.kicker{font-family:'Inter',sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
h1{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:64px;line-height:1.08;letter-spacing:-.04em}
h2{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:42px;line-height:1.12;letter-spacing:-.035em;color:var(--ink);margin-bottom:12px}
h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:19px;font-weight:700;color:var(--ink);margin-bottom:8px;letter-spacing:-.01em}
p{font-size:18px;line-height:1.55;color:var(--muted)}
.lead{font-size:20px;max-width:980px;margin-bottom:26px}
.pg{position:absolute;right:48px;bottom:24px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#94A3B8}
.cover{background:linear-gradient(135deg,#0B0F1A 0%,#111829 50%,#0D1630 100%);color:#fff}
.cover .glow{position:absolute;width:760px;height:760px;right:-200px;top:-260px;border-radius:50%;background:radial-gradient(circle,rgba(79,110,247,.28),transparent 65%)}
.cover .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(180deg,#000,transparent 85%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%)}
.orbit-deco{position:absolute;right:-90px;bottom:-130px;opacity:.22}
.cover .inner{inset:64px 80px 64px;display:flex;flex-direction:column;justify-content:center}
.brands{position:absolute;top:0;left:0;display:flex;align-items:center;gap:18px}
.cover .aw{color:rgba(255,255,255,.55);font-size:17px}.cover .aw b{font-size:22px}
.brands .x{color:rgba(255,255,255,.35);font-size:22px}
.partner.big .plogo{height:52px;max-width:200px}.partner.big .pname{font-size:20px}
.by{display:inline-flex;align-items:center;gap:8px}.partner.inline{gap:8px}.partner.inline .plogo{height:26px;max-width:110px}.partner.inline .pname{font-size:15px}
.cover .kicker{color:#A5B4FC}.cover h1{color:#fff;max-width:980px}
.cover .sub{color:rgba(255,255,255,.6);font-size:22px;margin-top:14px}
.cover-meta{display:flex;gap:28px;margin-top:40px;font-size:15px;color:rgba(255,255,255,.55)}.cover-meta b{color:#fff;font-weight:600}
.statement{background:#fff}.statement .inner{display:flex;flex-direction:column;justify-content:center}
.statement h2{font-size:50px;max-width:1000px}.big{font-size:26px;line-height:1.45;color:var(--ink);max-width:1000px}
.bul{list-style:none;display:flex;flex-direction:column;gap:14px;margin-top:6px}
.bul li{position:relative;padding-left:32px;font-size:20px;line-height:1.45;color:var(--ink)}
.bul li::before{content:"";position:absolute;left:0;top:7px;width:18px;height:18px;border-radius:6px;background:rgba(79,110,247,.12);box-shadow:inset 0 0 0 5px rgba(79,110,247,.12)}
.bul li::after{content:"";position:absolute;left:6px;top:13px;width:6px;height:6px;border-radius:2px;background:var(--accent)}
.cards{display:grid;gap:18px;margin-top:8px}.cards.c1{grid-template-columns:1fr}.cards.c2{grid-template-columns:1fr 1fr}.cards.c3{grid-template-columns:repeat(3,1fr)}.cards.c4{grid-template-columns:repeat(4,1fr)}
.cards:has(.card:nth-child(5)){grid-template-columns:repeat(3,1fr)}
.card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:22px;box-shadow:0 1px 2px rgba(11,15,26,.04)}
.card .num{width:36px;height:36px;border-radius:8px;background:rgba(79,110,247,.1);color:var(--accent);display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:14px;margin-bottom:12px}.card p{font-size:15px}
.steps{display:flex;gap:18px;margin-top:20px}.step{flex:1;position:relative;padding-top:58px}
.step .dot{position:absolute;top:0;left:0;width:42px;height:42px;border-radius:12px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;box-shadow:0 6px 16px rgba(79,110,247,.35)}
.step:not(:last-child)::before{content:"";position:absolute;top:21px;left:52px;right:-8px;height:2px;background:linear-gradient(90deg,rgba(79,110,247,.5),var(--border))}
.step p{font-size:15px}
.tl{display:flex;flex-direction:column;gap:12px;margin-top:8px;position:relative}.tl-row{display:grid;grid-template-columns:200px 16px 1fr;gap:20px;align-items:center;background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 20px}
.tl-when{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:17px;color:var(--accent)}.tl-bar{width:12px;height:12px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(79,110,247,.15)}
.tl-what{font-size:17px;color:var(--ink)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px}.col{background:#fff;border:1px solid var(--border);border-radius:16px;padding:24px}.col .bul li{font-size:17px}
.figs{display:flex;gap:14px;margin:4px 0 18px}.fig{flex:1;background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 18px}
.fv{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:28px;letter-spacing:-.03em;color:var(--ink)}.fl{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.fig:first-child{background:linear-gradient(135deg,#0B0F1A,#0D1630);border-color:#0D1630}.fig:first-child .fv{color:#fff}.fig:first-child .fl{color:#A5B4FC}
.md{max-height:380px;overflow:hidden}.md h3{font-size:17px;margin:8px 0}.md p{font-size:14px;margin-bottom:8px}.md ul{padding-left:22px}.md li{font-size:15px;color:var(--muted)}
.md .tbl-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff}
.md table{width:100%;border-collapse:collapse;font-size:13.5px}.md th{background:#0B0F1A;color:#fff;text-align:left;padding:8px 12px;font-weight:600}
.md td{padding:7px 12px;border-bottom:1px solid var(--border);color:var(--ink)}.md tr:last-child td{border-bottom:0}
#bar{position:fixed;left:0;bottom:0;height:3px;background:var(--accent);transition:width .25s}
#help{position:fixed;right:14px;bottom:10px;font:12px 'Inter',sans-serif;color:rgba(255,255,255,.45)}
#tools{position:fixed;bottom:8px;left:12px;display:flex;gap:6px;opacity:.35;transition:opacity .2s;z-index:5}#tools:hover{opacity:1}#tools button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:6px 10px;font:600 13px 'Inter',sans-serif;cursor:pointer}
@media print{@page{size:1280px 720px;margin:0}html,body{background:#fff}#stage{position:static;display:block}#deck{transform:none!important;width:auto;height:auto}
.slide{display:block!important;position:relative;width:1280px;height:720px;border-radius:0;page-break-after:always;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}#bar,#help,#tools{display:none}}
</style></head><body>
<div id="stage"><div id="deck">${out.join("\n")}</div></div>
<div id="bar"></div><div id="help">${esc(T.help)}</div>
<div id="tools"><button onclick="fs()">${esc(T.full)}</button><button onclick="window.print()">PDF</button></div>
<script>
var S=[].slice.call(document.querySelectorAll('.slide')),i=0,deck=document.getElementById('deck');
function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(s,k){s.classList.toggle('on',k===i)});document.getElementById('bar').style.width=((i+1)/S.length*100)+'%';try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
function fit(){var w=innerWidth||document.documentElement.clientWidth,h=innerHeight||document.documentElement.clientHeight;if(!w||!h)return;var k=Math.min(w/1280,h/720)*0.96;deck.style.transform='scale('+k+')'}
function fs(){var d=document.documentElement;if(!document.fullscreenElement){(d.requestFullscreen||d.webkitRequestFullscreen||function(){}).call(d)}else{document.exitFullscreen&&document.exitFullscreen()}}
addEventListener('resize',fit);
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1);else if(e.key==='f'||e.key==='F')fs();else if(e.key==='p'||e.key==='P')window.print()});
document.getElementById('stage').addEventListener('click',function(e){show(e.clientX>innerWidth/3?i+1:i-1)});
var tx=null;addEventListener('touchstart',function(e){tx=e.touches[0].clientX},{passive:true});addEventListener('touchend',function(e){if(tx===null)return;var d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>40)show(d<0?i+1:i-1);tx=null});
var emb=false;try{emb=window.self!==window.top}catch(e){emb=true}if(emb){document.getElementById('tools').style.display='none';document.getElementById('help').style.display='none'}
if(window.ResizeObserver)new ResizeObserver(fit).observe(document.documentElement);addEventListener('load',fit);setTimeout(fit,50);setTimeout(fit,400);
fit();show((parseInt(location.hash.slice(1),10)||1)-1);
</script></body></html>`;
}
