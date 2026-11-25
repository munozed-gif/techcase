// Open stored documents correctly. Supabase Storage serves HTML files as text/plain without a
// charset (to prevent XSS), so a plain link shows the source with garbled accents. HTML files are
// fetched (UTF-8) and written into a new tab instead. The tab is opened synchronously, before any
// await, so iOS Safari does not block it as a popup.

const isHtmlName = name => /\.html?$/i.test(name ?? '');

function writeHtml(win, html, print) {
  win.document.open();
  win.document.write(html);
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

/** onClick handler for <a href> links to documents. */
export const docLinkClick = (url, name) => e => {
  if (!isHtmlName(name ?? url)) return;            // normal link behaviour for PDFs, images…
  e.preventDefault();
  openDocument(url, name);
};
