// Open stored documents correctly. Supabase Storage serves HTML files as text/plain without a
// charset (to prevent XSS), so a plain link shows the source with garbled accents. HTML files are
// fetched (UTF-8) and written into a new tab instead. The tab is opened synchronously, before any
// await, so iOS Safari does not block it as a popup.

const isHtmlName = name => /\.html?$/i.test(name ?? '');

function writeHtml(win, html, print) {
  win.document.open();
  win.document.write(withHtmlLinks(html));
  win.document.close();
  if (print) setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 700);
}

/** Open a document: HTML as a rendered page, anything else as is. */
export async function openDocument(url, name, { print = false } = {}) {
  if (!url) return;
  if (!isHtmlName(name ?? url)) { window.open(url, '_blank', 'noopener'); return; }
  const win = window.open('', '_blank');
  try {
    const html = await (await fetch(url)).text();
    if (win) writeHtml(win, html, print);
    else openHtml(html, { print });
  } catch {
    if (win) win.location.href = url; else window.open(url, '_blank');
  }
}

/** Open an HTML string as a page in a new tab (optionally starting the print dialog → Save as PDF). */
export function openHtml(html, { print = false, win = null } = {}) {
  const w = win ?? window.open('', '_blank');
  if (w) { writeHtml(w, html, print); return; }
  // Popup blocked: fall back to a blob URL in the same tab.
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.location.href = url;
}

// Inside a generated document (proposal, summary…) the links to attached .html files point at
// Storage, which serves them as text. HTML_LINKS_SCRIPT makes such links open the rendered page; it is
// added to documents opened in their own tab (openHtml). For documents shown in a sandboxed iframe
// (no scripts), wireDocFrame attaches the same behaviour from outside: <iframe onLoad={wireDocFrame}>.
const HTML_LINKS_SCRIPT = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(!/\\.html?(\\?|#|$)/i.test(h))return;e.preventDefault();var w=window.open('','_blank');fetch(h).then(function(r){return r.text()}).then(function(t){if(w){w.document.open();w.document.write(t);w.document.close()}else{location.href=h}}).catch(function(){if(w)w.location.href=h})});</script>`;
export function withHtmlLinks(html) {
  const s = String(html ?? "");
  return s.includes("</body>") ? s.replace("</body>", HTML_LINKS_SCRIPT + "</body>") : s + HTML_LINKS_SCRIPT;
}
export function wireDocFrame(e) {
  try {
    const doc = e.currentTarget.contentDocument;
    if (!doc || doc.__arenaLinks) return;
    doc.__arenaLinks = true;
    doc.addEventListener("click", ev => {
      const a = ev.target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!/\.html?(\?|#|$)/i.test(href)) return;
      ev.preventDefault();
      openDocument(href, a.textContent || href);
    });
  } catch { /* cross-origin frame: nothing to do */ }
}

/** onClick handler for <a href> links to documents. */
export const docLinkClick = (url, name) => e => {
  if (!isHtmlName(name ?? url)) return;            // normal link behaviour for PDFs, images…
  e.preventDefault();
  openDocument(url, name);
};
