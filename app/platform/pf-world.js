/* Plataformas 3D · mundo: render, cielo, hora y tiempo (lluvia, nieve, niebla, tormenta), luces y el nivel lineal
   (prado → paso del Gruñón → muro → cañón de Refunfuño → arena del Rey Volcán → meta), con sus colisiones. */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U, G = PF.G, mk = PF.mk;

  /* ---------- eventos ---------- */
  const subs = {};
  PF.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  PF.emit = (ev, d) => { for (const fn of subs[ev] || []) { try { fn(d); } catch (e) { console.warn(ev, e); } } };

  /* ---------- colisiones: cajas (AABB) y cilindros verticales ---------- */
  PF.solids = []; PF.cyls = [];
  PF.addBox = (x0, y0, z0, x1, y1, z1, tag, ent) => { const c = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], tag: tag || 'solid', ent: ent || null, on: true }; PF.solids.push(c); return c; };
  PF.addCyl = (x, z, r, y0, y1, tag, ent) => { const c = { x, z, r, y0, y1, tag: tag || 'solid', ent: ent || null, on: true }; PF.cyls.push(c); return c; };
  PF.dropCollider = (c) => { if (!c) return; c.on = false; let i = PF.solids.indexOf(c); if (i >= 0) PF.solids.splice(i, 1); i = PF.cyls.indexOf(c); if (i >= 0) PF.cyls.splice(i, 1); };
  PF.groundAt = (x, z, below) => {
    let best = -Infinity; const lim = below == null ? Infinity : below;
    for (const c of PF.solids) if (c.on && x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2] && c.max[1] <= lim + 0.01 && c.max[1] > best) best = c.max[1];
    for (const c of PF.cyls) if (c.on && c.top && Math.hypot(x - c.x, z - c.z) <= c.r && c.y1 <= lim + 0.01 && c.y1 > best) best = c.y1;
    return best;
  };

  /* ---------- render ---------- */
  const W = (PF.world = {});
  W.init = (canvas) => {
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setSize(innerWidth, innerHeight, false);
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1400);
    scene.fog = new T.Fog(0xc9e9ff, 60, 420);
    Object.assign(PF, { renderer: r, scene, camera: cam });
    PF.fx = PF.makeFx(scene);
    buildSky(); buildLights(); buildWeather();
    window.addEventListener('resize', () => { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  };

  /* ---------- cielo con degradado, sol, estrellas y nubes ---------- */
  let sky, skyU, clouds = [], cloudMat, sea, seaMat;
  function buildSky() {
    skyU = { top: { value: new T.Color('#3d8eea') }, horizon: { value: new T.Color('#bfe6ff') }, bottom: { value: new T.Color('#d8f0ff') }, sunDir: { value: new T.Vector3(0.4, 0.7, 0.3).normalize() }, sunCol: { value: new T.Color('#fff4d6') }, stars: { value: 0 }, time: { value: 0 }, moon: { value: 0 } };
    const m = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 top, horizon, bottom, sunDir, sunCol; uniform float stars, time, moon; varying vec3 vP;\n'
        + 'float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n'
        + 'void main(){ vec3 d = normalize(vP); float h = d.y; vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));\n'
        + ' float sd = max(dot(d, sunDir), 0.0); col += sunCol * (pow(sd, 1200.0) * 4.0 + pow(sd, 14.0) * 0.28 + pow(sd, 3.0) * 0.08);\n'
        + ' vec3 md = normalize(vec3(-sunDir.x, abs(sunDir.y) + 0.35, -sunDir.z)); float mm = max(dot(d, md), 0.0); col += moon * (vec3(0.95, 0.97, 1.0) * smoothstep(0.9993, 0.9996, mm) + vec3(0.35, 0.45, 0.7) * pow(mm, 40.0) * 0.4);\n'
        + ' if (stars > 0.0 && h > 0.0) { vec3 q = floor(d * 220.0); float s = hash(q); float tw = 0.55 + 0.45 * sin(time * 2.0 + s * 60.0); col += vec3(step(0.9972, s)) * stars * tw * smoothstep(0.0, 0.25, h); }\n'
        + ' gl_FragColor = vec4(col, 1.0); }',
    });
    sky = new T.Mesh(new T.SphereGeometry(900, 48, 24), m); sky.frustumCulled = false; sky.renderOrder = -10; PF.scene.add(sky);
    // nubes de algodón
    cloudMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35, flatShading: false });
    const rr = U.rng(9);
    for (let i = 0; i < 18; i++) {
      const parts = []; const n = 4 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) parts.push({ geo: G.sph(3 + rr() * 3, 14, 10), m: PF.mtx((k - n / 2) * 3.4 + rr() * 2, rr() * 2, rr() * 3, 0, 0, 0, 1, 0.7, 1) });
      const c = new T.Mesh(PF.merge(parts), cloudMat); const a = rr() * Math.PI * 2, d = 120 + rr() * 220;
      c.position.set(Math.cos(a) * d, 35 + rr() * 45, 110 + Math.sin(a) * d); c.scale.setScalar(1 + rr()); c.userData.v = 0.6 + rr() * 1.2; PF.scene.add(c); clouds.push(c);
    }
    // mar de nubes bajo las islas
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#d9ecfa'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) { const x = rr() * 256, y = rr() * 256, r = 10 + rr() * 34; for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); } }
    const tx = new T.CanvasTexture(cv); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(14, 14); tx.encoding = T.sRGBEncoding;
    seaMat = new T.MeshBasicMaterial({ map: tx, color: 0xffffff }); sea = new T.Mesh(new T.PlaneGeometry(2400, 2400), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -26, 110); PF.scene.add(sea);
  }

  /* ---------- luces ---------- */
  let sun, hemi, amb, pmrem, envScene, envSky;
  function buildLights() {
    hemi = new T.HemisphereLight(0xbfe3ff, 0x6a8f4a, 0.9); PF.scene.add(hemi);
    amb = new T.AmbientLight(0xffffff, 0.08); PF.scene.add(amb);
    sun = new T.DirectionalLight(0xfff4e0, 2.4); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; PF.scene.add(sun); PF.scene.add(sun.target);
    PF.sun = sun; PF.hemi = hemi;
    pmrem = new T.PMREMGenerator(PF.renderer);
    envScene = new T.Scene(); envSky = new T.Mesh(new T.SphereGeometry(10, 32, 16), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true })); envScene.add(envSky);
  }
  function rebuildEnv() {
    const geo = envSky.geometry, P = geo.attributes.position, col = new Float32Array(P.count * 3), c = new T.Color();
    const top = skyU.top.value.clone().convertSRGBToLinear(), hor = skyU.horizon.value.clone().convertSRGBToLinear(), bot = PF.col('#5d7d4a').clone().lerp(hor, 0.35);
    for (let i = 0; i < P.count; i++) { const h = P.getY(i) / 10; if (h > 0) c.copy(hor).lerp(top, Math.pow(h, 0.5)); else c.copy(hor).lerp(bot, Math.min(1, -h * 3)); c.multiplyScalar(LIGHT.env); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const rt = pmrem.fromScene(envScene, 0.04); if (W.envRT) W.envRT.dispose(); W.envRT = rt; PF.scene.environment = rt.texture;
  }

  /* ---------- hora y tiempo ---------- */
  // dirección de luz: intensidades globales (el reflejo del cielo, «env», se atenúa para que nada quede quemado)
  const LIGHT = (PF.LIGHT = { sun: 0.62, hemi: 0.6, env: 0.42, exposure: 1.0, nightExposure: 1.15 });
  const KEYS = [ // hora → paleta (colores del cielo en sRGB) e intensidades
    { h: 0, top: '#0a1430', hor: '#1f2b52', bot: '#0b1022', fog: '#1b2546', sunI: 0, hemiI: 0.42, sky: '#3a4a80', gnd: '#191c28', sunC: '#9fb7ff', stars: 1, moon: 1 },
    { h: 5.2, top: '#16224a', hor: '#3a3f6e', bot: '#151a33', fog: '#2c3360', sunI: 0, hemiI: 0.48, sky: '#4a5a90', gnd: '#202233', sunC: '#9fb7ff', stars: 0.7, moon: 0.8 },
    { h: 6.6, top: '#6b9ce0', hor: '#ffc39b', bot: '#e8b49a', fog: '#f0c4a8', sunI: 1.5, hemiI: 0.75, sky: '#ffd6b8', gnd: '#6a6a4a', sunC: '#ffc58f', stars: 0, moon: 0 },
    { h: 9, top: '#3d8eea', hor: '#bfe6ff', bot: '#d8f0ff', fog: '#c9e9ff', sunI: 2.5, hemiI: 0.95, sky: '#bfe3ff', gnd: '#6a8f4a', sunC: '#fff4e0', stars: 0, moon: 0 },
    { h: 16.5, top: '#3a8ae6', hor: '#c6e6ff', bot: '#d8f0ff', fog: '#cbe8ff', sunI: 2.5, hemiI: 0.95, sky: '#bfe3ff', gnd: '#6a8f4a', sunC: '#fff1d8', stars: 0, moon: 0 },
    { h: 18.9, top: '#43448f', hor: '#ff9255', bot: '#f2a07a', fog: '#f0a27c', sunI: 1.7, hemiI: 0.7, sky: '#ffb38a', gnd: '#6a5040', sunC: '#ffa860', stars: 0.1, moon: 0.2 },
    { h: 20.3, top: '#1b2150', hor: '#7a4a78', bot: '#2a2240', fog: '#4a3a66', sunI: 0.25, hemiI: 0.5, sky: '#6a5a9a', gnd: '#2a2433', sunC: '#ff8a6a', stars: 0.6, moon: 0.7 },
    { h: 24, top: '#0a1430', hor: '#1f2b52', bot: '#0b1022', fog: '#1b2546', sunI: 0, hemiI: 0.42, sky: '#3a4a80', gnd: '#191c28', sunC: '#9fb7ff', stars: 1, moon: 1 },
  ];
  const WX = { // tiempo → cuánto se agrisa el cielo, niebla y luz
    clear: { gray: 0, fogK: 1, sunK: 1, clouds: 1 }, cloudy: { gray: 0.5, fogK: 0.75, sunK: 0.55, clouds: 1.6 },
    rain: { gray: 0.72, fogK: 0.45, sunK: 0.28, clouds: 2 }, storm: { gray: 0.86, fogK: 0.35, sunK: 0.15, clouds: 2.2 },
    snow: { gray: 0.55, fogK: 0.5, sunK: 0.6, clouds: 1.6, white: 1 }, fog: { gray: 0.45, fogK: 0.16, sunK: 0.5, clouds: 1 },
  };
  const env = (PF.env = { time: 13, weather: 'clear', target: 13, tw: 'clear', mix: 1, snowK: 0, wet: 0 });
  const cA = new T.Color(), cB = new T.Color(), GRAY = new T.Color('#8f99a6');
  function palette(h) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = U.smooth((h - a.h) / Math.max(0.001, b.h - a.h)), out = {};
    for (const key of ['top', 'hor', 'bot', 'fog', 'sky', 'gnd', 'sunC']) out[key] = cA.set(a[key]).clone().lerp(cB.set(b[key]), k);
    for (const key of ['sunI', 'hemiI', 'stars', 'moon']) out[key] = U.lerp(a[key], b[key], k);
    return out;
  }
  let envDirty = 0, lastEnvKey = '', lastEnvT = -9;
  PF.setTime = (h, instant) => { env.target = ((h % 24) + 24) % 24; if (instant) env.time = env.target; envDirty = 2; PF.emit('time', env.target); };
  PF.setWeather = (w, instant) => { if (!WX[w]) return; const prev = env.weather; env.weather = w; if (instant) env.mix = 1; else env.mix = 0; envDirty = 2; PF.emit('weather', { w, prev }); };
  function updateEnv(dt) {
    // la hora avanza hacia el objetivo por el camino corto
    let d = env.target - env.time; if (d > 12) d -= 24; if (d < -12) d += 24;
    if (Math.abs(d) > 0.01) { env.time = (env.time + d * Math.min(1, dt * 1.4) + 24) % 24; envDirty = 1; }
    env.mix = Math.min(1, env.mix + dt * 0.8);
    const P = palette(env.time), w = WX[env.weather] || WX.clear;
    const gray = w.gray * U.smooth(env.mix), dark = env.time < 6 || env.time > 20 ? 0.4 : 1;
    const g2 = GRAY.clone().multiplyScalar(dark);
    skyU.top.value.copy(P.top).lerp(g2, gray); skyU.horizon.value.copy(P.hor).lerp(g2, gray * 0.9); skyU.bottom.value.copy(P.bot).lerp(g2, gray);
    skyU.sunCol.value.copy(P.sunC).multiplyScalar(1 - gray * 0.9); skyU.stars.value = P.stars * (1 - gray); skyU.moon.value = P.moon * (1 - gray);
    const fogC = P.fog.clone().lerp(g2, gray); PF.scene.fog.color.copy(fogC);
    const fk = U.lerp(1, w.fogK, U.smooth(env.mix)); PF.scene.fog.near = 40 * fk; PF.scene.fog.far = 430 * fk;
    // sol: arco de este a oeste, de lado para que las sombras crucen el camino
    const el = Math.sin(((env.time - 6) / 12) * Math.PI), az = ((env.time - 6) / 12) * Math.PI;
    const sd = new T.Vector3(Math.cos(az) * 0.8, Math.max(0.08, el), 0.45).normalize();
    const night = env.time < 5.8 || env.time > 20.2;
    if (night) sd.set(-0.4, 0.75, 0.35).normalize();
    skyU.sunDir.value.copy(night ? new T.Vector3(sd.x, -0.2, sd.z).normalize() : sd);
    sun.color.copy(night ? PF.col('#9fb7ff') : P.sunC.clone().convertSRGBToLinear()); sun.intensity = (night ? 0.45 : P.sunI) * LIGHT.sun * U.lerp(1, w.sunK, U.smooth(env.mix));
    hemi.color.copy(P.sky.clone().convertSRGBToLinear()); hemi.groundColor.copy(P.gnd.clone().convertSRGBToLinear()); hemi.intensity = P.hemiI * LIGHT.hemi * (1 - gray * 0.35);
    PF.sunDir = sd;
    // nubes y mar de nubes con el color de la hora
    cloudMat.color.copy(P.hor.clone().convertSRGBToLinear().lerp(PF.col('#ffffff'), 0.6)).lerp(g2.clone().convertSRGBToLinear(), gray * 0.8); cloudMat.emissive.copy(cloudMat.color); cloudMat.emissiveIntensity = night ? 0.05 : 0.3;
    seaMat.color.copy(P.hor).lerp(PF.col('#ffffff'), 0.25).lerp(g2, gray * 0.6);
    // nieve que cubre la hierba, suelo mojado con la lluvia
    env.snowK = U.damp(env.snowK, env.weather === 'snow' ? 1 : 0, 0.35, dt);
    env.wet = U.damp(env.wet, env.weather === 'rain' || env.weather === 'storm' ? 1 : 0, 0.8, dt);
    if (W.grassMat) { W.grassMat.color.copy(PF.col('#5fcf55')).lerp(PF.col('#f4f8ff'), env.snowK * 0.85); W.grassMat.roughness = U.lerp(0.85, 0.35, env.wet); }
    if (W.tuftMat) W.tuftMat.color.copy(PF.col('#ffffff')).lerp(PF.col('#f4f8ff'), env.snowK * 0.7);
    for (const m of W.lampMats || []) m.emissiveIntensity = night || gray > 0.6 ? 2.2 : 0.4;
    for (const l of W.lampLights || []) l.intensity = night || gray > 0.6 ? 1.4 : 0;
    // el reflejo del cielo (PMREM) se rehace como mucho dos veces por segundo mientras cambian la hora o el tiempo
    const key = Math.round(env.time * 4) + '|' + env.weather + '|' + Math.round(env.mix * 4);
    if (key !== lastEnvKey && PF.time - lastEnvT > 0.5) { lastEnvKey = key; lastEnvT = PF.time; rebuildEnv(); envDirty = 0; }
    PF.renderer.toneMappingExposure = night ? LIGHT.nightExposure : LIGHT.exposure;
  }

  /* ---------- lluvia, nieve y relámpagos (alrededor de la cámara) ---------- */
  let rain, snow, rainU, snowU, flashT = 0, nextBolt = 0;
  function buildWeather() {
    const N = 4200, pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const x = Math.random() * 60, y = Math.random() * 34, z = Math.random() * 60; pos.set([x, y, z, x, y, z], i * 6); seed[i * 2] = 0; seed[i * 2 + 1] = 1; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); const end = new Float32Array(N * 2); for (let i = 0; i < N; i++) { end[i * 2] = 0; end[i * 2 + 1] = 1; } g.setAttribute('tail', new T.BufferAttribute(end, 1));
    rainU = { time: { value: 0 }, origin: { value: new T.Vector3() }, alpha: { value: 0 } };
    rain = new T.LineSegments(g, new T.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false,
      vertexShader: 'attribute float tail; uniform float time; uniform vec3 origin; varying float vT; void main(){ vec3 p = position; p.y = mod(p.y - time * 22.0, 34.0); p.x = mod(p.x - origin.x + time * 1.5, 60.0) - 30.0 + origin.x; p.z = mod(p.z - origin.z, 60.0) - 30.0 + origin.z; p.y += origin.y - 10.0 + tail * 0.75; p.x -= tail * 0.05; vT = tail; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform float alpha; varying float vT; void main(){ gl_FragColor = vec4(0.82, 0.9, 1.0, alpha * (0.25 + vT * 0.45)); }' }));
    rain.frustumCulled = false; rain.visible = false; PF.scene.add(rain);
    const M = 2600, sp = new Float32Array(M * 3), ss = new Float32Array(M); for (let i = 0; i < M; i++) { sp.set([Math.random() * 60, Math.random() * 30, Math.random() * 60], i * 3); ss[i] = Math.random(); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('seed', new T.BufferAttribute(ss, 1));
    snowU = { time: { value: 0 }, origin: { value: new T.Vector3() }, alpha: { value: 0 }, scale: { value: 400 } };
    snow = new T.Points(sg, new T.ShaderMaterial({ uniforms: snowU, transparent: true, depthWrite: false,
      vertexShader: 'attribute float seed; uniform float time, scale; uniform vec3 origin; void main(){ vec3 p = position; p.y = mod(p.y - time * (1.2 + seed), 30.0); p.x = mod(p.x - origin.x + sin(time * 0.8 + seed * 20.0) * 1.2, 60.0) - 30.0 + origin.x; p.z = mod(p.z - origin.z + cos(time * 0.6 + seed * 13.0), 60.0) - 30.0 + origin.z; p.y += origin.y - 8.0; vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = (0.12 + seed * 0.12) * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float alpha; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * smoothstep(0.5, 0.1, r)); }' }));
    snow.frustumCulled = false; snow.visible = false; PF.scene.add(snow);
  }
  function updateWeather(dt) {
    const w = env.weather, cp = PF.camera.position, sc = PF.renderer.domElement.height / 2 / Math.tan((PF.camera.fov * Math.PI) / 360);
    const wantRain = w === 'rain' || w === 'storm' ? 1 : 0, wantSnow = w === 'snow' ? 1 : 0;
    rainU.alpha.value = U.damp(rainU.alpha.value, wantRain * 0.75, 1.5, dt); snowU.alpha.value = U.damp(snowU.alpha.value, wantSnow * 0.95, 1.2, dt);
    rain.visible = rainU.alpha.value > 0.01; snow.visible = snowU.alpha.value > 0.01;
    rainU.time.value = snowU.time.value = PF.time; rainU.origin.value.copy(cp); snowU.origin.value.copy(cp); snowU.scale.value = sc;
    if (w === 'storm') {
      if (PF.time > nextBolt) { nextBolt = PF.time + 4 + Math.random() * 6; flashT = 0.35; PF.after(0.4 + Math.random() * 0.8, () => PF.sfx.play('thunder')); }
    }
    if (flashT > 0) { flashT -= dt; const k = Math.max(0, flashT / 0.35) * (Math.random() < 0.6 ? 1 : 0.3); amb.intensity = 0.08 + k * 2.4; const f = document.getElementById('flash'); if (f) f.style.opacity = String(k * 0.25); }
    else if (amb.intensity !== 0.08) { amb.intensity = 0.08; const f = document.getElementById('flash'); if (f) f.style.opacity = '0'; }
  }

  /* ---------- geometría del nivel: piezas estáticas fusionadas por material ---------- */
  const batches = {};
  function triUV(geo, tile) { // UV en coordenadas del mundo (textura continua entre piezas)
    const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i)); let u, v; if (ny >= nx && ny >= nz) { u = P.getX(i); v = P.getZ(i); } else if (nx >= nz) { u = P.getZ(i); v = P.getY(i); } else { u = P.getX(i); v = P.getY(i); } uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile; }
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); return geo;
  }
  function add(matKey, geo, m, tile, color) { const g = (geo.index ? geo.toNonIndexed() : geo); if (m) g.applyMatrix4(m); triUV(g, tile || 4); (batches[matKey] = batches[matKey] || []).push({ geo: g, c: color || '#ffffff' }); }
  function flush() {
    const MATS = {
      grass: (W.grassMat = new T.MeshStandardMaterial({ color: PF.col('#5fcf55'), map: PF.tex('grass'), roughness: 0.85 })),
      dirt: new T.MeshStandardMaterial({ color: PF.col('#b9824f'), map: PF.tex('dirt'), roughness: 0.95 }),
      under: new T.MeshStandardMaterial({ color: PF.col('#8a5a3a'), map: PF.tex('rock'), roughness: 1, flatShading: true }),
      stone: new T.MeshStandardMaterial({ color: PF.col('#c2bdd3'), map: PF.tex('stone'), roughness: 0.85 }),
      rock: new T.MeshStandardMaterial({ color: PF.col('#a99f94'), map: PF.tex('rock'), roughness: 0.95, flatShading: true }),
      wood: new T.MeshStandardMaterial({ color: PF.col('#c58b52'), map: PF.tex('wood'), roughness: 0.8 }),
      path: new T.MeshStandardMaterial({ color: PF.col('#efd9ae'), map: PF.tex('path'), roughness: 0.95 }),
      castle: new T.MeshStandardMaterial({ color: PF.col('#e4d6ee'), map: PF.tex('stone'), roughness: 0.85 }),
      roof: new T.MeshStandardMaterial({ color: PF.col('#4f6fd8'), roughness: 0.6 }),
      metal: new T.MeshStandardMaterial({ color: PF.col('#5a6270'), roughness: 0.4, metalness: 0.7 }),
      gold: new T.MeshStandardMaterial({ color: PF.col('#f6c945'), roughness: 0.25, metalness: 0.85 }),
      vc: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    };
    W.mats = MATS;
    for (const k of Object.keys(batches)) {
      const list = batches[k]; if (!list.length) continue;
      const mesh = new T.Mesh(PF.merge(list.map((p) => ({ geo: p.geo, c: p.c }))), MATS[k]); mesh.castShadow = k !== 'path' && k !== 'under'; mesh.receiveShadow = true; PF.scene.add(mesh);
      batches[k] = [];
    }
  }
  const BX = (w, h, d) => new T.BoxGeometry(w, h, d);
  const RB = (w, h, d, r) => PF.models.roundedBox(w, h, d, r, 4);
  // una isla: césped arriba, tierra a los lados y roca colgando debajo
  function island(x0, x1, z0, z1, opt) {
    opt = opt || {}; const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = opt.y || 0;
    if (opt.stone) add('stone', RB(w, 0.6, d, 0.1), PF.mtx(cx, top - 0.3, cz), 3);
    else add('grass', RB(w + 0.1, 0.5, d + 0.1, 0.18), PF.mtx(cx, top - 0.22, cz), 6);
    add('dirt', BX(w - 0.1, 3.4, d - 0.1), PF.mtx(cx, top - 2.1, cz), 4);
    if (!opt.noUnder) { const r = U.rng(Math.round(x0 * 7 + z0 * 13)); for (let i = 0; i < Math.max(2, Math.round((w * d) / 120)); i++) { const ux = x0 + 1.5 + r() * (w - 3), uz = z0 + 1.5 + r() * (d - 3), s = Math.min(w, d) * (0.25 + r() * 0.2); add('under', new T.ConeGeometry(s, s * 1.6 + r() * 3, 7), PF.mtx(ux, top - 3.8 - s * 0.8, uz, Math.PI, r() * 6, 0), 5); } }
    PF.addBox(x0, top - 4, z0, x1, top, z1, 'ground');
  }
  function wallBox(key, x0, y0, z0, x1, y1, z1, tile, tag) { add(key, BX(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), PF.mtx((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), tile || 3); return PF.addBox(x0, y0, z0, x1, y1, z1, tag || 'solid'); }
  W.signs = []; // los textos de los carteles (las pruebas comprueban el idioma)
  function sign(text, x, z, ry, sub) {
    W.signs.push(text, sub || '');
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#7a4a26'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#d9a066'; g.fillRect(10, 10, 492, 236);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; for (let y = 50; y < 246; y += 48) { g.beginPath(); g.moveTo(10, y); g.lineTo(502, y); g.stroke(); }
    g.fillStyle = '#3a2210'; g.textAlign = 'center'; g.font = '700 60px Jost, Futura, sans-serif'; g.fillText(text, 256, sub ? 118 : 148, 470);
    if (sub) { g.font = '500 34px Jost, Futura, sans-serif'; g.fillStyle = '#5a3418'; g.fillText(sub, 256, 186, 470); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const gr = PF.grp(x, 0, z); gr.rotation.y = ry || 0;
    gr.add(mk(G.cyl(0.08, 0.1, 1.6, 8), '#7a4a26', -1.0, 0.8, 0)); gr.add(mk(G.cyl(0.08, 0.1, 1.6, 8), '#7a4a26', 1.0, 0.8, 0));
    const board = new T.Mesh(new T.BoxGeometry(2.6, 1.3, 0.1), [PF.mat('#7a4a26'), PF.mat('#7a4a26'), PF.mat('#7a4a26'), PF.mat('#7a4a26'), PF.mat('#a86f3d'), new T.MeshStandardMaterial({ map: t, roughness: 0.8 })]);
    board.position.set(0, 1.75, 0); board.castShadow = true; gr.add(board); PF.scene.add(gr);
    return gr;
  }

  /* ---------- decoración instanciada: árboles, flores, piedras, matas ---------- */
  function instanced(geo, mat, list, shadow) {
    const im = new T.InstancedMesh(geo, mat, list.length); const m = new T.Matrix4();
    list.forEach((it, i) => { im.setMatrixAt(i, PF.mtx(it[0], it[1], it[2], 0, it[3] || 0, 0, it[4] || 1)); });
    im.castShadow = shadow !== false; im.receiveShadow = true; PF.scene.add(im); return im;
  }

  /* ---------- el nivel ---------- */
  const L = (PF.level = {
    sections: [
      { z: -99, name: PF.L('Prado de salida', 'Starting Meadow'), n: 1 }, { z: 38, name: PF.L('El paso del Gruñón', 'Grumble’s Pass'), n: 2 }, { z: 64, name: PF.L('El muro', 'The Wall'), n: 3 },
      { z: 104, name: PF.L('El cañón', 'The Canyon'), n: 4 }, { z: 150, name: PF.L('La arena del Rey Volcán', 'Volcano King’s Arena'), n: 5 }, { z: 206, name: PF.L('La meta', 'Goal'), n: 6 },
    ],
    checkpoints: [[0, 0, 2], [0, 0, 41], [0, 0, 66], [0, 0, 90], [0, 0, 106], [0, 0, 136], [0, 0, 153], [0, 0, 209]],
    wall: { x0: -10, x1: 10, z0: 82, z1: 84.5, h: 5.5 },
    gate1: { z: 50.25 }, gate2: { z: 125 }, bossAt: [0, 0.42, 194], goal: { z: 226 },
    enemies: [{ id: 'enemy1', name: PF.L('Gruñón', 'Grumble'), at: [0, 0, 45.5], guardR: 1.75 }, { id: 'enemy2', name: PF.L('Refunfuño', 'Grouch'), at: [0, 0, 119], guardR: 1.85 }],
    princessAt: [9, 11.28, 206.6], start: [0, 0, 2],
    arena: { x0: -22, x1: 22, z0: 150, z1: 204 },
    cage: [9, 11.2, 206.6],
  });
  W.buildLevel = () => {
    const r = U.rng(42);
    // 1 · prado de salida
    island(-13, 13, -10, 38);
    add('path', RB(3.2, 0.06, 46, 0.03), PF.mtx(0, 0.035, 14), 3);
    // 2 · calzada de piedra con la puerta del Gruñón
    island(-1.7, 1.7, 38, 64, { stone: true, noUnder: true });
    add('rock', new T.ConeGeometry(2.4, 14, 7), PF.mtx(0, -9, 51, Math.PI, 0.3, 0), 6);
    wallBox('rock', 1.4, -3, 49, 5.8, 6.4, 51.5, 3); wallBox('rock', -5.8, -3, 49, -1.4, 6.4, 51.5, 3);
    add('rock', new T.ConeGeometry(2.4, 3, 7), PF.mtx(3.6, 7.9, 50.25, 0, 0.5, 0), 3); add('rock', new T.ConeGeometry(2.4, 3, 7), PF.mtx(-3.6, 7.9, 50.25, 0, 0.2, 0), 3);
    wallBox('stone', -1.45, 3.0, 49.1, 1.45, 4.1, 51.4, 2);
    add('gold', RB(0.9, 0.7, 0.12, 0.05), PF.mtx(0, 3.55, 49.0), 2);
    // 3 · isla del muro
    island(-9, 9, 64, 104);
    add('path', RB(3.2, 0.06, 40, 0.03), PF.mtx(0, 0.035, 84), 3);
    // 4 · cañón
    island(-1.8, 1.8, 104, 150, { noUnder: true });
    add('path', RB(2.4, 0.06, 46, 0.03), PF.mtx(0, 0.035, 127), 3);
    for (const s of [1, -1]) {
      wallBox('rock', 1.8 * s, -4, 104, 8 * s, 9, 150, 4);
      for (let z = 106; z < 150; z += 5 + r() * 3) add('rock', G.ico(1.5 + r() * 1.5, 0), PF.mtx((3 + r() * 3) * s, 9 + r() * 0.5, z, r(), r(), r(), 1.3, 0.7, 1.2), 4);
    }
    // la puerta de madera del cañón
    wallBox('wood', -1.8, 3.0, 124.6, 1.8, 3.55, 125.4, 2);
    for (const s of [1, -1]) add('wood', G.cyl(0.22, 0.25, 3.6, 10), PF.mtx(1.58 * s, 1.8, 125), 2);
    // 5 · arena del jefe (cerrada por rocas y la muralla del castillo)
    island(-22, 22, 150, 204);
    wallBox('rock', -22, -4, 147, -8, 4, 150.5, 4); wallBox('rock', 8, -4, 147, 22, 4, 150.5, 4);
    wallBox('rock', -25, -4, 150, -22, 5, 206, 4); wallBox('rock', 22, -4, 150, 25, 5, 206, 4);
    for (let z = 152; z < 204; z += 4 + r() * 2) for (const s of [1, -1]) add('rock', G.ico(1.3 + r(), 0), PF.mtx(23.2 * s, 5 + r() * 0.4, z, r(), r(), r()), 4);
    add('stone', RB(9, 0.42, 6.5, 0.12), PF.mtx(0, 0.21, 194), 2); PF.addBox(-4.5, -1, 190.75, 4.5, 0.42, 197.25, 'dais');
    // muralla y torres del castillo, con el rastrillo
    wallBox('castle', -22, 0, 204, -2.7, 9, 206.2, 3); wallBox('castle', 2.7, 0, 204, 22, 9, 206.2, 3); wallBox('castle', -2.7, 5.2, 204, 2.7, 9, 206.2, 3);
    wallBox('stone', -2.7, -0.6, 203.9, 2.7, 0, 206.3, 2, 'ground'); // el suelo bajo el rastrillo
    for (let x = -21; x <= 21; x += 2.2) add('castle', BX(1.1, 1.0, 2.2), PF.mtx(x, 9.5, 205.1), 2);
    for (const x of [-22, 22]) { add('castle', G.cyl(3.2, 3.4, 15, 16), PF.mtx(x, 7.5, 205), 3); add('roof', G.cone(3.8, 5, 16), PF.mtx(x, 17.5, 205), 3); }
    for (const x of [-3.6, 3.6]) { add('castle', G.cyl(1.4, 1.5, 11, 14), PF.mtx(x, 5.5, 204.6), 3); add('roof', G.cone(1.8, 3, 14), PF.mtx(x, 12.5, 204.6), 3); }
    // torre de la jaula de la princesa
    add('castle', G.cyl(2.2, 2.5, 16, 16), PF.mtx(9, 8, 211), 3); add('roof', G.cone(2.8, 4.5, 16), PF.mtx(9, 18.2, 211), 3);
    add('wood', BX(0.4, 0.4, 4.2), PF.mtx(9, 14.3, 208.4), 2);
    // 6 · patio y meta
    island(-12, 12, 206, 236);
    add('path', RB(3.2, 0.06, 26, 0.03), PF.mtx(0, 0.035, 220), 3);
    // castillo al fondo (si llega el GLB «castle», lo sustituye)
    const castle = PF.grp(0, 0, 250); PF.scene.add(castle); W.castle = castle;
    island(-24, 24, 238, 268);
    // árboles, flores, piedras y matas por todo el recorrido
    const trees = [], flowers = [[], [], [], [], [], []], rocks = [], tufts = [];
    const onIsland = [[-13, 13, -10, 38], [-9, 9, 64, 104], [-12, 12, 206, 236], [-24, 24, 238, 268]];
    for (const [x0, x1, z0, z1] of onIsland) {
      const area = (x1 - x0) * (z1 - z0);
      for (let i = 0; i < area / 22; i++) { const x = x0 + 1 + r() * (x1 - x0 - 2), z = z0 + 1 + r() * (z1 - z0 - 2); if (Math.abs(x) < 2.4 || (z > 80 && z < 87)) continue; flowers[Math.floor(r() * 6)].push([x, 0, z, r() * 6, 0.8 + r() * 0.6]); }
      for (let i = 0; i < area / 9; i++) { const x = x0 + 0.5 + r() * (x1 - x0 - 1), z = z0 + 0.5 + r() * (z1 - z0 - 1); if (Math.abs(x) < 1.8) continue; tufts.push([x, 0, z, r() * 6, 0.7 + r() * 0.8]); }
      for (let i = 0; i < area / 120; i++) { const sx = r() < 0.5 ? -1 : 1, x = sx * (x1 - x0) / 2 * (0.6 + r() * 0.33), z = z0 + 2 + r() * (z1 - z0 - 4); if (Math.abs(x) < 4 || (z > 79 && z < 88)) continue; trees.push([x, 0, z, r() * 6, 0.8 + r() * 0.5]); }
      for (let i = 0; i < area / 260; i++) { const x = x0 + 1 + r() * (x1 - x0 - 2), z = z0 + 1 + r() * (z1 - z0 - 2); if (Math.abs(x) < 3) continue; rocks.push([x, 0.1, z, r() * 6, 0.6 + r() * 0.5]); }
    }
    W.treeGeo = PF.models.tree(7, 5);
    W.treeMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    W.trees = instanced(W.treeGeo, W.treeMat, trees);
    for (const t of trees) PF.addCyl(t[0], t[2], 0.35 * t[4], 0, 3, 'tree');
    flowers.forEach((list, v) => { if (list.length) instanced(PF.models.flowerGeo(v), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), list, false); });
    const tuftGeo = PF.merge([0, 1, 2, 3, 4].map((k) => ({ geo: G.cone(0.045, 0.32 + (k % 2) * 0.12, 4), c: k % 2 ? '#4fb348' : '#6fd65f', m: PF.mtx(Math.cos(k * 1.3) * 0.08, 0.16, Math.sin(k * 1.3) * 0.08, Math.cos(k) * 0.3, 0, Math.sin(k) * 0.3) })));
    W.tuftMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    instanced(tuftGeo, W.tuftMat, tufts, false);
    W.tuftGeo = tuftGeo;
    instanced(G.ico(0.6, 1), new T.MeshStandardMaterial({ color: PF.col('#a8a3b8'), roughness: 0.95, flatShading: true }), rocks);
    // farolillos (se encienden de noche y con mal tiempo)
    W.lampMats = []; W.lampLights = [];
    for (const [x, z] of [[2.6, 30], [-2.6, 30], [2.6, 70], [-2.6, 100], [2.6, 212], [-2.6, 212]]) {
      const l = PF.models.lantern(); l.position.set(x, 0, z); PF.scene.add(l); l.traverse((o) => { if (o.material && o.material.emissive && o.material.emissiveIntensity > 1) { o.material = o.material.clone(); W.lampMats.push(o.material); } });
      PF.addCyl(x, z, 0.12, 0, 2.6, 'lamp');
    }
    for (const z of [30, 212]) { const pl = new T.PointLight(0xffc46b, 0, 16, 2); pl.position.set(0, 2.6, z); PF.scene.add(pl); W.lampLights.push(pl); }
    // carteles
    sign(PF.L('¡Hola, ' + PF.NAME + '!', 'Hi, ' + PF.NAME + '!'), 4.2, 7, -0.35, PF.L('La meta está al final del camino', 'The goal is at the end of the path'));
    sign(PF.L('Paso del Gruñón', 'Grumble’s Pass'), 3.0, 44, -0.25, PF.L('nadie pasa… salvo que lo digas', 'no one gets by… unless you say so'));
    sign(PF.L('El Muro', 'The Wall'), 4.5, 77, -0.25, PF.L('demasiado alto para saltar', 'too high to jump'));
    sign(PF.L('Cañón estrecho', 'Narrow Canyon'), 3.4, 107, -0.15, PF.L('aquí vigila Refunfuño', 'Grouch keeps watch here'));
    sign(PF.L('Arena del Rey Volcán', 'Volcano King’s Arena'), 9, 156, -0.4, PF.L('cuidado con el fuego', 'beware of the fire'));
    sign(PF.L('Meta', 'Goal'), 4.5, 220, -0.3, PF.L('solo se entra con la princesa', 'only opens with the princess'));
    // monte y montañas lejanas
    const far = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = 330 + r() * 120; far.push({ geo: G.cone(30 + r() * 40, 60 + r() * 90, 7), c: r() < 0.5 ? '#8fb3d9' : '#9cc0e3', m: PF.mtx(Math.cos(a) * d, -30, 110 + Math.sin(a) * d, 0, r() * 6, 0) }); }
    const farMesh = new T.Mesh(PF.merge(far), new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); PF.scene.add(farMesh);
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = 90 + r() * 120, s = 4 + r() * 8; const x = Math.cos(a) * d, z = 110 + Math.sin(a) * d; if (Math.abs(x) < 40) continue; island(x - s, x + s, z - s, z + s, { y: -6 + r() * 20 }); }
    flush();
    // castillo procedural (fusionado aparte para poder ocultarlo si llega su GLB)
    const cparts = [];
    const C1 = '#ead9f0', C2 = '#5a7be0';
    cparts.push({ geo: BX(30, 16, 12), c: C1, m: PF.mtx(0, 8, 0) });
    for (const x of [-15, 15]) { cparts.push({ geo: G.cyl(4, 4.4, 26, 16), c: C1, m: PF.mtx(x, 13, 0) }); cparts.push({ geo: G.cone(5, 8, 16), c: C2, m: PF.mtx(x, 30, 0) }); }
    cparts.push({ geo: G.cyl(5, 5.5, 34, 18), c: C1, m: PF.mtx(0, 17, 2) }); cparts.push({ geo: G.cone(6.4, 12, 18), c: C2, m: PF.mtx(0, 40, 2) });
    for (let x = -14; x <= 14; x += 2.8) cparts.push({ geo: BX(1.4, 1.6, 12.4), c: C1, m: PF.mtx(x, 16.8, 0) });
    cparts.push({ geo: G.cyl(0.08, 0.08, 6, 6), c: '#888888', m: PF.mtx(0, 49, 2) });
    const cmesh = new T.Mesh(PF.merge(cparts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })); cmesh.castShadow = true; cmesh.receiveShadow = true; castle.add(cmesh);
    const flag = mk(new T.PlaneGeometry(4, 2.4), PF.mat('#ffd84d', { side: true }), 2, 50.5, 2); castle.add(flag); W.flag = flag;
    PF.models.sceneryGLB('castle', castle, { height: 52 });
    // el muro que hay que subir (pieza propia: se puede quitar con una orden)
    W.wallMesh = PF.grp(0, 0, 0); PF.scene.add(W.wallMesh);
    const WL = L.wall, wm = mk(RB(WL.x1 - WL.x0, WL.h, WL.z1 - WL.z0, 0.12), new T.MeshStandardMaterial({ color: PF.col('#c9c2dc'), map: PF.tex('stone'), roughness: 0.85 }), 0, WL.h / 2, (WL.z0 + WL.z1) / 2);
    triUV(wm.geometry, 2.2); W.wallMesh.add(wm);
    for (let x = WL.x0 + 0.6; x < WL.x1; x += 2.2) W.wallMesh.add(mk(RB(1.0, 0.7, 0.6, 0.08), PF.mat('#bdb5d2', { map: 'stone' }), x, WL.h + 0.3, WL.z1 - 0.3));
    PF.models.sceneryGLB('wall', W.wallMesh, { size: [WL.x1 - WL.x0, WL.h, WL.z1 - WL.z0] });
    // rastrillo
    const port = PF.grp(0, 0, 205.1); PF.scene.add(port); W.portcullis = port;
    for (let x = -2.4; x <= 2.41; x += 0.6) port.add(mk(G.cyl(0.07, 0.07, 5.2, 8), PF.mat('#3d4450', { metal: 0.7, rough: 0.4 }), x, 2.6, 0));
    for (const y of [1.2, 2.6, 4.0]) port.add(mk(G.rbox(5.2, 0.14, 0.14, 0.05), PF.mat('#3d4450', { metal: 0.7, rough: 0.4 }), 0, y, 0));
    for (let x = -2.4; x <= 2.41; x += 0.6) port.add(mk(G.cone(0.1, 0.3, 6), PF.mat('#3d4450', { metal: 0.7, rough: 0.4 }), x, -0.1, 0, Math.PI));
    W.portCol = PF.addBox(-2.7, 0, 204.6, 2.7, 5.2, 205.6, 'gate');
    // arco de meta con campana
    const goal = PF.grp(0, 0, L.goal.z); PF.scene.add(goal); W.goal = goal;
    goal.add(mk(new T.TorusGeometry(3.4, 0.32, 16, 48, Math.PI), PF.mat('#f6c945', { metal: 0.85, rough: 0.25 }), 0, 0, 0));
    goal.add(mk(G.cyl(0.36, 0.4, 0.4, 16), PF.mat('#f6c945', { metal: 0.85, rough: 0.25 }), 3.4, 0.2, 0)); goal.add(mk(G.cyl(0.36, 0.4, 0.4, 16), PF.mat('#f6c945', { metal: 0.85, rough: 0.25 }), -3.4, 0.2, 0));
    const bell = PF.grp(0, 3.1, 0); bell.add(mk(G.lathe([[0.0001, 0.62], [0.18, 0.6], [0.26, 0.4], [0.3, 0.12], [0.42, 0], [0.0001, 0.02]], 24), PF.mat('#ffd36b', { metal: 0.9, rough: 0.2 }), 0, -0.62, 0)); goal.add(bell); W.bell = bell;
    for (const s of [1, -1]) PF.addCyl(3.4 * s, L.goal.z, 0.45, 0, 3.4, 'goal');
    // jaula colgante de la princesa
    const cage = PF.grp(L.cage[0], L.cage[1], L.cage[2]); PF.scene.add(cage); W.cage = cage;
    const GOLD = PF.mat('#f6c945', { metal: 0.85, rough: 0.3 });
    cage.add(mk(G.cyl(1.0, 1.0, 0.16, 24), GOLD, 0, 0, 0)); cage.add(mk(G.cyl(0.2, 1.0, 0.7, 24), GOLD, 0, 2.6, 0)); cage.add(mk(G.cyl(0.03, 0.03, 2.4, 6), GOLD, 0, 4.0, 0));
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; if (i === 0) continue; cage.add(mk(G.cyl(0.035, 0.035, 2.3, 6), GOLD, Math.sin(a) * 0.97, 1.15, Math.cos(a) * 0.97)); }
    const door = mk(G.cyl(0.035, 0.035, 2.3, 6), GOLD, 0, 1.15, 0.97); cage.add(door); W.cageDoor = door;
    // celdas de hierba quemable de la arena (la lógica del fuego está en pf-boss.js)
    W.cells = []; const A = L.arena, CS = 2.5;
    for (let x = A.x0 + CS / 2; x < A.x1; x += CS) for (let z = A.z0 + CS / 2; z < A.z1 - 1; z += CS) {
      if (Math.abs(x) < 4.8 && z > 190 && z < 198) continue;
      W.cells.push({ x, z, s: 0, t: 0, fuel: 1, i: W.cells.length });
    }
    W.cellSize = CS;
  };

  W.openGate = (instant) => {
    if (W.gateOpen) return; W.gateOpen = true; PF.dropCollider(W.portCol);
    const p = W.portcullis; if (instant) { p.position.y = 4.9; return; }
    PF.sfx.play('rumble'); PF.tween(2.2, (k) => { p.position.y = U.smooth(k) * 4.9; PF.shake && PF.shake(0.08); });
  };
  W.closeGate = () => { if (!W.gateOpen) return; W.gateOpen = false; W.portcullis.position.y = 0; W.portCol = PF.addBox(-2.7, 0, 204.6, 2.7, 5.2, 205.6, 'gate'); };

  W.update = (dt) => {
    updateEnv(dt); updateWeather(dt);
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 380) c.position.x = -380; }
    if (seaMat.map) seaMat.map.offset.x += dt * 0.004;
    if (W.flag) W.flag.rotation.y = Math.sin(PF.time * 2) * 0.15;
    skyU.time.value = PF.time;
    // sombras que siguen al jugador (encajadas a la rejilla para que no tiemblen)
    const p = PF.player ? PF.player.pos : new T.Vector3(), sd = PF.sunDir || new T.Vector3(0.4, 0.7, 0.3);
    const step = 68 / 2048, cx = Math.round(p.x / step) * step, cz = Math.round(p.z / step) * step;
    sun.target.position.set(cx, p.y, cz); sun.position.set(cx + sd.x * 80, p.y + sd.y * 80, cz + sd.z * 80);
    sky.position.copy(PF.camera.position);
  };
  W.sectionAt = (z) => { let s = L.sections[0]; for (const q of L.sections) if (z >= q.z) s = q; return s; };
})();
