// Plató · servidor local. Sirve el juego (site/dist) y hace de puente con tus sesiones:
//   Azure (az/azd)  → Microsoft Foundry: Decision-1.1, GPT-6 Luna, GPT-6.2 Astra, MAI-Image-2.7, MAI-Voice, MAI-Transcribe, fal
//   GitHub (Copilot) → MAI-Code-2-Flash
// Solo escucha en 127.0.0.1 y solo atiende a su propia página: los tokens nunca llegan al navegador.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { loadConfig, ROOT } from './config.mjs';
import { identity } from './azure.mjs';
import { createFoundry } from './foundry.mjs';
import { createRouter } from './router.mjs';
import { createVoice } from './voice.mjs';
import { createVideo } from './video.mjs';
import { attachStt } from './stt.mjs';
import * as copilot from './copilot.mjs';

const cfg = loadConfig();
const F = createFoundry(cfg);
const router = createRouter(cfg, F);
const voice = createVoice(cfg, F);
const video = createVideo(cfg, F);
const DIST = join(ROOT, 'site', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const HOSTS = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`]);
let lastActivity = 0;

function isLocalOrigin(req) {
  if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  const origin = req.headers.origin;
  return !origin || HOSTS.has(origin.replace(/^https?:\/\//, '').toLowerCase());
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveFile(req, res, file, type) {
  const size = statSync(file).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, 'Cache-Control': 'no-store' });
    createReadStream(file, { start: a, end: b }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
  const file = join(DIST, rel);
  if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('no encontrado'); return; }
  serveFile(req, res, file, TYPES[extname(file)] || 'application/octet-stream');
}

async function handleAi(req, res) {
  const body = JSON.parse((await readBody(req, 4 << 20)).toString('utf8'));
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const emit = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    await router.handle(body, emit, ctl.signal);
  } catch (err) {
    if (!ctl.signal.aborted) emit('error', { code: err.code || 'model_error', message: err.message, status: err.status || null });
  } finally {
    res.end();
  }
}

async function handleTts(req, res) {
  const body = JSON.parse((await readBody(req, 64 << 10)).toString('utf8'));
  const npc = body.npc && typeof body.npc === 'object' ? body.npc : null;
  const r = await voice.speak({ text: body.text, npc, lang: body.lang || null });
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg', 'Content-Length': r.audio.length, 'Cache-Control': 'no-store',
    'X-Plato-Voice': r.voice, 'X-Plato-Style': r.style || 'none', 'X-Plato-Emotion': r.emotion, 'X-Plato-Lang': r.lang,
    'X-Plato-Decision': encodeURIComponent(JSON.stringify(r.decision || {})),
  });
  res.end(r.audio);
}

async function handleReal(req, res) {
  const buf = await readBody(req, 80 << 20);
  let meta = {};
  try { meta = JSON.parse(decodeURIComponent(String(req.headers['x-plato-job'] || '%7B%7D'))); } catch { /* sin metadatos */ }
  json(res, 202, video.start({ buf, type: String(req.headers['content-type'] || 'video/mp4'), prompt: meta.prompt, secs: Number(meta.secs) || 0, mode: meta.mode, style: meta.style }));
}

async function status() {
  return {
    app: 'Plató', account: cfg.account, location: cfg.location,
    azure: await identity(), copilot: copilot.status(),
    models: Object.fromEntries(Object.entries(router.models).map(([k, v]) => [k, { label: v.label, provider: v.provider, detail: v.detail }])),
    stt: Boolean(cfg.stt), history: router.history(),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p.startsWith('/api/')) lastActivity = Date.now();
  try {
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);
    if (!isLocalOrigin(req)) return json(res, 403, { error: 'Solo para la página de este servidor' });
    if (p === '/api/status' && req.method === 'GET') return json(res, 200, await status());
    if (p === '/api/ai' && req.method === 'POST') return await handleAi(req, res);
    if (p === '/api/tts' && req.method === 'POST') return await handleTts(req, res);
    if (p === '/api/decide' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 8 << 20)).toString('utf8'));
      return json(res, 200, await F.decide({ state: body.state, questions: body.questions, assets: body.assets }));
    }
    if (p === '/api/real' && req.method === 'POST') return await handleReal(req, res);
    const m = /^\/api\/real\/([\w-]+)(?:\/(video|frame|take))?$/.exec(p);
    if (m && req.method === 'GET') {
      if (!m[2]) { const j = video.get(m[1]); return j ? json(res, 200, j) : json(res, 404, { error: 'No existe' }); }
      const f = video.file(m[1], m[2]);
      return f ? serveFile(req, res, f, m[2] === 'frame' ? 'image/png' : /\.webm$/.test(f) ? 'video/webm' : 'video/mp4') : json(res, 404, { error: 'Aún no está' });
    }
    json(res, 404, { error: 'Ruta desconocida' });
  } catch (err) {
    if (!res.headersSent) json(res, err.status && err.status < 500 ? err.status : 502, { error: err.message, code: err.code || null });
    else res.end();
  }
});

attachStt(server, cfg, isLocalOrigin);

server.listen(cfg.port, cfg.host, async () => {
  console.log(`\nPlató está en http://localhost:${cfg.port}  (Ctrl+C para parar)`);
  console.log(`Foundry: ${cfg.account} (${cfg.location})`);
  const id = await identity();
  console.log(id.signedIn ? `Azure: ${id.user} (${id.source})` : `Azure: sin sesión — ${id.error}`);
  // En segundo plano: calentar Decision-1.1 (cada tipo de pregunta) y las sesiones de Copilot para que la primera petición de la demo vaya rápida.
  router.warm(); voice.warm();
  copilot.warm([cfg.codeModel], { size: 2 })
    .then((s) => { console.log(s.ready ? `GitHub Copilot: ${s.login} · calentando ${cfg.codeModel}` : `GitHub Copilot no disponible: ${s.error || 'sin sesión'} (se usará Foundry para el código)`); })
    .catch((err) => console.log(`GitHub Copilot no disponible: ${err.message}`));
  // Mientras alguien usa la página (actividad en los últimos 15 min), se mantiene todo caliente; si no, no se gasta nada.
  // Decision-1.1 se enfría en unos minutos (1,5 s frente a 0,15 s) y cuesta casi nada: se le llama cada 45 s.
  const active = () => Date.now() - lastActivity < 15 * 60000;
  setInterval(() => { if (active()) { router.warm(); voice.warm(); } }, 45000).unref();
  setInterval(() => { if (active()) copilot.refresh(); }, 3 * 60000).unref();
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { copilot.shutdown().finally(() => process.exit(0)); });
