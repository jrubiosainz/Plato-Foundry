// Llamadas a Microsoft Foundry con el token de Entra de este equipo:
// Decision-1.1, Responses API (GPT-6 Luna, GPT-6.2 Astra), MAI-Image-2.7, MAI-Voice y vídeo de fal.
import { token } from './azure.mjs';

export class HttpError extends Error {
  constructor(what, status, body) {
    let msg = body;
    try { const j = JSON.parse(body); msg = j.error?.message || j.detail || j.message || body; } catch { /* texto plano */ }
    super(`${what}: HTTP ${status} ${String(msg).slice(0, 300)}`);
    this.status = status;
    this.code = status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'not_granted' : status === 404 ? 'model_unavailable' : 'model_error';
  }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const isNetwork = (err) => Boolean(err) && ((err.name === 'TypeError' && /fetch failed|terminated|network/i.test(err.message)) || /ECONN|ETIMEDOUT|EPIPE|UND_ERR/.test(String(err.code) + String(err.cause && err.cause.code)));

// fetch con un reintento para cortes de red y respuestas 429/5xx (la red de una demo no siempre es estable).
async function fetchRetry(url, init, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, init);
      if (!RETRY_STATUS.has(res.status) || i >= tries - 1) return res;
      const wait = Math.min(Number(res.headers.get('retry-after')) * 1000 || 600 * (i + 1), 4000);
      await res.body?.cancel().catch(() => {});
      await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      if (init.signal?.aborted || !isNetwork(err) || i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function auth(extra = {}) {
  return { Authorization: `Bearer ${await token()}`, 'User-Agent': 'plato-foundry/0.1', ...extra };
}

async function postJson(what, url, body, signal) {
  const res = await fetchRetry(url, { method: 'POST', headers: await auth({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal });
  if (!res.ok) throw new HttpError(what, res.status, await res.text());
  return res.json();
}

// Lee un cuerpo text/event-stream y entrega cada evento {event, data}.
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

export function createFoundry(cfg) {
  const D = cfg.deployments;

  async function decide({ state, questions, assets, signal }) {
    const t0 = performance.now();
    const body = { model: D.decision, state, questions };
    if (assets) body.assets = assets;
    const j = await postJson('Decision-1.1', `${cfg.endpoint}/providers/microsoft/v1/systemone`, body, signal);
    return { answers: j.answers, usage: j.usage || null, ms: Math.round(performance.now() - t0) };
  }

  // Responses API en streaming. input: texto o [{role, content}].
  async function respond({ deployment, input, instructions, effort, maxTokens = 32000, signal, onDelta }) {
    const t0 = performance.now();
    const body = { model: deployment, input, stream: true, max_output_tokens: maxTokens };
    if (instructions) body.instructions = instructions;
    if (effort) body.reasoning = { effort };
    let text = '', ttft = 0, usage = null, status = 'completed';
    for (let attempt = 0; ; attempt++) {
      try { await stream(); break; }
      catch (err) { if (text || attempt >= 1 || signal?.aborted || !isNetwork(err)) throw err; } // un corte antes del primer token se reintenta una vez
    }
    return { text, ttft, ms: Math.round(performance.now() - t0), usage, truncated: status === 'incomplete' };

    async function stream() {
      const res = await fetchRetry(`${cfg.openaiEndpoint}/openai/v1/responses`, {
        method: 'POST', headers: await auth({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal,
      });
      if (!res.ok) throw new HttpError(deployment, res.status, await res.text());
      for await (const ev of sse(res)) {
        if (ev.data === '[DONE]') break;
        let j; try { j = JSON.parse(ev.data); } catch { continue; }
        const type = j.type || ev.event;
        if (type === 'response.output_text.delta' && j.delta) {
          if (!ttft) ttft = Math.round(performance.now() - t0);
          text += j.delta;
          onDelta?.(j.delta, text);
        } else if (type === 'response.completed' || type === 'response.incomplete') {
          usage = j.response?.usage || null;
          status = j.response?.status || status;
        } else if (type === 'response.failed' || type === 'error') {
          const e = new Error(`${deployment}: ${j.response?.error?.message || j.error?.message || j.message || 'error'}`);
          e.code = 'model_error';
          throw e;
        }
      }
    }
  }

  async function imageEdit({ prompt, images, width, height, signal }) {
    const form = new FormData();
    form.append('model', D.image);
    form.append('prompt', prompt);
    if (width) form.append('width', String(width));
    if (height) form.append('height', String(height));
    for (const im of images) form.append('image', new Blob([im.data], { type: im.type || 'image/png' }), im.name || 'frame.png');
    const res = await fetchRetry(`${cfg.endpoint}/mai/v1/images/edits`, { method: 'POST', headers: await auth(), body: form, signal });
    if (!res.ok) throw new HttpError('MAI-Image-2.7', res.status, await res.text());
    const j = await res.json();
    return Buffer.from(j.data[0].b64_json, 'base64');
  }

  async function imageGenerate({ prompt, width = 1024, height = 1024, signal }) {
    const j = await postJson('MAI-Image-2.7', `${cfg.endpoint}/mai/v1/images/generations`, { model: D.image, prompt, width, height }, signal);
    return Buffer.from(j.data[0].b64_json, 'base64');
  }

  async function tts({ ssml, format = 'audio-24khz-48kbitrate-mono-mp3', signal }) {
    const res = await fetchRetry(`${cfg.cognitiveEndpoint}/tts/cognitiveservices/v1`, {
      method: 'POST', headers: await auth({ 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': format }), body: ssml, signal,
    });
    if (!res.ok) throw new HttpError('MAI-Voice', res.status, await res.text());
    return Buffer.from(await res.arrayBuffer());
  }

  let voiceCache = null;
  async function voices() {
    if (voiceCache) return voiceCache;
    const res = await fetchRetry(`${cfg.cognitiveEndpoint}/tts/cognitiveservices/voices/list`, { headers: await auth() });
    if (!res.ok) throw new HttpError('voices', res.status, await res.text());
    voiceCache = await res.json();
    return voiceCache;
  }

  // fal en Foundry: cola con request_id, estado y resultado.
  const FAL = {
    reference: { base: 'minimax/h3-max', route: 'reference-to-video', deployment: D.videoRef },
    draft: { base: 'lightricks/ltx-2.5', route: 'image-to-video/fast', deployment: D.videoDraft },
  };
  const falBase = (kind) => `${cfg.endpoint}/providers/falai/v1/${FAL[kind].base}`;

  async function falSubmit(kind, input, signal) {
    const j = await postJson(`fal ${kind}`, `${falBase(kind)}/${FAL[kind].route}`, { model: FAL[kind].deployment, ...input }, signal);
    if (!j.request_id) throw new Error(`fal ${kind}: no devolvió request_id`);
    return j.request_id;
  }
  async function falGet(kind, path, signal) {
    const res = await fetchRetry(`${falBase(kind)}/requests/${path}`, { headers: await auth(), signal });
    if (!res.ok) throw new HttpError(`fal ${kind}`, res.status, await res.text());
    return res.json();
  }
  async function download(url, signal) {
    const res = await fetchRetry(url, { headers: url.startsWith(cfg.endpoint) ? await auth() : {}, signal });
    if (!res.ok) throw new HttpError('descarga', res.status, await res.text());
    return Buffer.from(await res.arrayBuffer());
  }

  return {
    decide, respond, imageEdit, imageGenerate, tts, voices, download,
    falSubmit, falStatus: (kind, id, signal) => falGet(kind, `${id}/status`, signal), falResult: (kind, id, signal) => falGet(kind, id, signal),
  };
}
