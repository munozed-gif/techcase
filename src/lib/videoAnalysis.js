// Video attachments: the AI cannot read video, so the browser takes still frames (every few seconds
// and whenever the screen changes), the AI describes them with their timestamps, and the
// description is saved as a text document of the case. That document then feeds the analysis,
// the requirements checklist and the coverage check like any other customer document.
import { callClaude } from "./utils.js";

export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v'];
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_ANALYSIS_SUFFIX = ' - analisis de video.md';

export const isVideoDoc = d => {
  const ext = (d?.file_name ?? '').toLowerCase().split('.').pop();
  return VIDEO_EXTS.includes(ext) || String(d?.file_type ?? '').startsWith('video/');
};
export const isVideoFile = f => VIDEO_EXTS.includes((f?.name ?? '').toLowerCase().split('.').pop()) || String(f?.type ?? '').startsWith('video/');
export const videoAnalysisName = videoName => `${videoName.replace(/\.[^.]+$/, '')}${VIDEO_ANALYSIS_SUFFIX}`;
export const isVideoAnalysisDoc = d => (d?.file_name ?? '').endsWith(VIDEO_ANALYSIS_SUFFIX);

export const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function waitEvent(el, ok, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('The video could not be read by the browser (format or codec not supported).')); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ok, onOk); el.removeEventListener('error', onErr); };
    el.addEventListener(ok, onOk); el.addEventListener('error', onErr);
  });
}

/**
 * Still frames of a video (a File/Blob, or a URL that is downloaded first).
 * Keeps a frame when the screen changed (small grey thumbnail difference) or when too much time
 * passed since the last one, then thins the list evenly to `maxFrames`.
 * Returns { duration, frames: [{ t, data (base64 JPEG) }] }.
 */
export async function extractVideoFrames(src, { maxFrames = 40, maxSide = 1280, onProgress } = {}) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  try {
    await waitEvent(video, 'loadeddata');
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error('The video has no readable duration.');
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale));
    const ctx = canvas.getContext('2d');
    const thumb = document.createElement('canvas'); thumb.width = 32; thumb.height = 18;
    const tctx = thumb.getContext('2d', { willReadFrequently: true });

    const samples = Math.min(240, Math.max(8, Math.ceil(duration)));      // about one look per second
    const step = duration / samples;
    const maxGap = Math.max(10, duration / Math.max(4, maxFrames / 2));    // at most ~10 s (longer videos: evenly spread) without a frame
    let prev = null, lastT = -Infinity;
    const kept = [];
    for (let i = 0; i < samples; i++) {
      const t = Math.min(duration - 0.05, i * step + step / 2);
      video.currentTime = t;
      await waitEvent(video, 'seeked');
      tctx.drawImage(video, 0, 0, 32, 18);
      const px = tctx.getImageData(0, 0, 32, 18).data;
      const grey = new Float32Array(32 * 18);
      for (let p = 0; p < grey.length; p++) grey[p] = (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 765;
      let diff = 1;
      if (prev) { diff = 0; for (let p = 0; p < grey.length; p++) diff += Math.abs(grey[p] - prev[p]); diff /= grey.length; }
      if (!prev || diff > 0.04 || t - lastT >= maxGap) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpg = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.72));
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(jpg); });
        kept.push({ t, data, diff });
        prev = grey; lastT = t;
      }
      onProgress?.({ phase: 'frames', done: i + 1, total: samples });
    }
    let frames = kept;
    if (frames.length > maxFrames) {
      // Keep the first and the biggest screen changes, in time order.
      const first = frames[0];
      const rest = frames.slice(1).sort((a, b) => b.diff - a.diff).slice(0, maxFrames - 1);
      frames = [first, ...rest].sort((a, b) => a.t - b.t);
    }
    return { duration, frames: frames.map(({ t, data }) => ({ t, data })) };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src'); video.load();
  }
}

// Frames per AI call: the request body must stay well under the server limit (about 4.5 MB).
function batchFrames(frames, maxChars = 3000000, maxCount = 12) {
  const out = []; let cur = []; let size = 0;
  for (const f of frames) {
    if (cur.length && (size + f.data.length > maxChars || cur.length >= maxCount)) { out.push(cur); cur = []; size = 0; }
    cur.push(f); size += f.data.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Describe the frames with the AI and return the markdown document text.
 * context: { caseTitle, caseDescription, notes } helps the AI know what to look for.
 */
export async function describeVideo({ fileName, duration, frames, context = {}, model, lang = 'es', caseId, onProgress }) {
  const es = lang === 'es';
  const batches = batchFrames(frames);
  const parts = [];
  for (const [bi, batch] of batches.entries()) {
    onProgress?.({ phase: 'ai', done: bi, total: batches.length });
    const content = [{ type: 'text', text:
`Video "${fileName}" (${fmtTime(duration)} in total), attached by the customer to an SAP development case.
Case: ${context.caseTitle ?? ''}
${context.caseDescription ? `Request: ${context.caseDescription}\n` : ''}${context.notes ? `Note from the person who uploaded it: ${context.notes}\n` : ''}
Below are still frames ${bi + 1}/${batches.length} of the video, in time order, each one preceded by its timestamp.
Describe step by step what the video shows that matters for the requirements: SAP transactions and apps (with their technical names when visible), cockpit / work-list names, page profiles and layout sets, quadrants and columns, filter and selection criteria, field labels and values, document numbers (freight units, freight orders, deliveries…), messages, errors and empty fields, and what the user does (clicks, filters, saves).
Rules:
- Start each step with its timestamp in brackets, e.g. [01:25].
- Only state what is readable on screen; write "not readable" instead of guessing. Never invent values.
- If a screen looks custom (Z labels, non-standard layout), say so.
- Plain markdown list, no introduction.` }];
    for (const f of batch) {
      content.push({ type: 'text', text: `[${fmtTime(f.t)}]` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } });
    }
    const raw = await callClaude({ feature: 'video_analysis', model, caseId, outputLang: lang, max_tokens: 4000,
      system: 'You are an SAP functional analyst documenting what a screen recording shows. Be precise and factual.',
      messages: [{ role: 'user', content }] });
    parts.push(String(raw ?? '').trim());
  }
  onProgress?.({ phase: 'ai', done: batches.length, total: batches.length });

  // Short summary of the whole video from the step descriptions (text only, cheap).
  let summary = '';
  try {
    summary = String(await callClaude({ feature: 'video_analysis', model, caseId, outputLang: lang, max_tokens: 1500,
      system: 'You are an SAP functional analyst. Be brief and factual.',
      messages: [{ role: 'user', content: `Summarize in 3-6 bullet points what this screen recording shows and what it tells about the requirement (screens, objects, problems seen). Cite timestamps. Do not add anything that is not in the description.\n\n${parts.join('\n\n')}` }] }) ?? '').trim();
  } catch (_) { /* the step description is enough */ }

  const title = es ? `# Análisis de video: ${fileName}` : `# Video analysis: ${fileName}`;
  const meta = es
    ? `Duración ${fmtTime(duration)} · ${frames.length} fotogramas analizados por IA. Las referencias [mm:ss] indican el minuto del video. Solo describe lo que se ve en pantalla (el audio no se analiza).`
    : `Length ${fmtTime(duration)} · ${frames.length} frames analyzed by AI. [mm:ss] references are video timestamps. Only what is on screen is described (audio is not analyzed).`;
  return `${title}\n\n${meta}\n\n${summary ? `## ${es ? 'Resumen' : 'Summary'}\n\n${summary}\n\n` : ''}## ${es ? 'Paso a paso' : 'Step by step'}\n\n${parts.join('\n\n')}\n`;
}

/** Full flow: frames → AI description → saved as a text document of the case. */
export async function analyzeVideoToDocument({ src, fileName, addDocument, context, model, lang, caseId, onProgress }) {
  const { duration, frames } = await extractVideoFrames(src, { onProgress });
  if (!frames.length) throw new Error('No frames could be taken from the video.');
  const md = await describeVideo({ fileName, duration, frames, context, model, lang, caseId, onProgress });
  const file = new File([md], videoAnalysisName(fileName), { type: 'text/markdown' });
  await addDocument(file, `[Requirements] ${lang === 'es' ? `Análisis por IA del video "${fileName}" (${frames.length} fotogramas, ${fmtTime(duration)})` : `AI analysis of the video "${fileName}" (${frames.length} frames, ${fmtTime(duration)})`}`);
  return { duration, frames: frames.length };
}

// ── Meeting transcripts (Teams / Zoom / YouTube subtitles: .vtt, .srt) ──────────────────────────
export const TRANSCRIPT_EXTS = ['vtt', 'srt'];
export const isTranscriptDoc = d => TRANSCRIPT_EXTS.includes((d?.file_name ?? '').toLowerCase().split('.').pop());

/** "[mm:ss] Speaker: text" lines, consecutive cues of one speaker merged (much shorter than the raw file). */
export function transcriptToText(raw) {
  const lines = String(raw ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  let cur = null;
  const toSec = s => { const m = s.trim().replace(',', '.').split(':').map(Number); return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]; };
  const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([\d:.,]+)\s*-->\s*[\d:.,]+/);
    if (!m) continue;
    const t = toSec(m[1]);
    const body = [];
    for (i++; i < lines.length && lines[i].trim() !== ''; i++) body.push(lines[i].trim());
    let text = body.join(' ');
    let speaker = '';
    const v = text.match(/<v\s+([^>]+)>/);
    if (v) speaker = v[1].trim();
    text = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!speaker) { const s = text.match(/^([A-ZÁÉÍÓÚÑ][^:]{1,40}):\s+(.*)$/); if (s) { speaker = s[1]; text = s[2]; } }
    if (!text) continue;
    if (cur && cur.speaker === speaker && t - cur.end < 30) { cur.text += ` ${text}`; cur.end = t; }
    else { if (cur) out.push(cur); cur = { t, end: t, speaker, text }; }
  }
  if (cur) out.push(cur);
  return out.map(c => `[${fmt(c.t)}] ${c.speaker ? `${c.speaker}: ` : ''}${c.text}`).join('\n');
}
