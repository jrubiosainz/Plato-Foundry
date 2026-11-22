/* Plataformas 3D · núcleo: espacio de nombres PF, utilidades, colores y materiales, texturas procedurales, entrada,
   tiempo de juego (tweens y temporizadores), efectos de sonido sintetizados con WebAudio y partículas. */
'use strict';
(function () {
  const PF = (window.PF = window.PF || {});
  const T = THREE;

  /* ---------- el protagonista: nombre y diseño en un solo sitio (pf-models.js lo construye con estos valores) ---------- */
  PF.HERO = {
    name: 'Rubio',
    skin: '#f2b48c', blush: '#ff9a86', nose: '#ec9f7c', beard: '#5a3420', brows: '#3f2414', iris: '#4a2a17',
    tee: '#9b1b30',
    hoodie: '#3c3d42', hoodieStyle: 'open', // 'open' (abierta con cremallera), 'pullover' (cerrada) o null (sin sudadera)
    cords: '#f4f3ef',
    jeans: '#2f5fa8', shoes: '#17181c', soles: '#f6f3ec', laces: '#ffffff',
    glasses: false, headphones: false, // complementos «geek» opcionales
  };
  PF.NAME = PF.HERO.name;
  PF.state = { started: false, won: false, cine: false, orders: 0 };

  /* ---------- idioma: 'es' (por defecto) o 'en' (?lang=en, recordado en localStorage «pf.lang») ---------- */
  PF.lang = window.PLATO_LANG === 'en' ? 'en' : 'es';
  PF.EN = PF.lang === 'en';
  PF.L = (es, en) => (PF.EN && en !== undefined ? en : es); // cada texto visible lleva su versión inglesa al lado
  PF.quote = (s) => (PF.EN ? '“' + s + '”' : '«' + s + '»');

  /* ---------- utilidades ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const outCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const outBack = (t) => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const outElastic = (t) => { t = clamp(t, 0, 1); return t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; };
  const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R = rng(20261120);
  const rand = (a, b) => a + (b - a) * R();
  // sin tildes ni signos (también comillas inglesas y apóstrofos), para la red de seguridad local
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:"'«»()\[\]\u2018\u2019\u201c\u201d]/g, ' ').replace(/\s+/g, ' ').trim();
  PF.U = { clamp, lerp, damp, smooth, outCubic, outBack, outElastic, wrapAngle, dampAngle, rng, rand, R, norm };

  /* ---------- colores (hex sRGB → lineal, porque la salida es sRGB) y materiales compartidos ---------- */
  const colCache = new Map();
  PF.col = (hex) => { const k = String(hex); let c = colCache.get(k); if (!c) { c = new T.Color(hex).convertSRGBToLinear(); colCache.set(k, c); } return c; };
  const matCache = new Map();
  PF.mat = (hex, o) => {
    o = o || {};
    const key = hex + '|' + JSON.stringify(o);
    let m = matCache.get(key); if (m) return m;
    const p = { color: PF.col(hex), roughness: o.rough != null ? o.rough : 0.72, metalness: o.metal || 0, flatShading: !!o.flat };
    if (o.emissive) { p.emissive = PF.col(o.emissive); p.emissiveIntensity = o.glow != null ? o.glow : 1; }
    if (o.opacity != null && o.opacity < 1) { p.transparent = true; p.opacity = o.opacity; p.depthWrite = !!o.depthWrite; }
    if (o.side) p.side = T.DoubleSide;
    if (o.map) p.map = PF.tex(o.map);
    m = new T.MeshStandardMaterial(p);
    if (!o.unique) matCache.set(key, m);
    return m;
  };

  /* ---------- texturas procedurales (casi blancas: el color lo pone el material) ---------- */
  const texCache = {};
  PF.tex = (name) => {
    if (texCache[name]) return texCache[name];
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const r = rng(name.length * 7919 + name.charCodeAt(0));
    const grey = (v) => { v = Math.round(clamp(v, 0, 255)); return 'rgb(' + v + ',' + v + ',' + v + ')'; };
    const speck = (n, lo, hi, sz) => { for (let i = 0; i < n; i++) { g.fillStyle = grey(lo + r() * (hi - lo)); const s = 1 + r() * sz; g.fillRect(r() * S, r() * S, s, s); } };
    const blot = (n, r0, r1, lo, hi, al) => { for (let i = 0; i < n; i++) { const x = r() * S, y = r() * S, rr = r0 + r() * (r1 - r0), v = Math.round(lo + r() * (hi - lo)); for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr); gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',' + al + ')'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); g.fillStyle = gr; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); } } };
    g.fillStyle = grey(240); g.fillRect(0, 0, S, S);
    if (name === 'grass') { blot(60, 12, 46, 200, 255, 0.45); speck(1600, 205, 255, 2); for (let i = 0; i < 500; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.1 + r() * 0.15) + ')'; g.lineWidth = 1; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5); g.stroke(); } }
    else if (name === 'dirt') { for (let y = 0; y < S; y += 16) { g.fillStyle = grey(222 + r() * 28); g.fillRect(0, y, S, 16); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y + 14, S, 2); } blot(40, 6, 24, 180, 255, 0.35); speck(1200, 170, 250, 3); }
    else if (name === 'stone') { g.fillStyle = grey(150); g.fillRect(0, 0, S, S); const rows = 4, bh = S / rows; for (let row = 0; row < rows; row++) { let x = (row % 2) * -40; while (x < S) { const w = 56 + r() * 60, v = 205 + r() * 45; g.fillStyle = grey(v); g.beginPath(); const x0 = x + 3, y0 = row * bh + 3, ww = w - 6, hh = bh - 6, rr = 8; g.moveTo(x0 + rr, y0); g.arcTo(x0 + ww, y0, x0 + ww, y0 + hh, rr); g.arcTo(x0 + ww, y0 + hh, x0, y0 + hh, rr); g.arcTo(x0, y0 + hh, x0, y0, rr); g.arcTo(x0, y0, x0 + ww, y0, rr); g.fill(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + 4, y0 + 2, ww - 8, 3); x += w; } } speck(900, 180, 250, 2); }
    else if (name === 'wood') { const per = 4, pw = S / per; for (let i = 0; i < per; i++) { g.fillStyle = grey(214 + r() * 34); g.fillRect(i * pw, 0, pw, S); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * pw, 0, 3, S); for (let k = 0; k < 18; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)'; g.fillRect(i * pw + 5 + r() * (pw - 10), r() * S, 1 + r(), 30 + r() * 160); } if (r() < 0.6) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(i * pw + pw * (0.3 + r() * 0.4), r() * S, 4, 8, 0, 0, 6.283); g.fill(); } } }
    else if (name === 'rock') { g.fillStyle = grey(200); g.fillRect(0, 0, S, S); blot(50, 14, 60, 150, 255, 0.5); for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.1) + ')'; g.lineWidth = 1 + r() * 1.5; let x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += r() * 30; g.lineTo(x, y); } g.stroke(); } speck(1400, 160, 255, 2); }
    else if (name === 'bark') { for (let x = 0; x < S; x += 6) { g.fillStyle = grey(190 + r() * 60); g.fillRect(x, 0, 6, S); } for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(r() * S, r() * S, 3, 20 + r() * 40); } }
    else if (name === 'path') { g.fillStyle = grey(236); g.fillRect(0, 0, S, S); blot(30, 20, 60, 210, 255, 0.4); speck(2500, 190, 255, 2); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    texCache[name] = t; return t;
  };

  /* ---------- geometrías: fusionar piezas con color por vértice (una sola llamada de dibujo) ---------- */
  PF.merge = (parts) => {
    const geos = parts.map((p) => { let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); if (p.m) g.applyMatrix4(p.m); return { g, c: p.c ? (p.c.isColor ? p.c : PF.col(p.c)) : PF.col('#ffffff') }; });
    let n = 0; for (const q of geos) n += q.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const q of geos) {
      const P = q.g.attributes.position, N = q.g.attributes.normal, U = q.g.attributes.uv;
      for (let i = 0; i < P.count; i++, o++) { pos[o * 3] = P.getX(i); pos[o * 3 + 1] = P.getY(i); pos[o * 3 + 2] = P.getZ(i); if (N) { nor[o * 3] = N.getX(i); nor[o * 3 + 1] = N.getY(i); nor[o * 3 + 2] = N.getZ(i); } col[o * 3] = q.c.r; col[o * 3 + 1] = q.c.g; col[o * 3 + 2] = q.c.b; if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); } }
      q.g.dispose();
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.computeBoundingSphere(); return g;
  };
  const M4 = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), S3 = new T.Vector3(), P3 = new T.Vector3();
  PF.mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => { E.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(E); P3.set(x || 0, y || 0, z || 0); S3.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz); return new T.Matrix4().compose(P3, Q, S3); };
  PF.M4 = M4;

  /* ---------- tiempo de juego: tweens y temporizadores (avanzan con la simulación, no con el reloj de pared) ---------- */
  PF.time = 0;
  const tweens = [];
  PF.tween = (dur, fn, done) => { const tw = { t0: PF.time, dur: Math.max(0.0001, dur), fn, done, dead: false }; tweens.push(tw); try { fn(0); } catch (e) { console.warn(e); } return tw; };
  PF.after = (sec, fn) => PF.tween(sec, () => {}, fn);
  PF.updateTweens = () => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; if (tw.dead) { tweens.splice(i, 1); continue; }
      const k = clamp((PF.time - tw.t0) / tw.dur, 0, 1);
      try { tw.fn(k); } catch (e) { console.warn(e); }
      if (k >= 1) { tweens.splice(i, 1); if (tw.done) try { tw.done(); } catch (e) { console.warn(e); } }
    }
  };

  /* ---------- entrada ---------- */
  const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const IN = (PF.input = { keys: new Set(), pressed: new Set(), drag: null, dx: 0, dy: 0, wheel: 0, typing });
  window.addEventListener('keydown', (e) => { if (typing(e) || e.metaKey || e.ctrlKey) return; if (!IN.keys.has(e.code)) IN.pressed.add(e.code); IN.keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => { IN.keys.delete(e.code); });
  window.addEventListener('blur', () => IN.keys.clear());
  IN.bindCanvas = (cv) => {
    cv.addEventListener('pointerdown', (e) => { if (e.button !== 0 && e.button !== 2) return; IN.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} cv.classList.add('drag'); cv.focus(); });
    cv.addEventListener('pointermove', (e) => { if (!IN.drag || IN.drag.id !== e.pointerId) return; IN.dx += e.clientX - IN.drag.x; IN.dy += e.clientY - IN.drag.y; IN.drag.x = e.clientX; IN.drag.y = e.clientY; });
    const up = (e) => { if (IN.drag && IN.drag.id === e.pointerId) { IN.drag = null; cv.classList.remove('drag'); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { IN.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  /* ---------- sonido: efectos sintetizados con WebAudio (originales; nada se descarga) ---------- */
  PF.sfx = (() => {
    let ac = null, out = null, on = true; let noiseBuf = null;
    try { on = localStorage.getItem('plato.pf.sound') !== 'off'; } catch (e) {}
    function ctx() {
      if (!on) return null;
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = 0.42; const comp = ac.createDynamicsCompressor(); out.connect(comp); comp.connect(ac.destination); } catch (e) { ac = null; return null; } }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    }
    function env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function tone(type, f0, f1, dur, vol, at, lp) {
      const c = ctx(); if (!c) return; const t = c.currentTime + (at || 0);
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, 0.008, dur, vol); let node = o; if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; } node.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, type, f0, f1, at, q) {
      const c = ctx(); if (!c) return; const t = c.currentTime + (at || 0);
      if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const s = c.createBufferSource(); s.buffer = noiseBuf; const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0 || 800, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 0.8;
      const g = c.createGain(); env(g, t, 0.01, dur, vol); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    const S = {
      jump: () => { tone('sine', 240, 520, 0.18, 0.16); tone('triangle', 480, 900, 0.12, 0.05); },
      land: () => noise(0.09, 0.18, 'lowpass', 320, 120),
      gem: () => { [1319, 1661, 1976].forEach((f, i) => tone('sine', f, f, 0.18, 0.09, i * 0.045)); },
      hurt: () => { tone('sawtooth', 380, 140, 0.28, 0.1, 0, 1400); noise(0.15, 0.1, 'bandpass', 900); },
      poof: () => { noise(0.42, 0.26, 'lowpass', 2200, 180); tone('sine', 300, 90, 0.3, 0.08); },
      splash: () => { noise(0.5, 0.3, 'bandpass', 1800, 500, 0, 0.6); noise(0.3, 0.12, 'highpass', 3000, 0, 0.08); },
      chomp: () => { tone('square', 150, 70, 0.1, 0.18, 0, 900); tone('square', 140, 60, 0.12, 0.2, 0.16, 900); noise(0.08, 0.15, 'lowpass', 600, 0, 0.16); },
      burp: () => tone('sawtooth', 110, 70, 0.35, 0.12, 0, 500),
      fire: () => noise(0.7, 0.16, 'lowpass', 700, 300),
      whoosh: () => noise(0.4, 0.12, 'bandpass', 400, 1800, 0, 1.2),
      bloom: () => { [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, f * 1.01, 0.3, 0.06, i * 0.06)); },
      pop: () => tone('sine', 520, 1100, 0.09, 0.12),
      clank: () => { for (let i = 0; i < 4; i++) tone('triangle', 620 - i * 40, 560 - i * 40, 0.09, 0.07, i * 0.08); },
      knock: () => { tone('sine', 190, 110, 0.09, 0.2); noise(0.04, 0.12, 'bandpass', 1400); },
      build: () => { for (let i = 0; i < 6; i++) { tone('sine', 200 - i * 6, 120, 0.08, 0.15, i * 0.09); noise(0.03, 0.08, 'bandpass', 1500, 0, i * 0.09); } },
      sparkle: () => { for (let i = 0; i < 6; i++) tone('sine', 1500 + i * 180, 1700 + i * 200, 0.12, 0.035, i * 0.04); },
      fanfare: () => { [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [988, 0.6], [1047, 0.72]].forEach(([f, t]) => { tone('triangle', f, f, t > 0.5 ? 0.5 : 0.16, 0.11, t); tone('sine', f / 2, f / 2, 0.2, 0.06, t); }); },
      bell: () => { tone('sine', 880, 880, 1.4, 0.12); tone('sine', 1760, 1760, 0.9, 0.05); tone('sine', 2637, 2637, 0.5, 0.03); },
      thunder: () => { noise(2.2, 0.35, 'lowpass', 260, 60); noise(0.4, 0.2, 'lowpass', 900, 200); },
      grr: () => tone('sawtooth', 95, 70, 0.45, 0.11, 0, 420),
      rumble: () => { noise(0.9, 0.3, 'lowpass', 160, 50); tone('sine', 55, 40, 0.8, 0.15); },
      punch: () => { noise(0.12, 0.3, 'lowpass', 1200, 200); tone('sine', 140, 60, 0.15, 0.2); },
      boing: () => { tone('sine', 200, 640, 0.32, 0.16); tone('sine', 300, 900, 0.22, 0.05, 0.03); },
      ding: () => tone('sine', 1320, 1320, 0.35, 0.08),
      steam: () => noise(0.9, 0.12, 'highpass', 2500, 1200),
      confetti: () => { for (let i = 0; i < 8; i++) tone('triangle', 700 + Math.random() * 900, 0, 0.06, 0.04, i * 0.03); noise(0.25, 0.15, 'highpass', 2000); },
    };
    return {
      play(name) { try { if (S[name]) S[name](); } catch (e) {} },
      unlock() { ctx(); },
      on: () => on,
      toggle() { on = !on; try { localStorage.setItem('plato.pf.sound', on ? 'on' : 'off'); } catch (e) {} if (!on && ac) ac.suspend().catch(() => {}); if (on && ac) ac.resume().catch(() => {}); return on; },
    };
  })();

  /* ---------- partículas: puntos suaves (polvo, agua, humo, chispas) y confeti/pétalos en 3D ---------- */
  PF.makeFx = (scene) => {
    const VS = 'attribute float size; attribute float alpha; attribute vec3 pcolor; uniform float scale; varying vec3 vC; varying float vA;\n'
      + 'void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }';
    const FS = 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.12, r) * vA; gl_FragColor = vec4(vC, a); }';
    function system(N, additive) {
      const g = new T.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
      g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('pcolor', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('size', new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage)); g.setAttribute('alpha', new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage));
      const m = new T.ShaderMaterial({ uniforms: { scale: { value: 400 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending });
      const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5; scene.add(pts);
      const S = { N, pos, col, size, alpha, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), s0: new Float32Array(N), s1: new Float32Array(N), grav: new Float32Array(N), drag: new Float32Array(N), a0: new Float32Array(N), next: 0, pts, m, g };
      return S;
    }
    const soft = system(2600, false), glow = system(1600, true);
    const tmpC = new T.Color();
    function emit(S, n, f) {
      for (let k = 0; k < n; k++) {
        const i = S.next; S.next = (S.next + 1) % S.N;
        const p = f(k) || {}; const at = p.at || [0, 0, 0], v = p.v || [0, 0, 0];
        S.pos[i * 3] = at[0]; S.pos[i * 3 + 1] = at[1]; S.pos[i * 3 + 2] = at[2]; S.vel[i * 3] = v[0]; S.vel[i * 3 + 1] = v[1]; S.vel[i * 3 + 2] = v[2];
        tmpC.set(p.c || '#ffffff'); S.col[i * 3] = tmpC.r; S.col[i * 3 + 1] = tmpC.g; S.col[i * 3 + 2] = tmpC.b;
        S.max[i] = S.life[i] = p.life || 1; S.s0[i] = p.s0 != null ? p.s0 : 0.4; S.s1[i] = p.s1 != null ? p.s1 : S.s0[i]; S.grav[i] = p.g || 0; S.drag[i] = p.drag || 0; S.a0[i] = p.a != null ? p.a : 1;
      }
      S.live = 2;
    }
    function step(S, dt) {
      if (!S.live) return; // nada vivo: ni se recorre ni se sube a la GPU
      let live = 0;
      for (let i = 0; i < S.N; i++) {
        if (S.life[i] <= 0) { if (S.alpha[i] !== 0) { S.alpha[i] = 0; S.size[i] = 0; } continue; }
        S.life[i] -= dt; const k = 1 - S.life[i] / S.max[i], dr = Math.exp(-S.drag[i] * dt);
        S.vel[i * 3] *= dr; S.vel[i * 3 + 1] = S.vel[i * 3 + 1] * dr + S.grav[i] * dt; S.vel[i * 3 + 2] *= dr;
        S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
        S.size[i] = S.s0[i] + (S.s1[i] - S.s0[i]) * k; S.alpha[i] = S.a0[i] * (k < 0.12 ? k / 0.12 : 1 - smooth((k - 0.12) / 0.88)); live++;
      }
      S.live = live > 0 ? 2 : S.live - 1; // un paso más para dejar a cero los que acaban de morir
      const g = S.g; g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    }
    // confeti y pétalos: cuadraditos que giran y planean
    const CN = 1400, cgeo = new T.PlaneGeometry(0.13, 0.2), cmat = new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.45, metalness: 0.15 });
    const conf = new T.InstancedMesh(cgeo, cmat, CN); conf.frustumCulled = false; conf.castShadow = false; scene.add(conf);
    const C = { pos: new Float32Array(CN * 3), vel: new Float32Array(CN * 3), rot: new Float32Array(CN * 3), spin: new Float32Array(CN * 3), life: new Float32Array(CN), sc: new Float32Array(CN), flut: new Float32Array(CN), gy: new Float32Array(CN), next: 0 };
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CN; i++) { conf.setMatrixAt(i, zero); conf.setColorAt(i, PF.col('#ffffff')); }
    function confetti(n, f) {
      for (let k = 0; k < n; k++) {
        const i = C.next; C.next = (C.next + 1) % CN; const p = f(k);
        C.pos.set(p.at, i * 3); C.vel.set(p.v, i * 3); C.rot.set([R() * 6, R() * 6, R() * 6], i * 3); C.spin.set([rand(-8, 8), rand(-8, 8), rand(-8, 8)], i * 3);
        C.life[i] = p.life || 5; C.sc[i] = p.scale || 1; C.flut[i] = p.flutter != null ? p.flutter : 1; conf.setColorAt(i, PF.col(p.c));
        const g = PF.groundAt ? PF.groundAt(p.at[0], p.at[2], p.at[1] + 0.5) : 0; C.gy[i] = g > -50 ? g + 0.03 : -60; // el suelo se mira una vez, al nacer
      }
      conf.instanceColor.needsUpdate = true;
    }
    const e3 = new T.Euler(), q4 = new T.Quaternion(), p3 = new T.Vector3(), s3 = new T.Vector3(), m4 = new T.Matrix4();
    function stepConf(dt) {
      let any = false;
      for (let i = 0; i < CN; i++) {
        if (C.life[i] <= 0) continue; any = true; C.life[i] -= dt;
        if (C.life[i] <= 0) { conf.setMatrixAt(i, zero); continue; }
        const j = i * 3, fl = C.flut[i];
        C.vel[j] *= Math.exp(-1.2 * dt); C.vel[j + 2] *= Math.exp(-1.2 * dt); C.vel[j + 1] = Math.max(C.vel[j + 1] - 5.5 * dt, -1.6 - 0.6 * fl);
        C.pos[j] += (C.vel[j] + Math.sin(PF.time * 3 + i) * 0.6 * fl) * dt; C.pos[j + 1] += C.vel[j + 1] * dt; C.pos[j + 2] += (C.vel[j + 2] + Math.cos(PF.time * 2.6 + i * 1.3) * 0.6 * fl) * dt;
        if (C.pos[j + 1] < C.gy[i]) { C.pos[j + 1] = C.gy[i]; C.vel[j] = C.vel[j + 1] = C.vel[j + 2] = 0; C.spin[j] *= 0.9; C.spin[j + 1] *= 0.9; C.spin[j + 2] *= 0.9; }
        C.rot[j] += C.spin[j] * dt; C.rot[j + 1] += C.spin[j + 1] * dt; C.rot[j + 2] += C.spin[j + 2] * dt;
        const s = C.sc[i] * Math.min(1, C.life[i] / 0.6);
        e3.set(C.rot[j], C.rot[j + 1], C.rot[j + 2]); q4.setFromEuler(e3); p3.set(C.pos[j], C.pos[j + 1], C.pos[j + 2]); s3.set(s, s, s); m4.compose(p3, q4, s3); conf.setMatrixAt(i, m4);
      }
      if (any) conf.instanceMatrix.needsUpdate = true;
    }
    const api = {
      emit: (n, f, additive) => emit(additive ? glow : soft, n, f),
      confetti,
      update(dt, scaleK) { soft.m.uniforms.scale.value = glow.m.uniforms.scale.value = scaleK; step(soft, dt); step(glow, dt); stepConf(dt); },
      // efectos ya preparados
      dust: (x, y, z, n) => emit(soft, n || 8, () => ({ at: [x + rand(-0.3, 0.3), y + 0.05, z + rand(-0.3, 0.3)], v: [rand(-1.4, 1.4), rand(0.3, 1.2), rand(-1.4, 1.4)], c: '#e9dcc2', life: rand(0.4, 0.8), s0: 0.25, s1: 0.7, drag: 3, a: 0.75 })),
      poof: (x, y, z, c, n) => { emit(soft, n || 26, () => { const a = R() * 6.283, u = rand(-1, 1), s = Math.sqrt(1 - u * u), sp = rand(2, 5); return { at: [x, y, z], v: [Math.cos(a) * s * sp, u * sp + 1, Math.sin(a) * s * sp], c: c || '#ffffff', life: rand(0.5, 1.0), s0: 0.6, s1: 1.6, drag: 4, a: 0.9 }; }); emit(glow, 14, () => ({ at: [x + rand(-0.5, 0.5), y + rand(-0.5, 0.5), z + rand(-0.5, 0.5)], v: [rand(-2, 2), rand(1, 4), rand(-2, 2)], c: '#fff6c2', life: rand(0.4, 0.9), s0: 0.22, s1: 0.05, g: -3, drag: 1.5 })); },
      splash: (x, y, z, n) => { emit(soft, n || 40, () => { const a = R() * 6.283, sp = rand(1.5, 4.5); return { at: [x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3], v: [Math.cos(a) * sp, rand(3, 7), Math.sin(a) * sp], c: R() < 0.5 ? '#c9f1ff' : '#7fd3ff', life: rand(0.6, 1.1), s0: 0.22, s1: 0.12, g: -16, drag: 0.6, a: 0.9 }; }); },
      sparks: (x, y, z, n) => emit(glow, n || 30, () => { const a = R() * 6.283, u = rand(-0.2, 1), sp = rand(3, 9); return { at: [x, y, z], v: [Math.cos(a) * sp, u * sp, Math.sin(a) * sp], c: R() < 0.5 ? '#ffb347' : '#ffe08a', life: rand(0.4, 1.0), s0: 0.3, s1: 0.05, g: -12, drag: 1.2 }; }),
      smoke: (x, y, z, n, c) => emit(soft, n || 10, () => ({ at: [x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4)], v: [rand(-0.4, 0.4), rand(1.2, 2.4), rand(-0.4, 0.4)], c: c || '#5b5550', life: rand(1.4, 2.6), s0: 0.6, s1: 2.4, drag: 0.6, a: 0.45 })),
      steam: (x, y, z, n) => emit(soft, n || 14, () => ({ at: [x + rand(-0.6, 0.6), y + 0.2, z + rand(-0.6, 0.6)], v: [rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3)], c: '#f4f7fa', life: rand(1.0, 2.0), s0: 0.5, s1: 2.2, drag: 0.8, a: 0.6 })),
      embers: (x, y, z, n) => emit(glow, n || 3, () => ({ at: [x + rand(-0.5, 0.5), y + rand(0, 0.6), z + rand(-0.5, 0.5)], v: [rand(-0.5, 0.5), rand(1.5, 3.5), rand(-0.5, 0.5)], c: R() < 0.6 ? '#ff9a3c' : '#ffd36b', life: rand(0.6, 1.4), s0: 0.16, s1: 0.04, drag: 0.4 })),
      magic: (x, y, z, n, c) => emit(glow, n || 30, () => { const a = R() * 6.283, r = rand(0.2, 1.2); return { at: [x + Math.cos(a) * r, y + rand(0, 2), z + Math.sin(a) * r], v: [Math.cos(a) * 0.6, rand(0.5, 2), Math.sin(a) * 0.6], c: c || (R() < 0.5 ? '#ffe680' : '#b9a2ff'), life: rand(0.6, 1.3), s0: 0.16, s1: 0.03, drag: 1, a: 0.85 }; }),
      petals: (x, y, z, n) => confetti(n || 24, () => ({ at: [x + rand(-0.6, 0.6), y + rand(0, 0.8), z + rand(-0.6, 0.6)], v: [rand(-2.5, 2.5), rand(2, 5), rand(-2.5, 2.5)], c: ['#ff8fc8', '#ffd1e8', '#ffffff', '#ffb3d9', '#ffe066'][Math.floor(R() * 5)], life: rand(3, 6), scale: 0.8, flutter: 1.4 })),
    };
    return api;
  };
})();
