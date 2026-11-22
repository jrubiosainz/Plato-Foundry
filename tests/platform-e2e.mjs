// Prueba de extremo a extremo de «Plataformas 3D» en un Chromium headless (sin ventanas y con el audio silenciado).
// Necesita el servidor en marcha (por ejemplo: node site/build.mjs && PORT=8741 node server/server.mjs).
//   node tests/platform-e2e.mjs                    todo
//   node tests/platform-e2e.mjs nivel voz          solo esos pasos
// Pasos: nivel (el nivel entero solo con órdenes, por el router), alterno (el otro camino, también por
// el router: cada orden de la lista se ejecuta dos veces), red (la lista otra vez sin modelo: red de seguridad local),
// compañeros (Decision-1.1 decide y ayudan),
// respaldo (sin GLB), tiempo, voz (micrófono falso con MAI-Voice → MAI-Transcribe), invento (MAI-Code-2-Flash en un
// Worker sin red + control visual de Decision-1.1), en (el nivel entero en inglés, por el router: sin texto en español a la
// vista y con voces inglesas), en-red (la lista inglesa sin modelo: red de seguridad local en inglés) y en-voz (mantener T
// con el micrófono falso en inglés).
// Paso real (solo si se pide, porque cuesta ~0,7 $): «make it real» rueda una toma, la manda a fal y abre la comparación.
//   PF_REAL=mock simula el servidor de vídeo (sin coste); PF_REAL_LANG=es la hace en español; PF_REAL_STYLE=live cambia el estilo.
// El juego se simula sin pintar entre órdenes (PF.test.walkTo). Con Microsoft Edge instalado se usa Edge sin ventana con la
// GPU (--headless=new, mucho más rápido y con MediaRecorder de verdad); PF_BROWSER=chromium vuelve a Chromium con SwiftShader.
// Capturas en tests/out/pf-*.png, en-*.png y real-*.png, y un resumen de latencias por orden al final.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.PLATO_URL || 'http://127.0.0.1:8741';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const want = new Set(process.argv.slice(2));
const on = (k) => !want.size || want.has(k);
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const latencies = [];

// micrófono falso: MAI-Voice dice la orden y se guarda como WAV (no suena en el equipo)
const VOICE_CMD = 'Pon una escalera.';
const wav = join(out, 'pf-mic.wav');
if (on('voz')) {
  const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: VOICE_CMD, lang: 'es' }) });
  const mp3 = join(out, 'pf-mic.mp3'); writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '0.6', '-i', 'anullsrc=r=48000:cl=mono', '-i', mp3, '-filter_complex', '[1:a]aresample=48000,aformat=channel_layouts=mono[v];[0:a][v]concat=n=2:v=0:a=1,apad=pad_dur=2', '-ar', '48000', '-ac', '1', wav]);
}

// Edge sin ventana con GPU (Metal en el Mac) si está instalado; si no, Chromium con SwiftShader. Nunca abre ventanas ni suena.
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const useEdge = process.env.PF_BROWSER !== 'chromium' && existsSync(EDGE);
const launch = (wavFile) => {
  const args = ['--mute-audio', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(wavFile ? [`--use-file-for-fake-audio-capture=${wavFile}%noloop`] : []), '--autoplay-policy=no-user-gesture-required'];
  return useEdge
    ? chromium.launch({ executablePath: EDGE, headless: false, args: ['--headless=new', '--hide-scrollbars', '--window-size=1440,900', ...args] })
    : chromium.launch({ headless: true, args: [...args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
};
const browser = await launch(on('voz') ? wav : null);
console.log(useEdge ? 'Navegador: Microsoft Edge sin ventana, con GPU' : 'Navegador: Chromium sin ventana, con SwiftShader');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver|favicon/.test(m.text() + ' ' + ((m.location() || {}).url || '')) && !/^Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });

const shot = (name, prefix) => page.screenshot({ path: join(out, (prefix || 'pf-') + name + '.png') });
// cada paso fija su idioma (?lang=es por defecto), porque el juego recuerda el último en localStorage («pf.lang»)
async function open(query, opt) {
  query = query || ''; if (!/[?&]lang=/.test(query)) query += (query.includes('?') ? '&' : '?') + 'lang=es';
  await page.goto(BASE + '/' + query, { timeout: 180000 });
  await page.waitForFunction(() => window.PF && window.PF.ready, null, { timeout: 180000 });
  if (!(opt && opt.title)) await page.evaluate(() => { PF.ui.start(); });
  await page.waitForFunction(() => Object.values(PF.models.glbState).every((v) => v !== 'loading'), null, { timeout: 90000 }).catch(() => {});
}
const st = () => page.evaluate(() => PF.test.state());
const walk = (z, opt) => page.evaluate(([zz, o]) => PF.test.walkTo(zz, o), [z, opt || {}]);
const sim = (s) => page.evaluate((ss) => PF.test.sim(ss), s);
const hud = () => page.evaluate(() => Array.from(document.querySelectorAll('#platoHud li')).map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
// una orden escrita, de principio a fin; devuelve el registro (fuente, modelo, latencias, operaciones)
async function order(text, label) {
  const t0 = Date.now();
  const r = await page.evaluate(async (t) => {
    const rec = await PF.orders.submit(t, { via: 'texto' });
    return { ok: rec.ok, source: rec.source, ms: rec.ms, model: rec.model || null, ttft: rec.ttft || null, decision: rec.route && rec.route.decision ? { choice: rec.route.decision.choice, ms: rec.route.decision.ms, p: rec.route.decision.probability } : null, said: rec.said, ops: (rec.ops || []).map((o) => o.op + (o.kind ? ':' + o.kind : '')).join(', '), safety: rec.safety.join(', '), error: rec.error };
  }, text);
  latencies.push({ pass: label || '', text, source: r.source, decision: r.decision ? r.decision.choice + ' ' + r.decision.ms + ' ms' : '—', model: r.model || '—', ttft: r.ttft, ms: r.ms, wall: Date.now() - t0 });
  console.log(`    «${text}» → ${r.ok ? 'ok' : 'FALLO'} · ${r.source} · ${r.decision ? 'Decision-1.1 ' + r.decision.choice + ' (' + Math.round(r.decision.p * 100) + ' %, ' + r.decision.ms + ' ms) → ' : ''}${r.model || 'sin modelo'} · ${r.ms} ms${r.ops ? ' · ops: ' + r.ops : ''}${r.safety ? ' · red local: ' + r.safety : ''}${r.error ? ' · ' + r.error : ''} · «${r.said}»`);
  return r;
}

/* ---------------- el nivel entero, solo con órdenes (router: Decision-1.1 → GPT-6 Luna / GPT-6.2 Astra) ---------------- */
if (on('nivel')) {
  console.log('\n== El nivel de principio a fin solo con órdenes (por el router)');
  await open();
  await shot('inicio');
  let s = await walk(60, { maxT: 14, stopOnHurt: true });
  check(s.z < 44.5, `el guardián Gruñón corta el paso de piedra (te quedas en z=${s.z}${s.stop === 'hurt' ? ', y su anillo de brasas quema' : ''})`);
  await page.evaluate(() => PF.test.heal());
  await shot('gruñon');
  await order('elimina a este enemigo', 'router');
  await sleep(1500); await shot('gruñon-eliminado');
  check(await page.evaluate(() => !PF.get('enemy1') && PF.all('companion').length === 0), 'Gruñón ha desaparecido (y no aparece ningún compañero: solo llegan con «añade 5 compañeros»)');
  s = await walk(90, { maxT: 20 });
  check(s.z < 82.2, `el muro corta el paso (z=${s.z})`);
  await order('pon una escalera', 'router');
  await sleep(1200); await shot('escalera');
  s = await walk(96, { maxT: 25 });
  check(s.z > 88, `sube por la escalera y pasa el muro (z=${s.z}, punto de control ${s.cp})`);
  s = await walk(130, { maxT: 20, stopOnHurt: true });
  check(s.z < 117.5, `Refunfuño corta el cañón (z=${s.z})`);
  await page.evaluate(() => PF.test.heal());
  await order('pon un charco bajo el enemigo', 'router');
  check(await page.evaluate(() => { const e = PF.get('enemy2'); return !!PF.all('puddle').find((p) => e && p.contains(e.pos.x, e.pos.z)); }), 'hay un charco bajo Refunfuño');
  await order('pon un tiburón en el charco', 'router');
  check(await page.evaluate(() => PF.all('shark').length === 1), 'hay un tiburón en el charco');
  await sleep(800); await shot('tiburon');
  await order('haz que el tiburón se coma al enemigo', 'router');
  await sim(2.5); await sleep(500);
  check(await page.evaluate(() => !PF.get('enemy2')), 'el tiburón se ha comido a Refunfuño');
  await shot('comido');
  const near = await page.evaluate(() => { const p = PF.all('puddle')[0]; return p.pos.z - p.rz; });
  await page.evaluate((z) => { PF.test.teleport(0, 0, z - 1.5); PF.test.heal(); }, near);
  s = await walk(132, { maxT: 8, patience: 2, stopOnHurt: true });
  check(s.stop === 'hurt' && s.z < near + 8, `sin puente, el tiburón muerde a quien entra en el charco (z=${s.z}, vidas ${s.hearts})`);
  await sim(1.5);
  await page.evaluate((z) => { PF.test.teleport(0, 0, z - 2); PF.test.heal(); }, near);
  await order('pon un puente de madera que atraviese el charco de forma segura', 'router');
  await sim(1.5); await shot('puente');
  const h1 = (await st()).hearts;
  s = await walk(140, { maxT: 20 });
  check(s.z > 135 && s.hearts === h1, `cruza el puente de madera sin que le muerda (z=${s.z}, vidas ${s.hearts})`);
  await order('añade 5 compañeros npc que me ayuden', 'router');
  check(await page.evaluate(() => PF.all('companion').length) === 5, 'llegan 5 compañeros: ' + (await page.evaluate(() => PF.all('companion').map((c) => c.name + ' (' + c.data.role + ')').join(', '))));
  await sleep(1000); await shot('compañeros');
  // la arena: el jefe lanza bolas de fuego que prenden la hierba y la madera
  await page.evaluate(() => { PF.player.inv = 40; });
  s = await walk(170, { maxT: 12 });
  await sim(9);
  const fires = await page.evaluate(() => PF.fire.count());
  check(fires > 0, `las bolas de fuego del Rey Volcán prenden la arena (${fires} focos)`);
  await sleep(600); await shot('fuego');
  let decided = null; for (let i = 0; i < 24 && !decided; i++) { await sim(0.5); await sleep(500); decided = (await hud()).find((t) => /^COMPAÑEROS/i.test(t)); }
  check(Boolean(decided), 'Decision-1.1 decide qué hace cada compañero (panel): ' + (decided || 'sin decisión'));
  await order('que llueva', 'router');
  await sim(2);
  check(await page.evaluate(() => PF.fire.count()) === 0, 'la lluvia apaga el fuego');
  await shot('lluvia');
  await order('haz que el jefe final lance flores en lugar de bolas de fuego', 'router');
  const f0 = await page.evaluate(() => PF.flowerAt.count());
  await sim(7);
  const f1 = await page.evaluate(() => PF.flowerAt.count());
  check(await page.evaluate(() => PF.get('boss').projectile) === 'flowers' && f1 > f0, `el jefe lanza flores que florecen donde caen (${f1 - f0} flores nuevas)`);
  await shot('flores');
  await order('ponle un tutú al jefe final', 'router');
  await sim(3);
  const boss = await page.evaluate(() => { const b = PF.get('boss'); return { tutu: !!(b.wearing && b.wearing.tutu), mood: b.mood, gate: !!PF.world.gateOpen }; });
  check(boss.tutu && boss.mood === 'happy' && boss.gate, `con tutú y flores al Rey Volcán se le pasa el enfado y abre el rastrillo (${JSON.stringify(boss)})`);
  await sleep(800); await shot('tutu');
  await order('que salga el sol', 'router');
  s = await walk(212, { maxT: 25 });
  check(s.z > 207, `cruza el rastrillo (z=${s.z}${s.ride ? ', a lomos de Capi' : ''})`);
  s = await walk(232, { maxT: 12, patience: 2 });
  check(!s.won && s.z > 220 && s.z < 226.5, `sin la princesa, la meta no se abre (z=${s.z})`);
  await order('pon a la princesa junto al personaje del jugador', 'router');
  check(await page.evaluate(() => PF.get('princess').state === 'follow'), 'la princesa Lúa está junto al protagonista y le sigue');
  await sim(1); await shot('princesa');
  s = await walk(232, { maxT: 15 });
  check(s.won, `¡nivel superado! (z=${s.z})`);
  await sleep(1200); await shot('meta');
  await order('pon el logo de Foundry y Microsoft', 'router');
  await sim(2.5); await sleep(1500);
  const logos = await page.evaluate(() => ({ set: PF.finale.shownSet, cine: document.body.classList.contains('cine'), meshes: (() => { let n = 0; PF.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'ExtrudeGeometry') n++; }); return n; })() }));
  check(logos.set.includes('foundry') && logos.set.includes('microsoft') && logos.cine && logos.meshes >= 5, `logos 3D de Foundry y Microsoft girando, con confeti y encuadre final (${logos.meshes} piezas extruidas)`);
  await shot('logos');
  await sim(2); await sleep(800); await shot('logos-2');
  const steps = await page.evaluate(() => PF.orders.log.length);
  console.log(`    ${steps} órdenes para superar el nivel`);
}

/* ---------------- el camino alternativo: la lista otra vez (por el router, o sin modelo con la red de seguridad) ----------------
   Gruñón se lo come el tiburón (charco + tiburón + puente), a Refunfuño se le elimina, y el resto igual. */
async function alternative(label) {
  const local = label === 'local';
  await open();
  if (local) await page.evaluate(() => { PF.orders.offline = true; });
  let s = await walk(60, { maxT: 14, stopOnHurt: true });
  check(s.z < 44.5, `[${label}] Gruñón corta el paso (z=${s.z})`);
  await page.evaluate(() => PF.test.heal());
  await order('pon un charco bajo el enemigo', label);
  check(await page.evaluate(() => { const e = PF.get('enemy1'); return !!PF.all('puddle').find((p) => e && p.contains(e.pos.x, e.pos.z)); }), `[${label}] charco bajo Gruñón`);
  await order('pon un tiburón en el charco', label);
  await order('haz que el tiburón se coma al enemigo', label);
  await sim(2.5);
  check(await page.evaluate(() => !PF.get('enemy1')), `[${label}] el tiburón se come a Gruñón`);
  await order('pon un puente de madera que atraviese el charco de forma segura', label);
  await sim(1.5);
  s = await walk(66, { maxT: 20 });
  check(s.z > 60, `[${label}] cruza el paso por el puente (z=${s.z})`);
  s = await walk(90, { maxT: 20 });
  await order('pon una escalera', label);
  s = await walk(96, { maxT: 25 });
  check(s.z > 88, `[${label}] escalera y muro superados (z=${s.z})`);
  await order('añade 5 compañeros npc que me ayuden', label);
  check(await page.evaluate(() => PF.all('companion').length) === 5, `[${label}] cinco compañeros`);
  s = await walk(112, { maxT: 15, stopOnHurt: true });
  await page.evaluate(() => PF.test.heal());
  await order('elimina a este enemigo', label);
  await sim(2);
  check(await page.evaluate(() => !PF.get('enemy2') || PF.get('enemy2').state === 'doomed'), `[${label}] Refunfuño eliminado`);
  await page.evaluate(() => { PF.player.inv = 60; });
  s = await walk(168, { maxT: 20 });
  await sim(6);
  const fires = await page.evaluate(() => PF.fire.count());
  await order('que llueva', label);
  await sim(2);
  check(await page.evaluate(() => PF.fire.count()) === 0, `[${label}] la lluvia apaga el fuego (había ${fires} focos)`);
  await order('haz que el jefe final lance flores en lugar de bolas de fuego', label);
  await order('ponle un tutú al jefe final', label);
  await sim(3);
  check(await page.evaluate(() => PF.get('boss').mood === 'happy' && PF.world.gateOpen), `[${label}] el jefe baila con su tutú y abre el rastrillo`);
  await order('que salga el sol', label);
  await order('pon a la princesa junto al personaje del jugador', label);
  check(await page.evaluate(() => PF.get('princess').state === 'follow'), `[${label}] la princesa va con el protagonista`);
  s = await walk(232, { maxT: 40 });
  check(s.won, `[${label}] nivel superado (z=${s.z})`);
  await order('pon el logo de Foundry y Microsoft', label);
  await sim(2); await sleep(800);
  await order('pon el logo de GitHub Copilot', label);
  await sim(2.5); await sleep(1200);
  const set = await page.evaluate(() => PF.finale.shownSet);
  check(['foundry', 'microsoft', 'copilot'].every((k) => set.includes(k)), `[${label}] logos 3D: ${set.join(', ')}`);
  await shot('logos-' + label);
  if (local) {
    const net = (await hud()).find((t) => /RED DE SEGURIDAD/i.test(t));
    check(Boolean(net), 'el panel cuenta que actuó la red de seguridad: ' + (net || '—'));
    await page.evaluate(() => { PF.orders.offline = false; });
  }
}
if (on('alterno')) { console.log('\n== Camino alternativo, por el router (cada orden de la lista, por segunda vez)'); await alternative('router-2'); }
if (on('red')) { console.log('\n== La lista otra vez con el modelo «caído»: red de seguridad local y determinista'); await alternative('local'); }

/* ---------------- compañeros: ayudan de verdad y Decision-1.1 decide qué hace cada uno ---------------- */
if (on('compañeros')) {
  console.log('\n== Compañeros: Decision-1.1 decide qué hace cada uno y ayudan de verdad');
  await open();
  await page.evaluate(() => { PF.test.teleport(0, 0, 36); PF.orders.offline = true; });
  await order('añade 5 compañeros npc que me ayuden', 'local');
  await page.evaluate(() => { PF.orders.offline = false; });
  let helped = false, note = null;
  for (let i = 0; i < 16 && !helped; i++) {
    await page.evaluate(() => PF.allies.decideAll(true));
    await sleep(900); await sim(2);
    note = (await hud()).find((t) => /^COMPAÑEROS/i.test(t)) || note;
    helped = await page.evaluate(() => { const e = PF.get('enemy1'); return !e || e.state === 'doomed' || e.state === 'chase' || Math.abs(e.pos.z - 45.5) > 3; });
  }
  check(Boolean(note), 'Decision-1.1 reparte el trabajo (panel): ' + (note || '—'));
  check(helped, 'un compañero se encarga del guardián (lo aparta, le da una patada o lo distrae): ' + (await page.evaluate(() => PF.all('companion').map((c) => c.name + '=' + (c.task ? c.task.kind : c.act)).join(', '))));
  await shot('compañeros-guardian');
  // en la arena: el fuerte para las bolas de fuego y la nube apaga los incendios
  await page.evaluate(() => { PF.test.teleport(0, 0, 166); PF.player.inv = 60; PF.state.deflected = 0; PF.state.rained = 0; });
  await sim(8);
  const fires0 = await page.evaluate(() => PF.fire.count());
  let help2 = 0;
  for (let i = 0; i < 12 && help2 === 0; i++) {
    await page.evaluate(() => PF.allies.decideAll(true));
    await sleep(900); await sim(3);
    help2 = await page.evaluate(() => (PF.state.deflected || 0) + (PF.state.rained || 0));
  }
  const tasks = await page.evaluate(() => PF.all('companion').map((c) => c.name + '=' + (c.task ? c.task.kind : c.act)).join(', '));
  check(help2 > 0, `en la arena ayudan: ${await page.evaluate(() => PF.state.deflected || 0)} bolas de fuego devueltas y ${await page.evaluate(() => PF.state.rained || 0)} focos apagados por la nube (había ${fires0}) · ${tasks}`);
  await shot('compañeros-arena');
}

/* ---------------- respaldo: sin GLB, con los modelos de código ---------------- */
if (on('respaldo')) {
  console.log('\n== Respaldo: el nivel carga rápido y se juega igual sin ningún GLB (?glb=0)');
  const t0 = Date.now();
  await open('?glb=0');
  const r = await page.evaluate(() => ({ ms: PF.state.loadMs, glb: Object.values(PF.models.glbState).every((v) => v === 'procedural'), hero: !PF.player.ch.glb }));
  check(r.glb && r.hero, `todo con modelos de código; nivel listo en ${r.ms} ms (página en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await page.evaluate(() => { PF.orders.offline = true; PF.test.teleport(0, 0, 38); });
  await order('elimina a este enemigo', 'local');
  const s = await walk(52, { maxT: 10 });
  check(s.z > 50, `se juega igual (z=${s.z})`);
  await page.evaluate(() => { PF.test.teleport(0, 0.42, 186); const pr = PF.get('princess'); pr.state = 'free'; pr.pos.set(-1.5, 0.42, 189); PF.cam.override = (dt) => { PF.cam.pos.set(0, 2.6, 180.5); PF.cam.look.set(0, 1.6, 190); PF.cam.apply(dt); }; });
  await sleep(1500); await shot('respaldo');
  await page.evaluate(() => { PF.orders.offline = false; PF.cam.override = null; });
}

/* ---------------- el tiempo ---------------- */
if (on('tiempo')) {
  console.log('\n== El tiempo y la hora');
  if (!on('red') && !on('nivel')) await open();
  for (const [text, test] of [['que llueva', "PF.env.weather === 'rain'"], ['que nieve', "PF.env.weather === 'snow'"], ['que se haga de noche', 'PF.env.target > 21 || PF.env.target < 4'], ['atardecer', 'Math.abs(PF.env.target - 19) < 1'], ['que salga el sol', "PF.env.weather === 'clear' && PF.env.target > 6 && PF.env.target < 19"]]) {
    await order(text, 'tiempo');
    await sim(3); await sleep(400);
    check(await page.evaluate(test), `«${text}» → ${await page.evaluate(() => PF.env.weather + ', ' + PF.env.target.toFixed(1) + ' h')}`);
    await shot('tiempo-' + text.replace(/\W+/g, '-'));
  }
}

/* ---------------- voz: T pulsar para hablar ---------------- */
if (on('voz')) {
  console.log('\n== Voz: mantener T (micrófono falso → MAI-Transcribe-2-Streaming → orden)');
  await open();
  await walk(80, { maxT: 20 });
  const n0 = await page.evaluate(() => PF.orders.log.length);
  await page.evaluate(() => document.getElementById('stage').focus());
  await page.keyboard.down('KeyT');
  let partial = '';
  for (let i = 0; i < 12; i++) { await sleep(500); const t = await page.evaluate(() => document.getElementById('spellText').textContent || ''); if (t && !/Escuchando/.test(t)) partial = t; }
  await page.keyboard.up('KeyT');
  let rec = null; for (let i = 0; i < 60 && !rec; i++) { await sleep(500); rec = await page.evaluate((n) => { const L = PF.orders.log; return L.length > n && L[L.length - 1].ms ? { text: L[L.length - 1].text, ok: L[L.length - 1].ok, ms: L[L.length - 1].ms, source: L[L.length - 1].source } : null; }, n0); }
  check(Boolean(partial), `texto parcial mientras se habla: «${partial}»`);
  check(rec && rec.ok && /escalera/i.test(rec.text), `orden por voz: «${rec && rec.text}» → ${rec && rec.source} en ${rec && rec.ms} ms`);
  check(await page.evaluate(() => PF.all('ladder').length > 0), 'la escalera aparece');
  if (rec) latencies.push({ pass: 'voz', text: rec.text, source: rec.source, decision: '', model: '', ttft: null, ms: rec.ms, wall: rec.ms });
  await shot('voz');
}

/* ---------------- inventar: lo que no está en el catálogo ---------------- */
if (on('invento')) {
  console.log('\n== Inventar (Decision-1.1 → MAI-Code-2-Flash en el panel de código → Worker sin red → control visual)');
  await open();
  await walk(20, { maxT: 8 });
  const t0 = Date.now();
  await order('pon un dragón de gominola', 'invento');
  let codeShot = false, done = null;
  for (let i = 0; i < 300 && !done; i++) {
    await sleep(500);
    if (!codeShot) { const lines = await page.evaluate(() => { const c = document.querySelector('#platoCode.on code'); return c ? c.innerText.split('\n').length : 0; }); if (lines > 10) { codeShot = true; await shot('codigo'); console.log(`    código en vivo a los ${((Date.now() - t0) / 1000).toFixed(1)} s`); } }
    done = await page.evaluate(() => { const e = PF.all('invented')[0]; return e && e.data.bob ? { label: e.label, h: e.h } : null; });
    if (!done && await page.evaluate(() => !PF.all('invented').length)) break;
  }
  check(Boolean(done), `invento construido: ${done ? done.label + ' (' + done.h.toFixed(1) + ' m)' : 'no'} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  check(codeShot, 'el código se ve escribirse en el panel');
  let qa = null; for (let i = 0; i < 30 && !qa; i++) { await sleep(500); qa = (await hud()).find((t) => /^CONTROL VISUAL/i.test(t)); }
  check(Boolean(qa), 'control visual con Decision-1.1: ' + (qa || 'no apareció'));
  await sim(1); await sleep(800); await shot('invento');
}

/* ---------------- inglés: el nivel entero con órdenes inglesas (router + red local), sin español a la vista y con voces inglesas ---------------- */
// palabras y signos que delatarían un texto en español en la interfaz (Lúa y Plató son nombres propios)
const SPANISH = /[¡¿ñÑáéíóúÁÉÍÓÚ]|\b(el|los|las|del|que|para|con|una|uno|unos|por|pon|ponle|haz|hazlo|está|aquí|también|orden|órdenes|ordenes|enemigo|escalera|charco|tiburón|tiburon|puente|princesa|jefe|lluvia|llueva|nieve|noche|atardecer|meta|muro|cañón|canon|compañeros|companeros|ayuda|sonido|escribe|mantén|manten|moverse|saltar|correr|cargando|listo|decisiones|llamada|apto|razonamiento|vidas|gemas|rastrillo|flores|bolas|fuego|hola|gracias|vamos|nivel|superado|toma|vídeo|video real|estilo|generado|juego|cortinilla|descargar|cerrar|guion|seleccionar|plataformas|escuchando|escucha|rey|volcán|gruñón|refunfuño|tutú)\b/i;
const spanishIn = (texts) => texts.map((t) => String(t || '').replace(/Lúa|Plató/g, '')).filter((t) => SPANISH.test(t));
async function visibleTexts() {
  return page.evaluate(() => {
    const out = [], seen = new Set();
    const vis = (el) => el && el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : !!(el && el.offsetParent);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t || !vis(n.parentElement)) continue; const r = n.parentElement.getBoundingClientRect(); if (!r.width || !r.height) continue; if (!seen.has(t)) { seen.add(t); out.push(t); } }
    document.querySelectorAll('input[placeholder]').forEach((i) => { if (vis(i) && !i.value) out.push(i.placeholder); });
    // lo que se pinta en el lienzo 3D: carteles, tramos y nombres de los personajes
    for (const t of PF.world.signs) out.push(t);
    for (const s of PF.level.sections) out.push(s.name);
    for (const e of PF.all()) out.push(e.name || e.label || '');
    return out;
  });
}
async function noSpanish(where) {
  const bad = spanishIn(await visibleTexts());
  check(!bad.length, `${where}: sin texto en español a la vista` + (bad.length ? ' → ' + bad.slice(0, 6).map((t) => '«' + t.slice(0, 70) + '»').join(' · ') : ''));
  return !bad.length;
}
async function levelEn(label) {
  const local = label === 'en-local';
  await open('?lang=en', { title: true });
  await page.evaluate(() => { window.__voices = []; PF.on('voice', (v) => window.__voices.push(v)); });
  if (!local) {
    check(await page.evaluate(() => PF.lang === 'en' && localStorage.getItem('pf.lang') === 'en' && document.documentElement.lang === 'en'), 'se activa con ?lang=en y se recuerda en localStorage (pf.lang)');
    check(await page.evaluate(() => /3D/.test(document.querySelector('#title h1').textContent) && /platformer/i.test(document.querySelector('#title h1').textContent) && document.querySelector('#langSel button[data-lang="en"]').getAttribute('aria-pressed') === 'true'), 'portada «3D PLATFORMER» con el selector «EN · ES»');
    await sleep(800); await shot('title', 'en-'); await noSpanish('portada');
  }
  await page.evaluate(() => { PF.ui.start(); });
  if (local) await page.evaluate(() => { PF.orders.offline = true; });
  await sleep(1200);
  if (!local) { await page.evaluate(() => document.getElementById('bHelp').click()); await sleep(400); await shot('help', 'en-'); await noSpanish('ayuda (H)'); await page.evaluate(() => document.getElementById('bHelp').click()); }
  let s = await walk(60, { maxT: 14, stopOnHurt: true });
  check(s.z < 44.5, `[${label}] Grumble corta el paso de piedra (z=${s.z})`);
  await page.evaluate(() => PF.test.heal()); await sim(0.5);
  if (!local) { await sleep(600); await shot('grumble', 'en-'); await noSpanish('ante Grumble (tramo, pista y sugerencias)'); }
  await order('Remove this enemy.', label);
  await sleep(1000); await sim(1);
  check(await page.evaluate(() => !PF.get('enemy1') && PF.all('companion').length === 0), `[${label}] Grumble desaparece (y no aparece ningún compañero)`);
  if (!local) { await shot('removed', 'en-'); await noSpanish('tras «Remove this enemy» (registro, frase y respuesta)'); }
  s = await walk(90, { maxT: 20 });
  await order('put a ladder', label);
  s = await walk(96, { maxT: 25 });
  check(s.z > 88, `[${label}] escalera y muro superados (z=${s.z})`);
  s = await walk(130, { maxT: 20, stopOnHurt: true });
  await page.evaluate(() => PF.test.heal());
  await order('put a puddle under the enemy', label);
  check(await page.evaluate(() => { const e = PF.get('enemy2'); return !!PF.all('puddle').find((p) => e && p.contains(e.pos.x, e.pos.z)); }), `[${label}] charco bajo Grouch`);
  await order('put a shark in the puddle', label);
  check(await page.evaluate(() => PF.all('shark').length === 1), `[${label}] tiburón en el charco`);
  await order('make the shark eat the enemy', label);
  await sim(2.5); await sleep(400);
  check(await page.evaluate(() => !PF.get('enemy2')), `[${label}] el tiburón se come a Grouch`);
  if (!local) await shot('eaten', 'en-');
  const near = await page.evaluate(() => { const p = PF.all('puddle')[0]; return p.pos.z - p.rz; });
  await page.evaluate((z) => { PF.test.teleport(0, 0, z - 2); PF.test.heal(); }, near);
  await order(local ? 'put a wooden bridge across the puddle safely' : 'put a wooden bridge across the puddle', label);
  await sim(1.5);
  const h1 = (await st()).hearts;
  s = await walk(140, { maxT: 20 });
  check(s.z > 135 && s.hearts === h1, `[${label}] cruza el puente de madera sin que le muerda (z=${s.z})`);
  await order('add 5 companion NPCs to help me', label);
  check(await page.evaluate(() => PF.all('companion').length) === 5, `[${label}] 5 compañeros: ` + (await page.evaluate(() => PF.all('companion').map((c) => c.name).join(', '))));
  await sleep(2600);
  if (!local) { await shot('companions', 'en-'); await noSpanish('con los compañeros (bocadillos y panel)'); }
  await page.evaluate(() => { PF.player.inv = 60; });
  s = await walk(170, { maxT: 12 });
  await sim(8);
  const fires = await page.evaluate(() => PF.fire.count());
  if (!local) {
    let decided = null; for (let i = 0; i < 24 && !decided; i++) { await sim(0.5); await sleep(500); decided = (await hud()).find((t) => /^COMPANIONS/i.test(t)); }
    check(Boolean(decided) && /decisions? in 1 call/i.test(decided), 'Decision-1.1 decide por los compañeros (panel en inglés): ' + (decided || '—'));
  }
  await order('make it rain', label);
  await sim(2);
  check(await page.evaluate(() => PF.fire.count()) === 0, `[${label}] la lluvia apaga el fuego (había ${fires} focos)`);
  await order('make the final boss throw flowers instead of fireballs', label);
  await sim(5);
  check(await page.evaluate(() => PF.get('boss').projectile) === 'flowers', `[${label}] el jefe lanza flores`);
  await order('put a tutu on the final boss', label);
  await sim(3);
  check(await page.evaluate(() => PF.get('boss').mood === 'happy' && PF.world.gateOpen), `[${label}] tutú y flores: el Volcano King baila y abre el rastrillo`);
  if (!local) { await sleep(1200); await shot('tutu', 'en-'); await noSpanish('en la arena del Volcano King'); }
  if (local) { // el tiempo, también sin modelo
    for (const [text, test] of [['make it snow', "PF.env.weather === 'snow'"], ['make it night', 'PF.env.target > 21 || PF.env.target < 4'], ['sunset', 'Math.abs(PF.env.target - 19) < 1']]) {
      await order(text, label); await sim(1);
      check(await page.evaluate(test), `[${label}] “${text}” → ${await page.evaluate(() => PF.env.weather + ', ' + PF.env.target.toFixed(1) + ' h')}`);
    }
  }
  await order('make the sun come out', label);
  check(await page.evaluate(() => PF.env.weather === 'clear' && PF.env.target > 6 && PF.env.target < 19), `[${label}] sale el sol`);
  s = await walk(212, { maxT: 25 });
  await order('put the princess next to the player character', label);
  check(await page.evaluate(() => PF.get('princess').state === 'follow'), `[${label}] la princesa Lúa va con el protagonista`);
  await sim(1);
  s = await walk(232, { maxT: 40 });
  check(s.won, `[${label}] nivel superado (z=${s.z})`);
  await sleep(1500);
  if (!local) { await shot('goal', 'en-'); await noSpanish('meta y victoria'); }
  await order(local ? 'put the Foundry and Microsoft logos' : 'show the Foundry and Microsoft logos', label);
  await sim(2); await sleep(900);
  if (local) { await order('show the GitHub Copilot logo', label); await sim(2.5); await sleep(900); }
  const logos = await page.evaluate(() => ({ set: PF.finale.shownSet, cine: document.body.classList.contains('cine'), cap: document.querySelector('#caption').innerText.replace(/\s+/g, ' ') }));
  check(logos.set.includes('foundry') && logos.set.includes('microsoft') && logos.cine && /Built by talking/.test(logos.cap), `[${label}] logos y plano final: «${logos.cap}»`);
  if (!local) { await sleep(1200); await shot('logos', 'en-'); await noSpanish('plano final'); }
  if (local) {
    const net = (await hud()).find((t) => /^SAFETY NET/i.test(t));
    check(Boolean(net), 'el panel cuenta que actuó la red de seguridad (SAFETY NET): ' + (net || '—'));
    await page.evaluate(() => { PF.orders.offline = false; });
  } else {
    const v = await page.evaluate(() => window.__voices);
    const bad = v.filter((x) => x.lang !== 'en' || !/^en-/.test(x.voice) || spanishIn([x.text]).length);
    const who = Array.from(new Set(v.map((x) => x.who + ' → ' + x.voice))).join(' · ');
    check(v.length >= 5 && !bad.length, `${v.length} frases de personajes con voces inglesas de MAI-Voice-2.1-Flash: ${who}` + (bad.length ? ' · MAL: ' + JSON.stringify(bad.slice(0, 3)) : ''));
    const boss = v.find((x) => /Volcano King/.test(x.who)), pr = v.find((x) => /Princess/.test(x.who));
    check(boss && boss.voice === 'en-GB-Harry' && pr && pr.voice === 'en-US-Olivia', `reparto: Volcano King → ${boss && boss.voice}${boss && boss.style ? ' (' + boss.style + ')' : ''}, Princess Lúa → ${pr && pr.voice}${pr && pr.style ? ' (' + pr.style + ')' : ''}`);
  }
  await page.evaluate(() => { localStorage.setItem('pf.lang', 'es'); });
}
if (on('en')) { console.log('\n== Modo inglés (?lang=en): el nivel entero con órdenes en inglés, por el router'); await levelEn('en'); }
if (on('en-red')) { console.log('\n== Modo inglés con el modelo «caído»: la red de seguridad local en inglés'); await levelEn('en-local'); }

/* ---------------- voz en inglés: mantener T con el micrófono falso (MAI-Voice en inglés → MAI-Transcribe con lang=en) ---------------- */
if (on('en-voz')) {
  console.log('\n== Voz en inglés: mantener T (micrófono falso → MAI-Transcribe-2-Streaming en inglés → orden)');
  const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Put a ladder.', lang: 'en' }) });
  const mp3 = join(out, 'en-mic.mp3'), wavEn = join(out, 'en-mic.wav'); writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '0.6', '-i', 'anullsrc=r=48000:cl=mono', '-i', mp3, '-filter_complex', '[1:a]aresample=48000,aformat=channel_layouts=mono[v];[0:a][v]concat=n=2:v=0:a=1,apad=pad_dur=2', '-ar', '48000', '-ac', '1', wavEn]);
  const b2 = await launch(wavEn), p2 = await (await b2.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] })).newPage();
  p2.on('pageerror', (e) => errors.push('[en-voz] ' + String(e.message || e).slice(0, 300)));
  await p2.goto(BASE + '/?lang=en', { timeout: 180000 });
  await p2.waitForFunction(() => window.PF && window.PF.ready, null, { timeout: 180000 });
  await p2.evaluate(() => { PF.ui.start(); PF.test.walkTo(80, { maxT: 20 }); document.getElementById('stage').focus(); });
  const n0 = await p2.evaluate(() => PF.orders.log.length);
  await p2.keyboard.down('KeyT');
  let partial = '';
  for (let i = 0; i < 12; i++) { await sleep(500); const t = await p2.evaluate(() => document.getElementById('spellText').textContent || ''); if (t && !/Listening/.test(t)) partial = t; }
  await p2.keyboard.up('KeyT');
  let rec = null; for (let i = 0; i < 60 && !rec; i++) { await sleep(500); rec = await p2.evaluate((n) => { const L = PF.orders.log; return L.length > n && L[L.length - 1].ms ? { text: L[L.length - 1].text, ok: L[L.length - 1].ok, ms: L[L.length - 1].ms, source: L[L.length - 1].source, said: L[L.length - 1].said } : null; }, n0); }
  check(Boolean(partial), `texto parcial en inglés mientras se habla: «${partial}»`);
  check(rec && rec.ok && /ladder/i.test(rec.text), `orden por voz en inglés: «${rec && rec.text}» → ${rec && rec.source} en ${rec && rec.ms} ms · «${rec && rec.said}»`);
  check(await p2.evaluate(() => PF.all('ladder').length > 0), 'la escalera aparece');
  if (rec) latencies.push({ pass: 'en-voz', text: rec.text, source: rec.source, decision: '', model: '', ttft: null, ms: rec.ms, wall: rec.ms });
  await p2.screenshot({ path: join(out, 'en-voice.png') });
  await b2.close();
}

/* ---------------- «make it real» / «hacerlo real» (coste: solo si se pide) ---------------- */
if (want.has('real')) {
  const mock = process.env.PF_REAL === 'mock', lang = process.env.PF_REAL_LANG === 'es' ? 'es' : 'en', style = process.env.PF_REAL_STYLE === 'live' ? 'live' : null;
  console.log(`\n== ${lang === 'en' ? '«make it real»' : '«hazlo real»'} en el juego (${mock ? 'servidor de vídeo simulado, sin coste' : 'MAI-Image-2.7 + MiniMax H3 Max en fal: ~0,7 $'})`);
  let posts = 0; const reqs = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/real$/.test(new URL(r.url()).pathname)) { posts++; reqs.push(JSON.parse(decodeURIComponent(r.headers()['x-plato-job'] || '%7B%7D'))); } });
  if (mock) { // el servidor de vídeo simulado: etapas, primer fotograma y un vídeo de ejemplo
    const frame = readFileSync(join(out, '..', '..', 'app', 'assets', 'platform', 'logos', 'microsoft.svg'));
    const vid = readFileSync(join(out, '..', '..', 'app', 'media', '01-arrival.real.mp4'));
    let polls = 0; const stages = ['prep', 'image', 'image', 'submit', 'queue', 'render', 'render', 'download', 'done'];
    await page.route(/\/api\/real(\/.*)?$/, async (route) => {
      const u = new URL(route.request().url()), p = u.pathname;
      if (route.request().method() === 'POST') return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'mock-0001', state: 'running', stage: 'prep', secs: 0 }) });
      if (/\/frame$/.test(p)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: frame });
      if (/\/video$/.test(p)) return route.fulfill({ status: 200, contentType: 'video/mp4', body: vid });
      const stage = stages[Math.min(stages.length - 1, polls++)];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'mock-0001', mode: 'reference', style: style || 'animated', state: stage === 'done' ? 'done' : 'running', stage, label: stage, model: 'MiniMax H3 Max · fal en Foundry', frame: polls > 3, secs: polls * 2 }) });
    });
  }
  await open('?lang=' + lang);
  await page.evaluate(() => { window.__real = []; PF.on('real', (s) => window.__real.push({ event: s.event, phase: s.phase, stage: s.stage, id: s.id, secs: s.secs })); });
  // el mejor plano: el Rey Volcán con tutú, bailando entre flores (la puesta en escena va sin modelo, para no gastar)
  await page.evaluate(() => { PF.orders.offline = true; PF.test.teleport(0, 0, 168); PF.player.inv = 90; });
  await order(lang === 'en' ? 'make the final boss throw flowers instead of fireballs' : 'haz que el jefe final lance flores en lugar de bolas de fuego', 'real');
  await sim(9);
  await order(lang === 'en' ? 'put a tutu on the final boss' : 'ponle un tutú al jefe final', 'real');
  await sim(4);
  await page.evaluate(() => { PF.orders.offline = false; PF.test.teleport(0, 0.42, 182); PF.test.face(0); PF.test.heal(); });
  await sim(2); await sleep(1500);
  check(await page.evaluate(() => PF.get('boss').mood === 'happy' && PF.flowerAt.count() > 0), `el Rey Volcán baila con su tutú entre ${await page.evaluate(() => PF.flowerAt.count())} flores`);
  const t0 = Date.now();
  const rec = await order(lang === 'en' ? 'make it real' : 'hazlo real', 'real');
  check(rec.ok && await page.evaluate(() => PF.real.busy()), `la orden empieza el rodaje: ${rec.source} · «${rec.said}»`);
  await sleep(2500);
  const during = await page.evaluate(() => ({ phase: PF.real.state().phase, shooting: document.body.classList.contains('shooting'), rec: getComputedStyle(document.getElementById('recBadge')).display, hud: getComputedStyle(document.getElementById('platoHud')).opacity }));
  check(during.phase === 'shooting' && during.shooting && during.rec !== 'none', `plano de cine con bandas y REC (${JSON.stringify(during)})`);
  await shot('shooting', 'real-');
  // otra vez mientras tanto: ni la orden ni la API generan otro vídeo
  await page.evaluate(() => { PF.real.start({ style: 'live' }); document.getElementById('bReal').click(); });
  await order(lang === 'en' ? 'film this scene and make it real' : 'rueda esta escena y hazla real', 'real');
  let s = null; for (let i = 0; i < 60; i++) { s = await page.evaluate(() => PF.real.state()); if (s.phase !== 'shooting' && s.phase !== 'uploading') break; await sleep(500); }
  check(s.phase === 'generating' && s.id && s.takeSecs >= 6 && s.takeBytes > 200000, `toma grabada solo del lienzo 3D: ${s.takeSecs} s, ${(s.takeBytes / 1e6).toFixed(1)} MB, ${s.takeType}, ${(await page.evaluate(() => PF.real.state().takeFrames))} frames → job ${s.id} (${s.style}, ${s.mode})`);
  const note = async () => (await hud()).find((t) => /→ (real footage|metraje real)/i.test(t)) || '';
  let n = ''; for (let i = 0; i < 20 && !/MiniMax/.test(n); i++) { n = await note(); await sleep(500); }
  check(/MAI-Image-2\.7/.test(n) && /MiniMax H3 Max/.test(n) && (lang === 'en' ? /fal in Foundry/.test(n) : /fal en Foundry/.test(n)), 'nota en el panel del router con los chips y la etapa: ' + n.slice(0, 160));
  await sleep(1500); await shot('router', 'real-');
  // el juego sigue mientras tanto
  const z0 = (await st()).z; await walk(z0 + 3, { maxT: 3 }); const z1 = (await st()).z;
  check(z1 > z0 + 1, `el juego sigue jugable mientras genera (z ${z0} → ${z1})`);
  let framed = false;
  for (let i = 0; i < (mock ? 60 : 900) && s.phase === 'generating'; i++) {
    await sleep(mock ? 500 : 1000); s = await page.evaluate(() => PF.real.state());
    if (!framed && s.frame) { framed = true; await sleep(1500); const img = await page.evaluate(() => !!document.querySelector('#platoHud li img.shot[src*="/frame"]')); check(img, `miniatura del primer fotograma real en el panel a los ${s.secs} s (etapa ${s.stage})`); await shot('frame', 'real-'); }
  }
  check(s.phase === 'done' && s.video, `generado en ${s.secs} s: ${s.video}${s.error ? ' · ' + s.error : ''}`);
  await sleep(2500);
  const cmp = await page.evaluate(() => { const b = document.getElementById('realCmp'), v = Array.from(b.querySelectorAll('.panes video')); return { on: b.classList.contains('on'), videos: v.map((x) => ({ src: x.currentSrc.slice(0, 40), ready: x.readyState, playing: !x.paused, loop: x.loop })), dl: (b.querySelector('a.dl') || {}).getAttribute && b.querySelector('a.dl').getAttribute('download'), text: b.innerText.replace(/\s+/g, ' ').slice(0, 220) }; });
  check(cmp.on && cmp.videos.length === 2 && cmp.videos.every((v) => v.playing && v.loop) && /\.mp4$/.test(cmp.dl || ''), 'comparación juego ↔ vídeo generado, lado a lado, en bucle y con descarga: ' + JSON.stringify(cmp.videos) + ' · ' + cmp.dl);
  await shot('compare', 'real-');
  await page.evaluate(() => PF.real.view('wipe')); await sleep(2200); await shot('wipe', 'real-');
  if (lang === 'en') { const bad = spanishIn([cmp.text]); check(!bad.length, 'comparación en inglés: ' + cmp.text.slice(0, 120)); }
  await page.keyboard.press('Escape'); await sleep(500);
  check(await page.evaluate(() => !PF.real.isOpen() && !document.getElementById('realCmp').classList.contains('on')), 'Esc cierra la comparación');
  check(posts === 1, `una sola generación (${posts} POST /api/real) · estilo ${reqs[0] && reqs[0].style}`);
  const ev = await page.evaluate(() => window.__real.map((e) => e.event).filter((e, i, a) => e !== a[i - 1]).join(' → '));
  check(/shoot → recorded → submitted/.test(ev) && /done → open/.test(ev) && /close/.test(ev), 'eventos PF.emit(\'real\'): ' + ev);
  // la toma (para generar otro estilo con la misma toma: node tests/platform-api.mjs real)
  const take = await page.evaluate(async () => { const s = PF.real.state(); const b = await (await fetch(s.take)).blob(); const buf = new Uint8Array(await b.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { b64: btoa(bin), type: b.type, prompt: s.prompt, style: s.style, id: s.id, secs: s.takeSecs }; });
  const ext = /webm/.test(take.type) ? 'webm' : 'mp4';
  writeFileSync(join(out, 'real-take.' + ext), Buffer.from(take.b64, 'base64'));
  writeFileSync(join(out, 'real-take.json'), JSON.stringify({ file: 'real-take.' + ext, type: take.type, prompt: take.prompt, style: take.style, id: take.id, secs: take.secs, mock }, null, 2));
  console.log(`    toma: tests/out/real-take.${ext} · ${mock ? 'simulado' : 'resultado: out/jobs/' + take.id + '/real.mp4'} · ${((Date.now() - t0) / 1000).toFixed(0)} s en total`);
  console.log('    prompt: ' + take.prompt);
}

check(!errors.length, 'sin errores en la consola' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
await browser.close();
if (latencies.length) {
  console.log('\n== Latencias por orden (ms: total en el juego · Decision-1.1 · primer token)');
  for (const l of latencies) console.log(`  ${l.pass.padEnd(7)} ${String(l.ms).padStart(6)} ms  ${String(l.source).padEnd(13)} ${String(l.decision).padEnd(16)} ttft ${l.ttft == null ? '—' : l.ttft + ' ms'}  «${l.text}»`);
  writeFileSync(join(out, want.size ? 'pf-latencias-' + [...want].join('-') + '.json' : 'pf-latencias.json'), JSON.stringify(latencies, null, 2)); // la ejecución completa no se pisa con una parcial
}
console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
