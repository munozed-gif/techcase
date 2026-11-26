// /doc?u=<storage url> — shows a stored HTML document (specs, attachments) as a page. Storage serves
// HTML as text, so links to the files show the source; generated documents link here instead.
// Only files of the platform storage are accepted, and they are shown in a sandboxed frame (no scripts).
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { isStorageUrl, fixDocLinks } from "../lib/openDoc.js";

export default function DocViewerPage() {
  const url = new URLSearchParams(window.location.search).get("u") || "";
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!isStorageUrl(url)) { setErr("invalid"); return; }
    fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status)))).then(t => {
      setHtml(t);
      const m = t.match(/<title>([^<]*)<\/title>/i); if (m) document.title = m[1];
    }).catch(() => setErr("load"));
  }, [url]);
  const name = decodeURIComponent(url.split("/").pop() || "documento.html");
  const es = !(navigator.language || "es").toLowerCase().startsWith("en");
  if (err) return (
    <div style={{ minHeight: "100dvh", background: "#0B0F1A", color: "#fff" }} className="flex flex-col items-center justify-center gap-2 px-6 text-center">
      <AlertCircle size={28} className="text-amber-400" />
      <p className="font-semibold">{err === "invalid" ? (es ? "Enlace no válido" : "Invalid link") : (es ? "No se pudo cargar el documento" : "The document could not be loaded")}</p>
    </div>
  );
  if (html === null) return <div style={{ minHeight: "100dvh", background: "#0B0F1A" }} className="flex items-center justify-center"><Loader2 className="animate-spin text-blue-400" /></div>;
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#0B0F1A" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2" style={{ background: "#111829", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <span className="text-xs text-gray-300 truncate">{name}</span>
        <a href={url} download={name} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: "#4F6EF7" }}>
          <Download size={13} />{es ? "Descargar" : "Download"}
        </a>
      </div>
      <iframe title={name} sandbox="allow-popups allow-popups-to-escape-sandbox" style={{ flex: 1, width: "100%", border: 0, background: "#fff" }}
        srcDoc={fixDocLinks(html).replace("</head>", "<style>.print-btn{display:none!important}</style></head>")} />
    </div>
  );
}
