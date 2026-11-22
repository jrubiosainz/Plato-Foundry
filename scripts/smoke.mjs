// Prueba de humo de los modelos de Foundry con la sesión de Azure de este equipo.
//   node scripts/smoke.mjs                 todo salvo vídeo
//   node scripts/smoke.mjs decide luna     solo esos pasos
//   node scripts/smoke.mjs video           envía un vídeo corto a fal (tiene coste)
// No reproduce audio: la voz se guarda en out/smoke/.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, ROOT } from '../server/config.mjs';
import { identity } from '../server/azure.mjs';
import { createFoundry } from '../server/foundry.mjs';

const cfg = loadConfig();
const F = createFoundry(cfg);
const out = join(ROOT, 'out', 'smoke');
mkdirSync(out, { recursive: true });
const want = new Set(process.argv.slice(2));
const on = (k) => (want.size ? want.has(k) : k !== 'video');
const log = (k, v) => console.log(`\n== ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);

if (on('id')) log('identidad', await identity());

if (on('decide')) {
  const r = await F.decide({
    state: { player_said: 'construye una noria gigante con cabinas que giran junto a la fuente' },
    questions: {
      model: { type: 'choice', instructions: 'Which code model should write the generator for this new kind of object?', criteria: {
        flash: 'An ordinary object built from a handful of simple shapes: furniture, a vehicle, a plain building, a sign, a plant, an animal, a prop.',
        deep: 'An intricate showpiece: a detailed mechanism, an ornate or monumental structure, many precisely arranged parts, or moving machinery.' } },
      ok_for_demo: { type: 'noul', instructions: 'Is this request appropriate for a public, family-friendly demo?' },
    },
  });
  log(`Decision-1.1 (${r.ms} ms)`, r.answers);
}

for (const [k, dep, effort] of [['luna', cfg.deployments.fast, 'none'], ['astra', cfg.deployments.deep, 'low']]) {
  if (!on(k)) continue;
  const r = await F.respond({ deployment: dep, effort, input: 'Responde en una frase: ¿qué tres obstáculos pondrías en un nivel de un juego de plataformas?', maxTokens: 400 });
  log(`${dep} effort=${effort} ttft=${r.ttft} ms total=${r.ms} ms`, r.text);
}

if (on('voices')) {
  const all = await F.voices();
  const mai = all.filter((v) => /MAI-Voice/i.test(v.ShortName + ' ' + (v.VoiceTag ? JSON.stringify(v.VoiceTag) : '') + ' ' + (v.DisplayName || '')));
  writeFileSync(join(out, 'voices-mai.json'), JSON.stringify(mai, null, 1));
  const pick = mai.filter((v) => /^(es-ES|es-MX|en-US|en-GB)/.test(v.Locale));
  log(`voces MAI (${mai.length}; es/en: ${pick.length})`, pick.map((v) => `${v.ShortName} ${v.Gender} styles=${(v.StyleList || []).join('|')}`).join('\n'));
  if (!mai.length) log('muestra de voces', all.slice(0, 3));
}

if (on('tts')) {
  const voice = process.env.VOICE || 'es-ES-Marta:MAI-Voice-2.1-Flash';
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="es-ES"><voice name="${voice}"><mstts:express-as style="friendlycheerful">¡Hola, forastero! Bienvenido a la plaza de Plató.</mstts:express-as></voice></speak>`;
  const t0 = performance.now();
  const mp3 = await F.tts({ ssml });
  const f = join(out, 'tts.mp3');
  writeFileSync(f, mp3);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  log(`MAI-Voice ${voice}`, `${mp3.length} bytes, ${dur} s, ${Math.round(performance.now() - t0)} ms (guardado en ${f}, sin reproducir)`);
}

if (on('image')) {
  const t0 = performance.now();
  const png = await F.imageGenerate({ prompt: 'A grey stone castle on a floating grassy island in the sky, a winding sandy path, round trees and flowers, cinematic animated film still, soft morning light', width: 1365, height: 768 });
  writeFileSync(join(out, 'image.png'), png);
  log('MAI-Image-2.7', `${png.length} bytes en ${Math.round(performance.now() - t0)} ms → out/smoke/image.png`);
}

if (on('video')) {
  const img = join(out, 'image.png');
  if (!existsSync(img)) throw new Error('Ejecuta antes el paso image');
  const jpg = join(out, 'image-small.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', img, '-vf', 'scale=960:-2', '-q:v', '4', jpg]);
  const dataUri = 'data:image/jpeg;base64,' + readFileSync(jpg).toString('base64');
  const t0 = performance.now();
  const id = await F.falSubmit('draft', { prompt: 'Slow dolly-in along the sandy path towards the castle gate; flags flutter and leaves move in a light breeze.', image_url: dataUri, duration: 6, resolution: '720p', aspect_ratio: '16:9' });
  log('fal LTX-2.5 Fast · request_id', id);
  let st;
  for (let i = 0; i < 120; i++) {
    st = await F.falStatus('draft', id);
    if (st.status === 'COMPLETED' || st.status === 'FAILED' || st.status === 'ERROR') break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  log(`estado tras ${Math.round((performance.now() - t0) / 1000)} s`, st);
  const res = await F.falResult('draft', id);
  const url = res.video?.url;
  const mp4 = await F.download(url);
  writeFileSync(join(out, 'ltx.mp4'), mp4);
  log('vídeo', `${mp4.length} bytes desde ${String(url).slice(0, 80)}… → out/smoke/ltx.mp4`);
}
