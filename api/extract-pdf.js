import { inflateSync } from "zlib";
import { PDFParse } from "pdf-parse";
import { getData as getPdfWorker } from "pdf-parse/worker";

// pdf.js needs its worker; on serverless the worker file isn't next to the
// bundle, so load it from the data URL that pdf-parse/worker ships.
PDFParse.setWorker(getPdfWorker());

// Full PDF text extraction (embedded/CID fonts, ToUnicode maps, etc.),
// which is what Word, Google Docs, Canva and browser-exported resumes use.
async function extractWithPdfParse(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return (result.text ?? "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}

// Fallback: minimal extractor for simple PDFs (FlateDecode streams with
// literal-string Tj/TJ operators). Used only if pdf-parse fails.
function extractText(buffer) {
  const raw = buffer.toString("latin1");
  const texts = [];

  // Find all stream...endstream blocks
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    const data = Buffer.from(m[1], "latin1");

    // Try FlateDecode (zlib) decompression
    let content;
    try {
      content = inflateSync(data).toString("latin1");
    } catch (_) {
      // Check if this looks like it might be raw text content anyway
      content = data.toString("latin1");
    }

    // Skip obvious non-text streams (images, fonts, XObjects)
    if (!content.includes("BT") && !content.includes("Tj") && !content.includes("TJ")) continue;

    // Extract text from BT ... ET blocks
    const btRe = /BT([\s\S]*?)ET/g;
    let bt;
    while ((bt = btRe.exec(content)) !== null) {
      const block = bt[1];
      const parts = [];

      // Handle (string) Tj  and  [(arr)] TJ
      const opRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
      let op;
      while ((op = opRe.exec(block)) !== null) {
        if (op[1] !== undefined) {
          parts.push(decodePdfString(op[1]));
        } else if (op[2] !== undefined) {
          // TJ array: collect all (string) entries, skip numeric kerning values
          const arrRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
          let ar;
          while ((ar = arrRe.exec(op[2])) !== null) {
            parts.push(decodePdfString(ar[1]));
          }
        }
      }

      if (parts.length) texts.push(parts.join(""));
    }
  }

  return texts.join("\n").replace(/\s{2,}/g, " ").trim();
}

function decodePdfString(s) {
  // Decode PDF escape sequences: \n \r \t \\ \( \) and octal \ddd
  return s
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\(.)/g, "$1");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { data } = req.body ?? {};
  if (!data) return res.status(400).json({ error: "base64 data required" });

  try {
    const buffer = Buffer.from(data, "base64");
    let text = "";
    try {
      text = await extractWithPdfParse(buffer);
    } catch (err) {
      console.error("extract-pdf: pdf-parse failed, using fallback:", err?.message);
    }
    if (!text) text = extractText(buffer);
    if (!text) return res.status(422).json({ error: "No text found in PDF" });
    return res.json({ text: text.slice(0, 20000) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
