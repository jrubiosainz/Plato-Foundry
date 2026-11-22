// Pruebas de API de las tareas del router que añade «Plataformas 3D» (sin navegador y sin audio).
//   node tests/platform-api.mjs             plat (Decision-1.1 → GPT-6 Luna / GPT-6.2 Astra), plat-invent (→ MAI-Code-2-Flash),
//                                           voces (reparto inglés de MAI-Voice-2.1-Flash) y stt-en (MAI-Transcribe en inglés)
//   node tests/platform-api.mjs plat        solo las órdenes
//   node tests/platform-api.mjs real        «Make it real» con la toma que guardó el paso real de platform-e2e
//                                           (tests/out/real-take.*), en otro estilo: STYLE=live (por defecto) o animated. ~0,7 $
// Necesita el servidor en marcha (PLATO_URL, por defecto http://127.0.0.1:8741).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
const BASE = process.env.PLATO_URL || 'http://127.0.0.1:8741';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const want = new Set(process.argv.slice(2));
const on = (k) => k !== 'real' && (!want.size || want.has(k));
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

async function ai(body) {
  const res = await fetch(BASE + '/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((b) => ({ event: /event: (.*)/.exec(b)?.[1], data: JSON.parse(/data: (.*)/s.exec(b)?.[1] || 'null') }));
  return { route: events.find((e) => e.event === 'route')?.data, done: events.find((e) => e.event === 'done')?.data, error: events.find((e) => e.event === 'error')?.data };
}
const json = (t) => { const s = String(t || '').replace(/```(?:json)?/gi, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
// un estado compacto como el que manda el juego (ids, tipos, posición relativa y «este»)
const state = { player: { id: 'player', name: 'Rubio', hearts: 3, section: 'El paso del Gruñón' }, this: 'enemy1', entities: [{ id: 'enemy1', type: 'enemy', where: '4 m ahead', name: 'Gruñón', note: 'a grumpy guard creature; it blocks the narrow path and hurts on touch' }, { id: 'wall1', type: 'wall', where: '38 m ahead', note: '5.5 m high stone wall across the path; too high to jump' }, { id: 'boss', type: 'boss', where: '150 m ahead', note: 'final boss, a volcano golem king; throws fireballs' }, { id: 'princess', type: 'princess', where: '160 m ahead, 11 m up', note: 'locked in a hanging cage by the castle' }], weather: 'clear', time: '13:00' };
const prompt = (said) => 'You turn a player\'s spoken order (usually Spanish) into JSON operations for a 3D platform game.\nReply with ONE JSON object and nothing else: {"ops":[...],"say":"<short reply in Spanish>"}\nOperations: {"op":"add","kind":KIND,"rel":REL,"ref":ID} {"op":"remove","id":ID} {"op":"move","id":ID,"rel":REL,"ref":ID} {"op":"projectile","id":ID,"value":"fireballs|flowers"} {"op":"wear","id":ID,"item":"tutu"} {"op":"companions","count":N} {"op":"weather","value":"clear|rain|snow"} {"op":"time","value":"day|dusk|night"} {"op":"logos","brands":["foundry","microsoft","copilot","github"]}\nKIND: ladder, puddle, shark, bridge, platform, spring. REL: under, in, beside, across, against. "este" is the entity in "this".\nState: ' + JSON.stringify(state) + '\nOrder: ' + JSON.stringify(said);

if (on('plat')) {
  console.log('\n== /api/ai · tarea «plat» (una orden de juego)');
  const said = 'elimina a este enemigo';
  const a = await ai({ task: 'plat', tier: 'quick', said, input: prompt(said) });
  const d = a.route?.decision;
  check(d?.question === 'plat' && d?.choice === 'fast', `Decision-1.1 enruta la orden: ${d?.choice} (${Math.round((d?.probability || 0) * 100)} %, ${d?.ms} ms, apto ${Math.round((d?.ok || 0) * 100)} %) → ${a.route?.model?.label} · ${a.route?.model?.detail}`);
  const j = json(a.done?.text);
  check(Array.isArray(j?.ops) && j.ops.some((o) => o.op === 'remove' && o.id === 'enemy1'), `operaciones JSON en ${a.done?.ms} ms (1.er token ${a.done?.ttft} ms): ${JSON.stringify(j?.ops)}`);
  const said2 = 'pon a la princesa junto al personaje del jugador y haz que el jefe final lance flores en lugar de bolas de fuego';
  const b = await ai({ task: 'plat', tier: 'quick', said: said2, input: prompt(said2) });
  const j2 = json(b.done?.text);
  check(Boolean(b.route?.decision?.choice) && Array.isArray(j2?.ops) && j2.ops.length >= 2, `orden doble: Decision-1.1 ${b.route?.decision?.choice} → ${b.route?.model?.label}; ${JSON.stringify(j2?.ops)}`);
}

if (on('plat-invent')) {
  console.log('\n== /api/ai · tarea «plat-invent» (pieza nueva escrita con código)');
  const c = await ai({ task: 'plat-invent', tier: 'quick', said: 'Seta saltarina: a bouncy toy mushroom', input: 'Write only these two lines of JavaScript and nothing else:\nb.cyl(0.25, 0.3, 0.6, "#fff4dc", 0, 0.3, 0);\nb.sphere(0.55, "#ff5a7a", 0, 0.85, 0, { sy: 0.6 });' });
  const d = c.route?.decision;
  check(d?.question === 'plat-invent' && /flash|deep/.test(d?.choice || ''), `Decision-1.1 elige el modelo de código: ${d?.choice} (${Math.round((d?.probability || 0) * 100)} %) → ${c.route?.model?.label} (${c.route?.model?.provider})`);
  check(/b\.(cyl|sphere)/.test(c.done?.text || ''), `código en ${c.done?.ms} ms: ${String(c.done?.text || c.error?.message).replace(/\s+/g, ' ').slice(0, 90)}`);
}

if (on('voces')) {
  console.log('\n== /api/tts · reparto inglés (MAI-Voice-2.1-Flash) y voces españolas de siempre');
  const say = async (text, npc, lang) => { const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, npc, lang }) }); const b = Buffer.from(await r.arrayBuffer()); return { ok: r.ok && b.length > 3000, voice: r.headers.get('x-plato-voice'), style: r.headers.get('x-plato-style') }; };
  const boss = { name: 'Volcano King', role: 'a grumpy volcano golem king in a children\'s platform game', seed: 'boss-2', gender: 'male', cast: { en: 'en-GB-Harry' } };
  const a = await say('Nobody crosses my arena!', boss, 'en');
  check(a.ok && a.voice === 'en-GB-Harry:MAI-Voice-2.1-Flash', `el jefe en inglés: ${a.voice} · estilo ${a.style}`);
  const b = await say('¡Nadie cruza mi arena!', Object.assign({}, boss, { name: 'Rey Volcán' }), 'es');
  check(b.ok && /^es-/.test(b.voice), `el jefe en español sigue con su voz de siempre: ${b.voice}`);
  const c = await say('Hi!', { name: 'X', seed: 'x', gender: 'female', cast: { en: 'en-ZZ-Nobody' } }, 'en');
  check(c.ok && /^en-/.test(c.voice) && !/Nobody/.test(c.voice), `una voz que no existe en el recurso no se usa: ${c.voice}`);
}

if (on('stt-en')) {
  console.log('\n== /api/stt?lang=en · MAI-Transcribe-2-Streaming en inglés (bucle cerrado con MAI-Voice)');
  const said = 'Put a tutu on the final boss.';
  const res = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: said, lang: 'en' }) });
  const mp3 = join(out, 'pf-command-en.mp3'), pcm = join(out, 'pf-command-en.pcm');
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '16000', '-f', 's16le', pcm]);
  const audio = readFileSync(pcm), t0 = performance.now();
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/api/stt?lang=en', { headers: { Origin: BASE } });
  const r = await new Promise((resolve, reject) => {
    let first = 0; const timer = setTimeout(() => reject(new Error('sin transcripción en 20 s')), 20000);
    ws.on('message', async (raw) => {
      const ev = JSON.parse(raw);
      if (ev.t === 'ready') { for (let i = 0; i < audio.length; i += 1280) { ws.send(audio.subarray(i, i + 1280)); await new Promise((q) => setTimeout(q, 20)); } ws.send(JSON.stringify({ type: 'commit' })); }
      else if ((ev.t === 'partial' || ev.t === 'delta') && !first) first = Math.round(performance.now() - t0);
      else if (ev.t === 'final') { clearTimeout(timer); resolve({ text: ev.text, first, ms: Math.round(performance.now() - t0) }); }
      else if (ev.t === 'error') { clearTimeout(timer); reject(new Error(ev.message)); }
    });
    ws.on('error', reject);
  }).catch((e) => ({ error: e.message }));
  ws.close();
  check(/tutu/i.test(r.text || '') && /boss/i.test(r.text || ''), `«${r.text || r.error}» · primer parcial a ${r.first} ms · final a ${r.ms} ms (audio de ${(audio.length / 32000).toFixed(1)} s en tiempo real)`);
}

if (want.has('real')) { // tiene coste (MAI-Image-2.7 + MiniMax H3 Max): solo si se pide
  const meta = existsSync(join(out, 'real-take.json')) ? JSON.parse(readFileSync(join(out, 'real-take.json'), 'utf8')) : null;
  const style = process.env.STYLE === 'animated' ? 'animated' : 'live';
  console.log(`\n== /api/real · la misma toma del juego, estilo «${style}» (MAI-Image-2.7 + MiniMax H3 Max en fal)`);
  if (!meta || meta.mock) { check(false, 'falta una toma de verdad: node tests/platform-e2e.mjs real (sin PF_REAL=mock)'); }
  else {
    const clip = readFileSync(join(out, meta.file)), t0 = performance.now();
    const r = await fetch(BASE + '/api/real', { method: 'POST', headers: { 'Content-Type': meta.type, 'X-Plato-Job': encodeURIComponent(JSON.stringify({ prompt: meta.prompt, secs: meta.secs, mode: 'reference', style })) }, body: clip });
    const { id } = await r.json();
    let s, last = '';
    for (;;) { await new Promise((q) => setTimeout(q, 4000)); s = await (await fetch(BASE + '/api/real/' + id)).json(); if (s.label !== last) { console.log(`    ${s.secs} s · ${s.label}`); last = s.label; } if (s.state !== 'running') break; }
    check(s.state === 'done' && s.style === style, `estado ${s.state}${s.error ? ' · ' + s.error : ''} en ${Math.round((performance.now() - t0) / 1000)} s con ${s.model} · estilo ${s.style} · out/jobs/${id}/real.mp4`);
    if (s.state === 'done') {
      const v = Buffer.from(await (await fetch(BASE + '/api/real/' + id + '/video')).arrayBuffer()), f = join(out, 'real-' + style + '.mp4');
      writeFileSync(f, v);
      const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height:format=duration', '-of', 'compact', f]).toString().trim().replace(/\n/g, ' ');
      check(v.length > 100000, `vídeo de ${v.length} bytes · ${probe} · tests/out/real-${style}.mp4`);
    }
  }
}

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
