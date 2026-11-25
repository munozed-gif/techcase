// Proposal presentation (Project → Proposals): a slide deck to present the proposal to a future
// customer. The AI only turns the proposal document into slide text (deckPrompt); the cover, the
// investment slides (numbers computed by the platform, same as the document) and the closing slide
// are added here. buildDeckHtml returns a self-contained 16:9 presentation: arrows / click / swipe
// to move, F for full screen, and Print → one slide per PDF page.
import { proposalMdToHtml } from "./proposals.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = s => esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
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

function slideHtml(s, i) {
  const items = s.items ?? [];
  const head = `${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}<h2>${esc(s.title)}</h2>${s.lead ? `<p class="lead">${fmt(s.lead)}</p>` : ""}`;
  let body = "";
  if (s.layout === "statement") {
    return `<section class="slide statement"><div class="inner">${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}<h2>${esc(s.title)}</h2>${s.lead ? `<p class="big">${fmt(s.lead)}</p>` : ""}${items.length ? `<ul class="bul">${items.map(it => `<li>${fmt(it.text || it.title)}</li>`).join("")}</ul>` : ""}</div></section>`;
  }
  if (s.layout === "bullets") body = `<ul class="bul">${items.map(it => `<li>${it.title ? `<strong>${esc(it.title)}</strong> — ` : ""}${fmt(it.text)}</li>`).join("")}</ul>`;
  else if (s.layout === "cards") body = `<div class="cards c${Math.min(items.length, 4)}">${items.map((it, k) => `<div class="card"><div class="num">${String(k + 1).padStart(2, "0")}</div><h3>${esc(it.title)}</h3><p>${fmt(it.text)}</p></div>`).join("")}</div>`;
  else if (s.layout === "steps") body = `<div class="steps">${items.map((it, k) => `<div class="step"><div class="dot">${k + 1}</div><h3>${esc(it.title)}</h3><p>${fmt(it.text)}</p></div>`).join("")}</div>`;
  else if (s.layout === "timeline") body = `<div class="tl">${items.map(it => `<div class="tl-row"><div class="tl-when">${esc(it.title)}</div><div class="tl-bar"></div><div class="tl-what">${fmt(it.text)}</div></div>`).join("")}</div>`;
  else if (s.layout === "two_columns") {
    const col = side => items.filter(it => (it.side ?? "left") === side).map(it => `<li>${it.title ? `<strong>${esc(it.title)}</strong> — ` : ""}${fmt(it.text)}</li>`).join("");
    body = `<div class="cols"><div class="col"><h3>${esc(s.left_title)}</h3><ul class="bul">${col("left")}</ul></div><div class="col"><h3>${esc(s.right_title)}</h3><ul class="bul">${col("right")}</ul></div></div>`;
  }
  return `<section class="slide"><div class="inner">${head}${body}</div><div class="pg">${i}</div></section>`;
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
  const logo = logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="">` : `<div class="brand">${esc(preparedBy || "Arena")}</div>`;
  const out = [];
  out.push(`<section class="slide cover"><div class="inner">${logo}<div class="kicker">${esc(T.for)} ${esc(customer || "")}</div><h1>${esc(title)}</h1><p class="sub">${esc(project || "")}</p><div class="cover-meta"><span>${esc(T.by)}: <b>${esc(preparedBy || "")}</b></span>${date ? `<span>${esc(date)}</span>` : ""}</div></div></section>`);
  let n = 2;
  for (const s of slides) out.push(slideHtml(s, n++));
  const chunks = investmentChunks(investmentMd);
  chunks.forEach((c, k) => {
    const figs = k === 0 && figures.length ? `<div class="figs">${figures.map(f => `<div class="fig"><div class="fv">${esc(f.value)}</div><div class="fl">${esc(f.label)}</div></div>`).join("")}</div>` : "";
    out.push(`<section class="slide inv"><div class="inner"><div class="kicker">${esc(T.invK)}</div><h2>${esc(T.inv)}</h2>${figs}<div class="md">${proposalMdToHtml(c)}</div></div><div class="pg">${n++}</div></section>`);
  });
  out.push(`<section class="slide cover closing"><div class="inner">${logo}<h1>${esc(T.thanks)}</h1><p class="sub">${esc(title)}</p><div class="cover-meta">${validUntil ? `<span>${esc(T.valid)}: <b>${esc(validUntil)}</b></span>` : ""}${contact ? `<span>${esc(contact)}</span>` : ""}</div></div></section>`);

  return `<!DOCTYPE html>
<html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(customer || "")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
:root{--navy:#1A2A4A;--blue:#1254A0;--accent:#4F6EF7;--ink:#1A2A4A;--muted:#55627E;--line:#DDE1EE;--soft:#F3F5FB}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0B1220;font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--ink)}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
#deck{width:1280px;height:720px;position:relative;transform-origin:center center}
.slide{position:absolute;inset:0;background:#fff;display:none;overflow:hidden;border-radius:6px}
.slide.on{display:block}
.inner{position:absolute;inset:64px 80px 56px}
.kicker{font-family:'IBM Plex Mono',monospace;font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
h1{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:64px;line-height:1.08}
h2{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:44px;line-height:1.12;color:var(--navy);margin-bottom:14px}
h3{font-size:20px;font-weight:600;color:var(--navy);margin-bottom:8px}
p{font-size:18px;line-height:1.5;color:var(--muted)}
.lead{font-size:21px;max-width:960px;margin-bottom:26px}
.slide::after{content:"";position:absolute;left:80px;bottom:36px;width:56px;height:4px;border-radius:2px;background:var(--accent)}
.pg{position:absolute;right:48px;bottom:28px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#9AA5BE}
.cover{background:radial-gradient(circle at 85% 15%,rgba(79,110,247,.35),transparent 45%),var(--navy);color:#fff}
.cover::after{background:#fff;opacity:.4}
.cover .inner{display:flex;flex-direction:column;justify-content:center}
.cover .kicker{color:#A5B4FC}.cover h1{color:#fff;max-width:1000px}
.cover .sub{color:rgba(255,255,255,.7);font-size:24px;margin-top:14px}
.cover-meta{display:flex;gap:32px;margin-top:44px;font-size:16px;color:rgba(255,255,255,.65)}.cover-meta b{color:#fff;font-weight:600}
.logo{position:absolute;top:0;left:0;max-height:52px;max-width:220px;object-fit:contain;background:#fff;border-radius:8px;padding:6px 10px}
.brand{position:absolute;top:0;left:0;font-family:'IBM Plex Mono',monospace;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.75)}
.statement{background:var(--soft)}.statement .inner{display:flex;flex-direction:column;justify-content:center}
.statement h2{font-size:52px;max-width:1000px}.big{font-size:28px;line-height:1.45;color:var(--ink);max-width:1000px}
.bul{list-style:none;display:flex;flex-direction:column;gap:16px;margin-top:8px}
.bul li{position:relative;padding-left:30px;font-size:21px;line-height:1.45;color:var(--ink)}
.bul li::before{content:"";position:absolute;left:0;top:11px;width:12px;height:12px;border-radius:3px;background:var(--accent)}
.cards{display:grid;gap:20px;margin-top:10px}.cards.c1{grid-template-columns:1fr}.cards.c2{grid-template-columns:1fr 1fr}.cards.c3{grid-template-columns:repeat(3,1fr)}.cards.c4{grid-template-columns:repeat(4,1fr)}
.cards:has(.card:nth-child(5)){grid-template-columns:repeat(3,1fr)}
.card{background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:22px}
.card .num{font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--accent);margin-bottom:10px}.card p{font-size:16px}
.steps{display:flex;gap:18px;margin-top:20px}.step{flex:1;position:relative;padding-top:56px}
.step .dot{position:absolute;top:0;left:0;width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600}
.step:not(:last-child)::before{content:"";position:absolute;top:20px;left:48px;right:-10px;height:2px;background:var(--line)}
.step p{font-size:16px}
.tl{display:flex;flex-direction:column;gap:14px;margin-top:10px}.tl-row{display:grid;grid-template-columns:220px 14px 1fr;gap:18px;align-items:center}
.tl-when{font-weight:600;font-size:18px;color:var(--navy);text-align:right}.tl-bar{width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(79,110,247,.15)}
.tl-what{font-size:18px;color:var(--muted)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:8px}.col{background:var(--soft);border-radius:14px;padding:24px}.col .bul li{font-size:18px}
.figs{display:flex;gap:16px;margin:6px 0 20px}.fig{flex:1;border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.fv{font-family:'DM Serif Display',serif;font-size:32px;color:var(--navy)}.fl{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.md{max-height:400px;overflow:hidden}.md h3{font-size:17px;margin:8px 0}.md p{font-size:15px;margin-bottom:8px}.md ul{padding-left:22px}.md li{font-size:15px;color:var(--muted)}
.md table{width:100%;border-collapse:collapse;font-size:14px}.md th{background:var(--navy);color:#fff;text-align:left;padding:7px 10px;font-weight:500}
.md td{padding:6px 10px;border-bottom:1px solid var(--line)}
#bar{position:fixed;left:0;bottom:0;height:3px;background:var(--accent);transition:width .25s}
#help{position:fixed;right:14px;bottom:10px;font:12px 'IBM Plex Sans',sans-serif;color:rgba(255,255,255,.45)}
#tools{position:fixed;top:12px;right:12px;display:flex;gap:6px}#tools button{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 10px;font:13px 'IBM Plex Sans',sans-serif;cursor:pointer}
@media print{@page{size:1280px 720px;margin:0}html,body{background:#fff}#stage{position:static;display:block}#deck{transform:none!important;width:auto;height:auto}
.slide{display:block!important;position:relative;width:1280px;height:720px;border-radius:0;page-break-after:always;break-after:page}#bar,#help,#tools{display:none}}
</style></head><body>
<div id="stage"><div id="deck">${out.join("\n")}</div></div>
<div id="bar"></div><div id="help">${esc(T.help)}</div>
<div id="tools"><button onclick="fs()">${esc(T.full)}</button><button onclick="window.print()">PDF</button></div>
<script>
var S=[].slice.call(document.querySelectorAll('.slide')),i=0,deck=document.getElementById('deck');
function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(s,k){s.classList.toggle('on',k===i)});document.getElementById('bar').style.width=((i+1)/S.length*100)+'%';try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
function fit(){var k=Math.min(innerWidth/1280,innerHeight/720)*0.96;deck.style.transform='scale('+k+')'}
function fs(){var d=document.documentElement;if(!document.fullscreenElement){(d.requestFullscreen||d.webkitRequestFullscreen||function(){}).call(d)}else{document.exitFullscreen&&document.exitFullscreen()}}
addEventListener('resize',fit);
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1);else if(e.key==='f'||e.key==='F')fs();else if(e.key==='p'||e.key==='P')window.print()});
document.getElementById('stage').addEventListener('click',function(e){show(e.clientX>innerWidth/3?i+1:i-1)});
var tx=null;addEventListener('touchstart',function(e){tx=e.touches[0].clientX},{passive:true});addEventListener('touchend',function(e){if(tx===null)return;var d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>40)show(d<0?i+1:i-1);tx=null});
fit();show((parseInt(location.hash.slice(1),10)||1)-1);
</script></body></html>`;
}
