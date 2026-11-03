export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { data } = req.body ?? {};
  if (!data) return res.status(400).json({ error: "base64 data required" });

  try {
    const buffer = Buffer.from(data, "base64");
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = result.text.replace(/\s{3,}/g, "  ").trim();
    return res.json({ text: text.slice(0, 20000) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
