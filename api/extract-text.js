export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { url, fileName } = req.body ?? {};
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(400).json({ error: `Failed to fetch file: ${response.status}` });

    const ext = ((fileName || url).split(".").pop() || "").toLowerCase();

    // Plain text types — read directly
    if (["txt", "md", "csv", "json"].includes(ext)) {
      const text = await response.text();
      return res.json({ text: text.slice(0, 15000) });
    }

    // HTML — strip tags
    if (ext === "html" || ext === "htm") {
      const html = await response.text();
      const text = html.replace(/<style[\s\S]*?<\/style>/gi, "")
                       .replace(/<script[\s\S]*?<\/script>/gi, "")
                       .replace(/<[^>]+>/g, " ")
                       .replace(/\s+/g, " ")
                       .trim();
      return res.json({ text: text.slice(0, 15000) });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // PDF
    if (ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return res.json({ text: data.text.slice(0, 15000) });
    }

    // DOCX
    if (ext === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      return res.json({ text: result.value.slice(0, 15000) });
    }

    // XLSX / XLS — convert each sheet to CSV-like text
    if (ext === "xlsx" || ext === "xls") {
      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        return `[Sheet: ${name}]\n${csv}`;
      });
      return res.json({ text: parts.join("\n\n").slice(0, 15000) });
    }

    return res.json({ text: "", warning: `Unsupported file type: ${ext}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
