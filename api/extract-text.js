export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { url, fileName, maxChars, images: wantImages } = req.body ?? {};
  // Default 15k chars; callers may ask for more (the spec generator asks for 120k), capped at 200k.
  const LIMIT = Math.min(Math.max(parseInt(maxChars, 10) || 15000, 1000), 200000);
  // Cut to LIMIT and say so in the text, so the AI never reads a cut document as complete.
  const out = (text, extra = {}) => {
    const t = text ?? "";
    if (t.length <= LIMIT) return res.json({ text: t, total_chars: t.length, ...extra });
    return res.json({
      text: t.slice(0, LIMIT) + `\n\n[... DOCUMENT TRUNCATED: only the first ${LIMIT} of ${t.length} characters are included. The rest exists but is not shown — do not report it as missing.]`,
      truncated: true, total_chars: t.length, ...extra,
    });
  };
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(400).json({ error: `Failed to fetch file: ${response.status}` });

    const ext = ((fileName || url).split(".").pop() || "").toLowerCase();

    // Plain text types — read directly
    if (["txt", "md", "csv", "json"].includes(ext)) {
      const text = await response.text();
      return out(text);
    }

    // HTML — strip tags
    if (ext === "html" || ext === "htm") {
      const html = await response.text();
      const text = html.replace(/<style[\s\S]*?<\/style>/gi, "")
                       .replace(/<script[\s\S]*?<\/script>/gi, "")
                       .replace(/<[^>]+>/g, " ")
                       .replace(/\s+/g, " ")
                       .trim();
      return out(text);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // PDF
    if (ext === "pdf") {
      const mod = await import("pdf-parse");
      let text;
      if (mod.PDFParse) {
        // pdf-parse v2: class API
        const parser = new mod.PDFParse({ data: buffer });
        try { text = (await parser.getText()).text; }
        finally { await parser.destroy?.(); }
      } else {
        // pdf-parse v1: default export is a function
        text = (await (mod.default ?? mod)(buffer)).text;
      }
      text = (text ?? "").replace(/\n-- \d+ of \d+ --\n/g, "\n");
      return out(text);
    }

    // DOCX
    if (ext === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.replace(/\n{3,}/g, "\n\n");
      if (!wantImages) return out(text);
      // Embedded images (screenshots with test data, SAP screens) in document order, so the AI can
      // read them too. Kept within the response size: up to 10 images, ~1.4 MB each, ~3.2 MB total.
      const images = [];
      let skipped = 0, total = 0;
      const OK = /^image\/(png|jpe?g|gif|webp)$/i;
      await mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.imgElement(async image => {
          try {
            const type = (image.contentType || "").toLowerCase().replace("image/jpg", "image/jpeg");
            if (!OK.test(type)) { skipped++; return { src: "" }; }
            const data = await image.read("base64");
            if (data.length < 2500) return { src: "" };                       // icons / bullets
            if (images.length >= 10 || data.length > 1_400_000 || total + data.length > 3_200_000) { skipped++; return { src: "" }; }
            images.push({ media_type: type, data }); total += data.length;
          } catch { skipped++; }
          return { src: "" };
        }),
      });
      return out(text, { images, images_skipped: skipped });
    }

    // DOC (Word 97-2003 binary)
    if (ext === "doc") {
      const WordExtractor = (await import("word-extractor")).default;
      const doc = await new WordExtractor().extract(buffer);
      const parts = [doc.getBody(), doc.getFootnotes?.(), doc.getEndnotes?.(), doc.getHeaders?.({ includeFooters: true })]
        .filter(x => x && x.trim());
      return out(parts.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"));
    }

    // XLSX / XLS — convert each sheet to CSV-like text
    if (ext === "xlsx" || ext === "xls") {
      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.read(buffer, { type: "buffer" });
      // Compact: one row per line with empty cells dropped (" | " between values), and
      // consecutive identical rows collapsed — test matrices repeat a lot and padded CSV
      // used to fill the whole budget with commas.
      const parts = wb.SheetNames.map(name => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: false, defval: "" });
        const lines = [];
        let prev = null, count = 0;
        const flush = () => { if (prev !== null) lines.push(count > 1 ? `${prev}  (×${count})` : prev); };
        for (const r of rows) {
          const line = r.map(v => String(v ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ");
          if (!line) continue;
          if (line === prev) { count++; continue; }
          flush(); prev = line; count = 1;
        }
        flush();
        return `[Sheet: ${name}]\n${lines.join("\n")}`;
      });
      return out(parts.join("\n\n"));
    }

    return res.json({ text: "", warning: `Unsupported file type: ${ext}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
