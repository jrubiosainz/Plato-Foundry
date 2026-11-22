/* Plataformas 3D · «Hacerlo real» / «Make it real».
   Un plano de cine de unos segundos alrededor de lo que hay delante (en la arena, el Rey Volcán), grabado solo del lienzo
   3D (sin interfaz) con MediaRecorder a 1280×720 y 30 fps, que el servidor convierte en vídeo (server/video.mjs):
   MAI-Image-2.7 pinta el primer fotograma y MiniMax H3 Max (fal en Foundry) genera el vídeo siguiendo la toma. Mientras
   tanto el juego sigue; al terminar se abre la comparación juego ↔ vídeo generado (lado a lado o con cortinilla), en bucle
   y con descarga. Estilo por defecto: 'animated' (película de animación 3D); 'live' es imagen real.
   API para grabar el vídeo de producto:
     PF.real.start({ style, mode, secs, target, prompt, open, dry }) → promesa que se cumple al terminar (un solo trabajo a la vez)
     PF.real.state() → { phase, stage, label, id, secs, video, frame, take, … }    PF.real.close() · PF.real.open()
     PF.real.show(id) → vuelve a abrir la comparación de un trabajo ya generado (out/jobs/<id>), sin coste
     eventos PF.on('real', (s) => …) con s.event: shoot, recorded, submitted, stage, frame, done, open, close, error */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U, L = PF.L;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const W = 1280, H = 720, FPS = 30, BITRATE = 10e6;

  const R = (PF.real = {});
  const fresh = () => ({ phase: 'idle', event: null, stage: null, label: '', id: null, style: null, mode: null, by: null, subject: null, prompt: '', takeSecs: 0, takeBytes: 0, take: null, takeType: null, frame: null, video: null, model: null, serverSecs: 0, error: null, startedAt: 0, endedAt: 0, open: false });
  let st = fresh(), job = null, lastStart = -1, tick = 0;
  const secsNow = () => (st.startedAt ? Math.round(((st.endedAt || Date.now()) - st.startedAt) / 1000) : 0);
  R.state = () => Object.assign({}, st, { secs: secsNow(), busy: !!job });
  function emit(event, extra) { st.event = event; const s = Object.assign(R.state(), extra || {}); PF.emit('real', s); paint(); return s; }
  R.busy = () => !!job;
  R.idle = () => !job && (st.phase === 'idle' || st.phase === 'error');
  R.lastStart = () => lastStart; // en tiempo de juego (la red de seguridad lo compara con el inicio de la orden)
  R.isOpen = () => st.open;
  R.shooting = () => st.phase === 'shooting'; // mientras rueda, el Rey Volcán gira más despacio (se lee mejor en el vídeo)

  /* ================= qué se rueda ================= */
  const INTEREST = { boss: 5, princess: 4, shark: 4, invented: 4, enemy: 3, companion: 3, bridge: 1, ladder: 1, puddle: 1 };
  function pickSubject(target) {
    if (target) { const e = typeof target === 'string' ? (target === 'player' ? PF.player : PF.get(target)) : target; if (e) return e; }
    const P = PF.player, boss = PF.get('boss');
    if (boss && P.pos.z > 140 && P.pos.z < 210 && Math.hypot(boss.pos.x - P.pos.x, boss.pos.z - P.pos.z) < 45) return boss;
    const cy = PF.cam.yaw; let best = null, bs = 1e9;
    for (const e of PF.all()) {
      if (!INTEREST[e.type] || e.state === 'doomed') continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz); if (d > 26) continue;
      const ang = Math.abs(U.wrapAngle(Math.atan2(dx, dz) - cy)); if (ang > 1.2) continue;
      const sc = d + ang * 6 - INTEREST[e.type] * 3; if (sc < bs) { bs = sc; best = e; }
    }
    return best || P;
  }

  /* ================= la descripción de la escena (para MAI-Image-2.7 y MiniMax H3 Max; siempre en inglés) ================= */
  const HERO = 'Rubio, a cheerful young man with a shaved bald head and a short brown beard, wearing an open dark-grey zip hoodie over a burgundy T-shirt, blue jeans and black sneakers with white soles';
  const BOSS = 'the Volcano King, a huge, round golem made of dark grey basalt rock with glowing orange lava cracks, big bushy eyebrows and a small golden crown';
  const PRINCESS = 'Princess Lúa, a small, cheerful princess with brown skin, curly dark hair in two buns, a silver tiara, a mint-green dress with little stars and a lilac cape';
  const IMP = 'a small grumpy ember imp, a round lava-pebble creature with little horns and a glowing orange belly';
  const ALLY = { strong: 'Granito, a gentle stone golem', flyer: 'Nubi, a little white cloud with feathered wings', mount: 'Capi, a calm brown capybara with a red saddle cushion', jumper: 'Brinca, a sporty kangaroo', tiny: 'Pipo, a tiny blue-grey mouse' };
  const SECTION = [
    'on a grassy floating island meadow with round trees, colourful flowers and a dirt path, under a blue sky with puffy clouds',
    'on a narrow stone causeway between rocky cliffs, with a stone gate',
    'on a grassy island in front of a tall lavender stone wall',
    'on a narrow path through a canyon between tall rock walls',
    'in a grassy castle arena surrounded by rocks, with grey stone castle walls, round towers with blue cone roofs and an iron portcullis behind',
    'in a castle courtyard with a golden arch and a bell, a fairytale castle behind',
  ];
  function light() {
    const E = PF.env, h = E.target, wx = { rain: ' Rain is falling.', storm: ' A storm, rain and lightning.', snow: ' Snow is falling.', fog: ' Soft fog.', cloudy: ' Overcast sky.' }[E.weather] || '';
    const tod = h < 5 || h >= 21 ? 'Night, moonlight and warm lantern light.' : h < 8 ? 'Soft sunrise light.' : h < 17 ? 'Bright afternoon sunlight.' : 'Warm golden-hour light.';
    return tod + wx;
  }
  function describe(e) {
    if (e === PF.player) return HERO;
    if (e.type === 'boss') {
      const tutu = !!(e.wearing && e.wearing.tutu), happy = e.mood === 'happy';
      const act = happy ? 'dances happily, spinning gracefully on tiptoe like a ballerina' : tutu ? 'spins around in his tutu' : e.projectile === 'flowers' ? 'throws big bouquets of flowers' : e.projectile === 'fireballs' ? 'angrily throws blazing fireballs' : 'throws ' + e.projectile;
      return BOSS + (tutu ? ', wearing a puffy two-layer pink ballet tutu with a bow' : '') + ', ' + act;
    }
    if (e.type === 'princess') return PRINCESS + (e.state === 'caged' ? ', locked in a hanging golden cage' : '');
    if (e.type === 'enemy') return IMP;
    if (e.type === 'shark') return 'a friendly cartoon shark swimming in a round blue puddle';
    if (e.type === 'companion') return ALLY[e.data.role] || 'a friendly cartoon companion';
    if (e.type === 'invented') return 'a toy-like ' + (e.data.what || e.label);
    return 'a ' + (e.label || e.type);
  }
  function scenePrompt(subject) {
    const P = PF.player, near = (e, d) => e && e !== subject && Math.hypot(e.pos.x - subject.pos.x, e.pos.z - subject.pos.z) < d;
    const parts = [describe(subject) + ', ' + SECTION[Math.max(0, PF.world.sectionAt(subject.pos.z).n - 1)] + '.'];
    if (subject.type === 'boss' && PF.flowerAt && PF.flowerAt.count && PF.flowerAt.count() > 0) parts.push('Pink, yellow and violet flowers have bloomed all over the grass around him and petals drift in the air.');
    if (PF.fire && PF.fire.count && PF.fire.count() > 0) parts.push('Small fires burn in the grass.');
    const others = [];
    if (subject !== P && near(P, 18)) others.push(HERO);
    const pr = PF.get('princess'); if (pr && pr.state !== 'caged' && near(pr, 18)) others.push(PRINCESS);
    const al = PF.all('companion').filter((c) => near(c, 18)).map((c) => ALLY[c.data.role]).filter(Boolean); if (al.length) others.push('their companions ' + al.join(', '));
    if (others.length) parts.push('Nearby: ' + others.join('; ') + '.');
    parts.push(light());
    parts.push('The camera makes a slow, smooth cinematic orbit around ' + (subject === P ? 'him' : subject.type === 'boss' ? 'the Volcano King' : 'it') + ' at a low angle, gently pushing in and rising.');
    return parts.join(' ').slice(0, 1200);
  }

  /* ================= el plano: órbita lenta, baja y que se acerca ================= */
  // ¿hay algo sólido en ese punto (muros, tarima, rastrillo, árboles…)? El suelo y el propio protagonista del plano no cuentan.
  function solidAt(p, subject, pad) {
    pad = pad || 0;
    for (const c of PF.solids) if (c.on && c.tag !== 'ground' && c.ent !== subject && p.x > c.min[0] - pad && p.x < c.max[0] + pad && p.z > c.min[2] - pad && p.z < c.max[2] + pad && p.y > c.min[1] - pad && p.y < c.max[1] + pad) return true;
    for (const c of PF.cyls) if (c.on && c.ent !== subject && Math.hypot(p.x - c.x, p.z - c.z) < c.r + pad && p.y > c.y0 - pad && p.y < c.y1 + pad) return true;
    return false;
  }
  // la tarima o el canto de un muro justo delante de la cámara taparían el plano: la cámara no se pone encima ni pegada
  function footprint(p, subject) {
    for (const c of PF.solids) if (c.on && c.tag !== 'ground' && c.ent !== subject && p.x > c.min[0] - 1.6 && p.x < c.max[0] + 1.6 && p.z > c.min[2] - 1.6 && p.z < c.max[2] + 1.6 && c.max[1] > 0.2) return true;
    return false;
  }
  function plan(subject) {
    const e = subject, P = PF.player, h = e === P ? 1.5 : e.h || (e.ch && e.ch.height) || 1.6;
    const d0 = U.clamp(h * 2.0 + 1.0, 4.0, 11), d1 = U.clamp(h * 1.5 + 0.6, 3.0, 8), sweep = 1.45;
    const cam = PF.camera.position, camA = Math.atan2(cam.x - e.pos.x, cam.z - e.pos.z);
    // de frente al personaje (el primer fotograma es el que pinta MAI-Image-2.7); si no, desde donde ya mira la cámara
    const faceA = e === P ? P.yaw : e.type === 'boss' || e.type === 'princess' || e.type === 'companion' || e.type === 'enemy' ? (e.root ? e.root.rotation.y : camA) : camA;
    const at = (a0, dir, k, out) => {
      const q = U.smooth(k), a = a0 + dir * sweep * q, d = U.lerp(d0, d1, q);
      const x = e.pos.x + Math.sin(a) * d, z = e.pos.z + Math.cos(a) * d, cy = e.pos.y + h * 0.5, g = PF.groundAt(x, z, cy + 8);
      const y = Math.max(g > -50 ? g + 0.6 : e.pos.y + 0.6, e.pos.y + U.lerp(Math.max(0.9, h * 0.25), h * 0.75 + 0.6, q));
      return (out || V()).set(x, y, z);
    };
    const c = V(), p = V();
    let best = null;
    for (const base of [faceA, camA]) for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) for (const dir of [1, -1]) {
      const a0 = base + off; let cost = Math.abs(off) * 0.9 + (base === camA ? 0.6 : 0);
      for (let k = 0; k <= 1.0001; k += 0.125) {
        at(a0, dir, k, p); c.set(e.pos.x, e.pos.y + h * 0.5, e.pos.z);
        if (solidAt(p, e, 0.4)) cost += 6; if (footprint(p, e)) cost += 3;
        const dd = p.distanceTo(c), steps = Math.ceil(dd / 0.45); for (let i = 1; i < steps; i++) if (solidAt(c.clone().lerp(p, i / steps), e, 0)) { cost += 2; break; }
      }
      if (!best || cost < best.cost) best = { a0, dir, cost };
    }
    const pos = V();
    return (k) => { at(best.a0, best.dir, k, pos); PF.cam.pos.copy(pos); PF.cam.look.set(e.pos.x, e.pos.y + h * U.lerp(0.62, 0.55, U.smooth(k)), e.pos.z); };
  }

  /* ================= grabar solo el lienzo 3D (1280×720, 30 fps) ================= */
  const MIMES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const pickMime = () => MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  function recorder() {
    if (!window.MediaRecorder) throw new Error(L('Este navegador no puede grabar el lienzo (MediaRecorder)', 'This browser can’t record the canvas (MediaRecorder)'));
    const src = PF.renderer.domElement, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { alpha: false }), mime = pickMime(), stream = c.captureStream(FPS);
    const mr = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: BITRATE }, mime ? { mimeType: mime } : {}));
    const chunks = []; let on = false, frames = 0, t0 = 0;
    mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    // el lienzo del juego se recorta a 16:9 por el centro; se copia justo después de pintar (antes de que el navegador lo presente)
    const draw = () => { const sw = src.width, sh = src.height; let cw = sw, ch = (sw * 9) / 16; if (ch > sh) { ch = sh; cw = (sh * 16) / 9; } g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H); frames++; };
    return {
      start() { on = true; t0 = performance.now(); draw(); PF.onRendered = () => { if (on) draw(); }; mr.start(250); },
      stop() {
        return new Promise((res, rej) => {
          on = false; PF.onRendered = null; const secs = (performance.now() - t0) / 1000;
          mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const type = (mr.mimeType || mime || 'video/webm').split(';')[0]; const blob = new Blob(chunks, { type }); if (!blob.size) rej(new Error(L('La toma salió vacía', 'The take came out empty'))); else res({ blob, type, secs, frames }); };
          try { mr.stop(); } catch (e) { rej(e); }
        });
      },
    };
  }
  async function shoot(subject, secs) {
    const prev = PF.cam.override, path = plan(subject), rec = recorder();
    let t0 = 0;
    PF.cam.override = (dt) => { path(t0 ? Math.min(1, (performance.now() - t0) / (secs * 1000)) : 0); PF.cam.shakeK = 0; PF.cam.apply(dt); };
    document.body.classList.add('shooting'); PF.sfx.play('knock');
    const badge = document.querySelector('#recBadge .rt');
    try {
      await nextFrame(); await nextFrame(); // la cámara ya está en su marca antes de grabar
      t0 = performance.now(); rec.start();
      while (performance.now() - t0 < secs * 1000) { if (badge) badge.textContent = '00:' + String(Math.floor((performance.now() - t0) / 1000)).padStart(2, '0'); paint(); await new Promise((r) => setTimeout(r, 120)); }
      return await rec.stop();
    } finally {
      PF.cam.override = prev; PF.cam.idleT = 0; document.body.classList.remove('shooting');
    }
  }

  /* ================= el trabajo completo ================= */
  R.start = (opts) => {
    opts = opts || {};
    if (job) return job; // ya hay uno en marcha: nunca se generan dos a la vez
    if (!PF.ready || !PF.renderer) return Promise.reject(new Error('not ready'));
    if (!PF.state.started && PF.ui) PF.ui.start();
    closeCmp(true); if (st.take) { try { URL.revokeObjectURL(st.take); } catch (e) {} }
    const hud = window.PLATO && window.PLATO.HUD;
    const style = opts.style === 'live' ? 'live' : 'animated', mode = opts.mode === 'draft' || opts.mode === 'reference' ? opts.mode : (hud && hud.videoMode ? hud.videoMode() : 'reference');
    const secs = U.clamp(+opts.secs || 7, 3, 10);
    st = fresh(); Object.assign(st, { phase: 'shooting', style, mode, by: opts.by || 'api', startedAt: Date.now() });
    lastStart = PF.time;
    job = run(opts, secs).finally(() => { job = null; clearInterval(tick); paint(); });
    clearInterval(tick); tick = setInterval(paint, 500);
    return job;
  };
  async function run(opts, secs) {
    try {
      const subject = pickSubject(opts.target);
      st.subject = subject === PF.player ? 'player' : subject.id;
      st.prompt = String(opts.prompt || scenePrompt(subject)).slice(0, 1500);
      emit('shoot', { shotSecs: secs });
      const take = await shoot(subject, secs);
      st.take = URL.createObjectURL(take.blob); st.takeType = take.type; st.takeSecs = Math.round(take.secs * 10) / 10; st.takeBytes = take.blob.size; st.takeFrames = take.frames;
      st.phase = opts.dry ? 'recorded' : 'uploading'; emit('recorded');
      if (opts.dry) { st.endedAt = Date.now(); return R.state(); } // ensayo: solo la toma, sin generar
      const P = window.PLATO; if (!P || !P.makeReal) throw new Error(L('El servidor de Plató no está disponible', 'The Plató server isn’t available'));
      const res = await P.makeReal({
        blob: take.blob, type: take.type, prompt: st.prompt, secs: take.secs, mode: st.mode, style: st.style,
        onJob: (id) => { st.id = id; st.phase = 'generating'; emit('submitted'); },
        onProgress: (s) => { const changed = s.stage !== st.stage; st.stage = s.stage; st.label = s.label; st.serverSecs = s.secs; if (s.model) st.model = P.tm ? P.tm(s.model) : s.model; if (changed) emit('stage'); },
        onFrame: (url) => { st.frame = url; emit('frame'); },
      });
      st.id = res.id || st.id; st.video = '/api/real/' + st.id + '/video'; st.model = res.model || st.model; st.phase = 'done'; st.stage = 'done'; st.endedAt = Date.now();
      PF.sfx.play('ding'); emit('done');
      if (opts.open !== false) openCmp();
      return R.state();
    } catch (e) {
      st.phase = 'error'; st.error = String((e && e.message) || e).slice(0, 200); st.endedAt = Date.now();
      document.body.classList.remove('shooting');
      emit('error'); if (PF.toast) PF.toast(L('No se pudo hacer real: ', 'Couldn’t make it real: ') + st.error, 6000);
      throw e;
    }
  }

  /* ================= botón de la cabecera ================= */
  function paint() {
    const b = $('bReal'); if (!b) return;
    const lbl = b.querySelector('.rl'), rt = b.querySelector('.rt'), ph = st.phase;
    const cls = ph === 'shooting' ? 'rec' : ph === 'uploading' || ph === 'generating' ? 'busy' : ph === 'done' && !st.open ? 'ready' : '';
    if (b.className.replace(/\b(rec|busy|ready)\b/g, '').trim() !== 'tbtn glass' || !b.classList.contains(cls || 'tbtn')) b.className = 'tbtn glass' + (cls ? ' ' + cls : '');
    const text = ph === 'shooting' ? 'REC' : cls === 'busy' ? L('Haciéndolo real', 'Making it real') : cls === 'ready' ? L('Ver vídeo real', 'Watch real video') : L('Hacerlo real', 'Make it real');
    if (lbl && lbl.textContent !== text) lbl.textContent = text;
    const t = ph === 'shooting' || cls === 'busy' ? mmss(secsNow()) : '';
    if (rt && rt.textContent !== t) rt.textContent = t;
    b.setAttribute('aria-busy', String(!!job));
  }
  R.button = () => {
    if (job) return;
    if (st.phase === 'done' && !st.open) { openCmp(); return; }
    R.start({ by: 'button' }).catch(() => {});
  };

  /* ================= la comparación: juego ↔ vídeo generado ================= */
  let wipeRaf = 0, wipeAuto = true;
  function openCmp() {
    const box = $('realCmp'); if (!box || st.phase !== 'done') return false;
    const styleName = st.style === 'animated' ? L('animación 3D de cine', '3D animated film') : L('imagen real', 'live action');
    const gen = st.endedAt && st.startedAt ? mmss((st.endedAt - st.startedAt) / 1000) : '';
    const dl = 'plato-' + (PF.EN ? 'make-it-real' : 'hacerlo-real') + '-' + st.style + '-' + String(st.id || '').slice(0, 8);
    const takeExt = /webm/.test(st.takeType || '') ? '.webm' : '.mp4';
    const capGame = '<figcaption>' + L('Juego', 'Game') + '<small>' + L('three.js en tiempo real · solo el lienzo 3D', 'real-time three.js · 3D canvas only') + '</small></figcaption>';
    const capReal = (cls) => '<figcaption' + (cls ? ' class="' + cls + '"' : '') + '>' + L('Generado', 'Generated') + '<small>MAI-Image-2.7 → ' + esc(st.mode === 'draft' ? 'LTX-2.5 Fast' : 'MiniMax H3 Max') + ' · ' + L('fal en Foundry', 'fal in Foundry') + '</small></figcaption>';
    box.innerHTML = '<div class="box">'
      + '<header><b>' + L('Hacerlo real', 'Make it real') + '</b><span class="chips"><span class="chip">MAI-Image-2.7</span>→<span class="chip">' + esc(st.mode === 'draft' ? 'LTX-2.5 Fast' : 'MiniMax H3 Max') + '</span><span class="chip f">' + L('fal en Foundry', 'fal in Foundry') + '</span><span>' + L('estilo: ', 'style: ') + esc(styleName) + ' · ' + L('toma de ', 'take ') + st.takeSecs + ' s' + (gen ? ' · ' + L('listo en ', 'ready in ') + gen : '') + '</span></span></header>'
      + '<div class="panes"><figure><video class="vg" muted loop playsinline preload="auto"></video>' + capGame + '</figure><figure><video class="vr" muted loop playsinline preload="auto"></video>' + capReal('') + '</figure></div>'
      + '<div class="wipe"><video class="wg" muted loop playsinline preload="auto"></video><video class="top wr" muted loop playsinline preload="auto"></video><div class="line"></div>' + capGame + capReal('r') + '</div>'
      + '<footer><button type="button" data-v="side" aria-pressed="true">' + L('Lado a lado', 'Side by side') + '</button><button type="button" data-v="wipe" aria-pressed="false">' + L('Cortinilla', 'Wipe') + '</button><span class="sp"></span>'
      + '<a class="dl" href="' + esc(st.video) + '" download="' + esc(dl) + '.mp4">' + L('Descargar vídeo', 'Download video') + '</a><a class="dlt" href="' + esc(st.take) + '" download="' + esc(dl) + '-' + L('toma', 'take') + takeExt + '">' + L('Descargar toma', 'Download take') + '</a>'
      + '<button type="button" data-audio aria-pressed="false" title="' + L('El vídeo generado trae su propio sonido (MiniMax H3)', 'The generated video comes with its own sound (MiniMax H3)') + '">' + L('Sonido del vídeo', 'Video sound') + '</button>'
      + '<button type="button" data-again>' + L('Rodar otra toma', 'Shoot another take') + '</button><button type="button" class="main" data-close>' + L('Cerrar', 'Close') + ' <kbd>Esc</kbd></button></footer></div>';
    const q = (s) => box.querySelector(s);
    const pairs = [[q('.vg'), q('.vr')], [q('.wg'), q('.wr')]];
    for (const [g, r] of pairs) {
      g.src = st.take; r.src = st.video;
      // el vídeo generado manda: cuando vuelve a empezar, la toma del juego también
      let last = 0; r.addEventListener('timeupdate', () => { if (r.currentTime + 0.05 < last) { try { g.currentTime = 0; } catch (e) {} } last = r.currentTime; });
      g.play().catch(() => {}); r.play().catch(() => {});
    }
    box.querySelectorAll('footer [data-v]').forEach((b) => { b.onclick = () => view(b.getAttribute('data-v')); });
    q('[data-close]').onclick = () => closeCmp();
    // sin sonido por defecto; si se activa, solo suena el vídeo generado que se está viendo
    q('[data-audio]').onclick = (ev) => { const b = ev.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); st.audio = on; syncAudio(); };
    q('[data-again]').onclick = () => { closeCmp(); R.start({ style: st.style, mode: st.mode, by: 'again' }).catch(() => {}); };
    const wipe = q('.wipe');
    wipe.addEventListener('pointermove', (e) => { const r = wipe.getBoundingClientRect(); wipeAuto = false; wipe.style.setProperty('--cut', U.clamp(((e.clientX - r.left) / r.width) * 100, 0, 100).toFixed(1) + '%'); });
    wipe.addEventListener('pointerleave', () => { wipeAuto = true; });
    box.addEventListener('click', (e) => { if (e.target === box) closeCmp(); });
    box.classList.remove('wiping'); box.classList.add('on'); st.open = true; st.audio = false;
    cancelAnimationFrame(wipeRaf); wipeAuto = true;
    const sweep = (t) => { if (!st.open) return; if (wipeAuto && box.classList.contains('wiping')) wipe.style.setProperty('--cut', (50 + Math.sin(t / 1400) * 38).toFixed(1) + '%'); wipeRaf = requestAnimationFrame(sweep); };
    wipeRaf = requestAnimationFrame(sweep);
    box.tabIndex = -1; box.focus({ preventScroll: true }); // el foco entra en el diálogo (Esc lo cierra)
    emit('open'); return true;
  }
  function syncAudio() {
    const box = $('realCmp'); if (!box) return; const wiping = box.classList.contains('wiping');
    box.querySelectorAll('video').forEach((el) => { el.muted = !(st.audio && (wiping ? el.classList.contains('wr') : el.classList.contains('vr'))); });
  }
  function view(v) {
    const box = $('realCmp'); if (!box) return;
    box.classList.toggle('wiping', v === 'wipe'); syncAudio();
    box.querySelectorAll('footer [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)));
    box.querySelectorAll('video').forEach((el) => el.play().catch(() => {}));
    emit('view', { view: v });
  }
  function closeCmp(silent) {
    const box = $('realCmp'); if (!box || !st.open) return false;
    st.open = false; cancelAnimationFrame(wipeRaf);
    box.querySelectorAll('video').forEach((el) => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} });
    box.classList.remove('on', 'wiping'); box.innerHTML = '';
    const cv = $('stage'); if (cv) cv.focus({ preventScroll: true });
    if (!silent) emit('close'); else paint();
    return true;
  }
  R.open = () => openCmp();
  // vuelve a enseñar la comparación de un trabajo ya generado (también después de reiniciar el servidor), sin generar nada
  R.show = async (id) => {
    if (job) return R.state();
    const r = await fetch('/api/real/' + encodeURIComponent(id)); if (!r.ok) throw new Error(L('No existe ese vídeo', 'That video doesn’t exist'));
    const s = await r.json(); if (s.state !== 'done') throw new Error(L('Ese vídeo aún no está listo', 'That video isn’t ready yet'));
    closeCmp(true); const P = window.PLATO, now = Date.now();
    st = fresh(); Object.assign(st, { phase: 'done', stage: 'done', id: s.id, style: s.style || 'live', mode: s.mode, by: 'show', video: '/api/real/' + s.id + '/video', frame: s.frame ? '/api/real/' + s.id + '/frame' : null, take: '/api/real/' + s.id + '/take', takeType: 'video/mp4', takeSecs: Math.round((s.takeSecs || 0) * 10) / 10, model: P && P.tm ? P.tm(s.model) : s.model, startedAt: now - (s.secs || 0) * 1000, endedAt: now });
    openCmp(); return R.state();
  };
  R.close = () => closeCmp();
  R.view = (v) => view(v === 'wipe' ? 'wipe' : 'side');
  R.scenePrompt = (target) => scenePrompt(pickSubject(target));
  // Esc cierra la comparación antes que cualquier otra cosa (la ayuda o el plano final)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) { e.preventDefault(); e.stopImmediatePropagation(); closeCmp(); } }, true);
})();
