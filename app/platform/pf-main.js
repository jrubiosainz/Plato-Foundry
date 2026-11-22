/* Plataformas 3D · arranque y bucle principal.
   El nivel carga al momento con modelos de código; los GLB del manifiesto (si los hay) llegan después y los sustituyen.
   Portada con la cámara girando, bucle de juego, meta (solo se entra con la princesa), resolución adaptable y unas
   ayudas para las pruebas sin pantalla (PF.test: simular el juego sin pintar y caminar con piloto automático). */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const $ = (id) => document.getElementById(id);
  function fatal(msg) { const f = $('fatal'); if (f) { f.style.display = 'grid'; f.textContent = msg; } console.error(msg); }

  /* ---------- la meta: una cortina de luz que solo se abre si la princesa va contigo ---------- */
  let curtain = null, curtainCol = null, curtainA = 1, goalWarnT = -99;
  function buildGoalGate() {
    const z = PF.level.goal.z;
    const mat = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, alpha: { value: 1 } }, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float time, alpha; varying vec2 vUv;\n'
        + 'void main(){ float r = length(vec2((vUv.x - 0.5) * 2.0, vUv.y)); float arch = smoothstep(1.0, 0.93, r);\n'
        + ' float w = 0.5 + 0.5 * sin(vUv.y * 38.0 - time * 3.0 + sin(vUv.x * 11.0 + time) * 2.0); float sp = step(0.985, fract(sin(dot(floor(vUv * vec2(60.0, 30.0)) + floor(time * 4.0), vec2(12.9898, 78.233))) * 43758.5453));\n'
        + ' vec3 c = mix(vec3(1.0, 0.72, 0.25), vec3(1.0, 0.95, 0.75), w) * (0.16 + 0.22 * w) + vec3(1.0) * sp * 0.6; gl_FragColor = vec4(c * arch * alpha, 1.0); }',
    });
    curtain = new T.Mesh(new T.PlaneGeometry(6.8, 3.4), mat); curtain.position.set(0, 1.7, z); curtain.renderOrder = 8; PF.scene.add(curtain);
    curtainCol = PF.addBox(-3.1, 0, z - 0.25, 3.1, 3.3, z + 0.25, 'curtain');
  }
  function princessWithYou() { const pr = PF.get('princess'), P = PF.player; return !!(pr && (pr.state === 'follow' || pr.state === 'goal') && Math.hypot(pr.pos.x - P.pos.x, pr.pos.z - P.pos.z) < 12); }
  function updateGoal(dt) {
    if (!curtain) return;
    const open = princessWithYou() || PF.state.won;
    curtainA = U.damp(curtainA, open ? 0 : 1, 3, dt); curtain.material.uniforms.alpha.value = curtainA; curtain.material.uniforms.time.value = PF.time; curtain.visible = curtainA > 0.01;
    if (open && curtainCol) { PF.dropCollider(curtainCol); curtainCol = null; PF.sfx.play('sparkle'); PF.fx.magic(0, 1.5, PF.level.goal.z, 50); }
    if (!open && !curtainCol) curtainCol = PF.addBox(-3.1, 0, PF.level.goal.z - 0.25, 3.1, 3.3, PF.level.goal.z + 0.25, 'curtain');
    const P = PF.player, z = PF.level.goal.z;
    if (!open && P.pos.z > z - 1.6 && Math.abs(P.pos.x) < 3.3 && P.pos.y < 3 && PF.time - goalWarnT > 7) { goalWarnT = PF.time; PF.toast(PF.L('La meta solo se abre con la princesa: di «pon a la princesa junto al personaje del jugador»', 'The goal only opens with the princess: say “put the princess next to the player character”'), 5200); }
    if (open && !PF.state.won && P.pos.z > z + 0.4 && Math.abs(P.pos.x) < 3.3 && P.pos.y < 3) win();
  }
  function win() {
    PF.state.won = true;
    const secs = Math.round(PF.time - (PF.state.startT || 0));
    PF.sfx.play('fanfare'); PF.after(0.4, () => PF.sfx.play('bell')); PF.shake(0.3);
    const bell = PF.world.bell; if (bell) PF.tween(2.6, (k) => { bell.rotation.z = Math.sin(k * 22) * (1 - k) * 0.55; });
    const z = PF.level.goal.z, cols = ['#ffd84d', '#ff6fb5', '#7fe3b0', '#8cc4ff', '#ffffff', '#ff9a3c'];
    for (const s of [-1, 1]) PF.fx.confetti(150, () => ({ at: [s * 3.4, 3.6, z], v: [-s * U.rand(0.5, 3), U.rand(6, 11), U.rand(-2, 2)], c: cols[Math.floor(Math.random() * cols.length)], life: U.rand(4, 7) }));
    const pr = PF.get('princess'); if (pr) { pr.data.happy = true; PF.after(0.6, () => PF.say(pr, PF.L('¡Lo hemos conseguido! ¡Gracias, ' + PF.NAME + '!', 'We did it! Thank you, ' + PF.NAME + '!'), { voice: true })); }
    PF.say(PF.player, PF.L('¡Nivel superado!', 'Level complete!'), { voice: false });
    for (const c of PF.all('companion')) c.task = { kind: 'cheer', t: 0, dur: 10 };
    PF.emit('win', { orders: PF.state.orders || 0, secs });
  }

  /* ---------- portada: la cámara gira despacio sobre el prado ---------- */
  let titleA = 0.6;
  function titleCam(dt) {
    titleA += dt * 0.1;
    const c = V(0, 1.2, 14), r = 17;
    PF.cam.pos.set(c.x + Math.sin(titleA) * r, 7.5 + Math.sin(titleA * 0.7) * 1.5, c.z - Math.cos(titleA) * r);
    PF.cam.look.set(0, 1.4, 12);
    PF.cam.apply(dt);
  }

  /* ---------- entrada ---------- */
  const ZERO = { f: 0, s: 0, run: false, jump: false, jumpHeld: false };
  // paseo automático (el cierre coloca al protagonista en su marca)
  function autoInput() {
    const a = PF.autoWalk; if (!a) return null;
    const P = PF.player, dx = a.x - P.pos.x, dz = a.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.35 || PF.time > a.until) { PF.autoWalk = null; if (a.done) a.done(); return ZERO; }
    return { wx: dx / d, wz: dz / d, f: 0, s: 0, run: false, jump: false, jumpHeld: false };
  }
  function readInput() {
    const IN = PF.input, K = IN.keys, Pr = IN.pressed;
    let r = autoInput();
    if (r) Pr.clear();
    else if (!PF.state.started) r = ZERO;
    else r = { f: (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0), s: (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0), run: K.has('ShiftLeft') || K.has('ShiftRight'), jump: Pr.has('Space'), jumpHeld: K.has('Space') };
    Pr.clear(); PF.inputState = r; return r;
  }

  /* ---------- un paso de simulación ---------- */
  function scaleK() { return PF.renderer.domElement.height / 2 / Math.tan((PF.camera.fov * Math.PI) / 360); }
  function step(dt, inp) {
    PF.time += dt;
    PF.updateTweens();
    PF.updateActors(dt, inp);
    PF.updateBoss(dt);
    PF.updateAllies();
    PF.world.update(dt);
    PF.finale.update(dt);
    updateGoal(dt);
    PF.fx.update(dt, scaleK());
  }
  PF.step = step;

  /* ---------- bucle con resolución adaptable (fluido en Apple Silicon, aguanta en máquinas lentas) ---------- */
  let last = 0, frameAvg = 16, adaptT = 0;
  const maxPR = Math.min(window.devicePixelRatio || 1, 1.75);
  function adapt(ms) {
    frameAvg += (ms - frameAvg) * 0.05; adaptT += ms; if (adaptT < 2000) return; adaptT = 0;
    const r = PF.renderer, cur = r.getPixelRatio();
    if (frameAvg > 24 && cur > 1) { r.setPixelRatio(Math.max(1, cur - 0.25)); r.setSize(innerWidth, innerHeight, false); }
    else if (frameAvg < 12.5 && cur < maxPR) { r.setPixelRatio(Math.min(maxPR, cur + 0.25)); r.setSize(innerWidth, innerHeight, false); }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const ms = last ? now - last : 16, dt = Math.min(0.05, Math.max(0.0005, ms / 1000)); last = now;
    try { step(dt, readInput()); PF.ui.update(); PF.renderer.render(PF.scene, PF.camera); if (PF.onRendered) PF.onRendered(); } catch (e) { if (!frame.warned) { frame.warned = true; console.error(e); } }
    adapt(ms);
    PF.frames = (PF.frames || 0) + 1;
  }

  /* ---------- ayudas para las pruebas (tests/platform-e2e.mjs) ---------- */
  const snap = () => { const P = PF.player; return { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), hearts: P.hearts, cp: P.cp, climb: !!P.climb, ride: !!P.ride, won: !!PF.state.won, section: PF.world.sectionAt(P.pos.z).name }; };
  PF.test = {
    state: snap,
    // simula el juego sin pintar (en un navegador sin GPU va mucho más rápido que en tiempo real)
    sim(seconds, inputFn, dt) { dt = dt || 1 / 30; const n = Math.ceil(seconds / dt); for (let i = 0; i < n; i++) { const inp = inputFn ? inputFn(i * dt) : autoInput() || ZERO; PF.inputState = inp; step(dt, inp); } return snap(); },
    // piloto automático: corre por el centro del camino hasta z (o hasta quedarse bloqueado)
    walkTo(z, opt) {
      opt = opt || {}; const P = PF.player, dt = 1 / 30, maxT = opt.maxT || 40, lane = opt.x || 0;
      let t = 0, bestZ = P.pos.z, stuck = 0, jumpCd = 0, s0 = null; const h0 = P.hearts;
      while (t < maxT) {
        const dx = lane - P.pos.x, dz = z - P.pos.z; if (Math.abs(dz) < 0.6 && Math.abs(dx) < 1) break;
        const l = Math.hypot(dx * 0.6, dz) || 1, wantJump = opt.jump && stuck > 0.4 && jumpCd <= 0;
        const inp = { wx: (dx * 0.6) / l, wz: dz / l, f: 0, s: 0, run: opt.run !== false, jump: wantJump, jumpHeld: wantJump || (opt.jump && stuck > 0.4) };
        if (wantJump) jumpCd = 0.8; jumpCd -= dt;
        PF.inputState = inp; step(dt, inp); t += dt;
        if (P.pos.z > bestZ + 0.05) { bestZ = P.pos.z; stuck = 0; } else stuck += dt;
        if (stuck > (opt.patience || 3) && !P.climb) break;
        if (opt.stopOnHurt && P.hearts < h0) { s0 = 'hurt'; break; }
      }
      const s = snap(); s.reached = P.pos.z >= z - 0.8; s.simSeconds = +t.toFixed(1); s.stop = s0; return s;
    },
    teleport(x, y, z) { const P = PF.player; P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.climb = null; P.ride = null; P.carried = null; P.lastSafe.copy(P.pos); PF.cam.snap(); return snap(); },
    face(yaw) { PF.player.yaw = yaw; PF.cam.yaw = yaw; PF.cam.snap(); },
    heal() { const P = PF.player; P.hearts = P.maxHearts; P.inv = 0; P.frozen = false; return snap(); },
  };

  /* ---------- arranque ---------- */
  async function boot() {
    const canvas = $('stage');
    try { PF.world.init(canvas); } catch (e) { fatal(PF.L('Este navegador no puede mostrar el juego en 3D (WebGL): ', 'This browser can’t show the 3D game (WebGL): ') + ((e && e.message) || e)); return; }
    PF.renderer.setPixelRatio(maxPR); PF.renderer.setSize(innerWidth, innerHeight, false);
    PF.input.bindCanvas(canvas);
    PF.ui.loading(PF.L('Cargando el nivel…', 'Loading the level…'));
    const t0 = performance.now();
    await PF.models.loadManifest(); PF.models.preload(); PF.finale.preload();
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]); } catch (e) {}
    PF.world.buildLevel();
    const L = PF.level;
    PF.initPlayer(); PF.player.pos.set(L.start[0], L.start[1], L.start[2]); PF.player.lastSafe.copy(PF.player.pos);
    PF.spawn('wall', {});
    for (const en of L.enemies) PF.spawn('enemy', { id: en.id, name: en.name, guardR: en.guardR, at: V(en.at[0], en.at[1], en.at[2]) });
    const pr = PF.spawn('princess', { id: 'princess', at: V(L.princessAt[0], L.princessAt[1], L.princessAt[2]) });
    pr.voice = { name: PF.L('Princesa Lúa', 'Princess Lúa'), role: 'a brave, cheerful princess in a family platform game', seed: 'lua-3', gender: 'female', cast: { en: 'en-US-Olivia' } };
    PF.initBoss();
    buildGoalGate();
    try { await Promise.race([PF.finale.warm(), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { console.warn(e); }
    PF.ui.init();
    PF.setTime(13, true); PF.setWeather('clear', true);
    PF.cam.snap(); PF.cam.override = titleCam;
    PF.on('start', () => { PF.state.startT = PF.time; });
    PF.state.loadMs = Math.round(performance.now() - t0);
    PF.ui.loading(PF.L('Listo', 'Ready'));
    PF.ready = true; PF.emit('ready', { ms: PF.state.loadMs });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
