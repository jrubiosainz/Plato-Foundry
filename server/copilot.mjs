// GitHub Copilot como proveedor del modelo de código (MAI-Code-2-Flash), con el SDK de GitHub Copilot y
// la sesión de Copilot de este equipo o, si no hay, el token de la CLI gh.
//
// El primer mensaje de cada sesión tarda ~10 s (preparación del lado del servicio); el segundo, ~1 s.
// Por eso se mantiene una reserva de sesiones ya "calentadas" con un mensaje corto para cada modelo.
import { CopilotClient, RuntimeConnection, approveAll } from '@microsoft/copilot-sdk';
import { execFile } from 'node:child_process';

const SYSTEM = [
  'You are the code engine of a live 3D platform game.',
  'Each request contains complete instructions. Follow them exactly and output only what they ask for:',
  'no explanations, no greetings, no Markdown fences unless the instructions show them.',
].join(' ');
const WARM_PROMPT = 'Reply with just: ok';
const FRESH_MS = Number(process.env.PLATO_COPILOT_FRESH_MS) || 240000; // a partir de aquí una sesión puede haberse enfriado en el servicio

let client = null;
let starting = null;
let auth = { ready: false, login: null, error: null };
const pools = new Map(); // model -> { ready: [{session, at}], warming: number, size, effort }

function ghToken() {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 8000 }, (err, stdout) => resolve(err ? null : String(stdout).trim() || null));
  });
}

async function ensureClient() {
  if (client) return client;
  if (starting) return starting;
  starting = (async () => {
    const options = { mode: 'coding-agent', runtime: RuntimeConnection.forSpawnedStdio({ env: { ...process.env } }) };
    let next = new CopilotClient(options);
    await next.start();
    let st = await next.getAuthStatus().catch(() => ({ isAuthenticated: false }));
    if (!st.isAuthenticated) {
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (await ghToken());
      if (token) {
        await next.stop().catch(() => {});
        next = new CopilotClient({ ...options, github: { token } });
        await next.start();
        st = await next.getAuthStatus().catch(() => ({ isAuthenticated: false }));
      }
    }
    auth = { ready: Boolean(st.isAuthenticated), login: st.login || null, error: st.isAuthenticated ? null : st.statusMessage || 'Sin sesión de GitHub Copilot' };
    client = next;
    return client;
  })();
  try { return await starting; } finally { starting = null; }
}

async function newSession(model, effort) {
  const c = await ensureClient();
  return c.createSession({
    model,
    systemMessage: { mode: 'replace', content: SYSTEM },
    inference: { reasoningEffort: effort },
    events: { streaming: true },
    tools: { availableTools: [] },
    permissions: { onRequest: approveAll },
  });
}

// Envía un mensaje a una sesión y resuelve con el texto completo; onDelta recibe cada trozo.
function send(session, prompt, { onDelta, signal, timeoutMs = 240000 } = {}) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => { off?.(); reject(Object.assign(new Error('Copilot no respondió a tiempo'), { code: 'model_error' })); }, timeoutMs);
    const onAbort = () => { clearTimeout(timer); off?.(); session.abort?.().catch(() => {}); reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); };
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
    const off = session.on((e) => {
      if (e.type === 'assistant.message_delta' && e.data?.deltaContent) {
        text += e.data.deltaContent;
        onDelta?.(e.data.deltaContent, text);
      } else if (e.type === 'session.idle') {
        clearTimeout(timer); off?.(); signal?.removeEventListener('abort', onAbort); resolve(text);
      } else if (e.type === 'session.error') {
        clearTimeout(timer); off?.(); signal?.removeEventListener('abort', onAbort);
        reject(Object.assign(new Error(e.data?.message || 'Error de Copilot'), { code: /rate|429/i.test(e.data?.message || '') ? 'rate_limited' : 'model_error' }));
      }
    });
    session.send({ prompt }).catch((err) => { clearTimeout(timer); off?.(); reject(err); });
  });
}

function pool(model) {
  if (!pools.has(model)) pools.set(model, { ready: [], warming: 0, size: 1, effort: 'low' });
  return pools.get(model);
}

function refill(model) {
  const p = pool(model);
  while (p.ready.length + p.warming < p.size) {
    p.warming++;
    (async () => {
      const session = await newSession(model, p.effort);
      await send(session, WARM_PROMPT, { timeoutMs: 90000 });
      p.ready.push({ session, at: Date.now() });
    })().catch((err) => { auth.error = auth.error || err.message; }).finally(() => { p.warming--; });
  }
}

// Mantiene `size` sesiones calientes de cada modelo.
export async function warm(models, { size = 1, effort = 'low' } = {}) {
  await ensureClient();
  if (!auth.ready) return status();
  for (const m of models) { const p = pool(m); p.size = size; p.effort = effort; refill(m); }
  return status();
}

async function takeSession(model, effort) {
  const p = pool(model);
  while (p.ready.length) {
    const s = p.ready.shift();
    if (effort === p.effort) { refill(model); return { session: s.session, warm: Date.now() - s.at < FRESH_MS }; }
    s.session.disconnect().catch(() => {});
  }
  refill(model);
  return { session: await newSession(model, effort), warm: false };
}

export async function generate({ model, prompt, effort = 'low', onDelta, signal }) {
  await ensureClient();
  if (!auth.ready) throw Object.assign(new Error(auth.error || 'GitHub Copilot no está disponible'), { code: 'not_granted' });
  const t0 = performance.now();
  const { session, warm: wasWarm } = await takeSession(model, effort);
  let ttft = 0;
  try {
    const text = await send(session, prompt, {
      signal,
      onDelta: (d, all) => { if (!ttft) ttft = Math.round(performance.now() - t0); onDelta?.(d, all); },
    });
    return { text, ttft, ms: Math.round(performance.now() - t0), warm: wasWarm };
  } finally {
    session.disconnect().catch(() => {});
  }
}

// Renueva las sesiones de la reserva que llevan demasiado tiempo esperando (solo se llama mientras alguien usa la app).
export function refresh() {
  if (!auth.ready) return;
  for (const [model, p] of pools) {
    const old = p.ready.filter((s) => Date.now() - s.at >= FRESH_MS);
    p.ready = p.ready.filter((s) => !old.includes(s));
    for (const s of old) s.session.disconnect().catch(() => {});
    refill(model);
  }
}

export function status() {
  const p = {};
  for (const [m, v] of pools) p[m] = { ready: v.ready.length, warming: v.warming };
  return { ...auth, pools: p };
}

export async function shutdown() {
  for (const p of pools.values()) for (const s of p.ready) s.session.disconnect().catch(() => {});
  pools.clear();
  const c = client; client = null;
  if (c) await c.stop().catch(() => {});
}
