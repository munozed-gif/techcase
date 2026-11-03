export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { data } = req.body ?? {};
  if (!data) return res.status(400).json({ error: "base64 data required" });

  try {
    const buffer = Buffer.from(data, "base64");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;

    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const pg = await doc.getPage(i);
      const content = await pg.getTextContent();
      pages.push(content.items.map(it => it.str).join(" "));
    }

    const text = pages.join("\n\n").replace(/\s{3,}/g, "  ").trim();
    if (!text) return res.status(422).json({ error: "No text found in PDF" });

    return res.json({ text: text.slice(0, 20000) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
