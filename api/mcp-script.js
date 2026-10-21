import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  try {
    const script = readFileSync(join(process.cwd(), 'sap-mcp-server/index.js'), 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(200).send(script);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
