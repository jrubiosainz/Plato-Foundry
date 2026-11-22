/* Plataformas 3D · el cierre: logos oficiales en 3D (Microsoft Foundry, Microsoft, GitHub Copilot y GitHub) que giran
   sobre la meta, con confeti y un encuadre final de cine.
   Los SVG son los oficiales (assets/platform/logos, ver NOTICE): SVGLoader los lee tal cual y ExtrudeGeometry los extruye
   con un biselado hacia dentro (bevelOffset = −bevelSize), así que la silueta y las proporciones no cambian. Los
   degradados del icono de Foundry se pintan por vértice a partir de sus <linearGradient> (con su gradientTransform). */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const BRANDS = {
    foundry: { file: 'foundry.svg', name: 'Microsoft Foundry' },
    microsoft: { file: 'microsoft.svg', name: 'Microsoft' },
    copilot: { file: 'copilot.svg', name: 'GitHub Copilot', ink: '#1f2328' },
    github: { file: 'github.svg', name: 'GitHub', ink: '#1f2328' },
  };
  const ORDER = ['foundry', 'microsoft', 'copilot', 'github'];
  const svgText = {};
  function fetchSvg(key) {
    if (!svgText[key]) svgText[key] = fetch('assets/platform/logos/' + BRANDS[key].file).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    return svgText[key];
  }

  /* ---------- SVG: transformaciones y degradados ---------- */
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  function parseTransform(s) {
    let m = [1, 0, 0, 1, 0, 0]; const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g; let k;
    while ((k = re.exec(String(s || '')))) {
      const a = k[2].trim().split(/[\s,]+/).map(Number); let n;
      if (k[1] === 'matrix') n = a.slice(0, 6);
      else if (k[1] === 'translate') n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
      else if (k[1] === 'scale') n = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
      else { const r = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r); n = [c, sn, -sn, c, 0, 0]; if (a.length > 2) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]); }
      m = mul(m, n);
    }
    return m;
  }
  const invert = (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  function parseGradients(doc) {
    const out = new Map();
    doc.querySelectorAll('linearGradient').forEach((g) => {
      const num = (k, d) => { const v = g.getAttribute(k); if (v == null) return d; return /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v); };
      const stops = Array.from(g.querySelectorAll('stop')).map((s) => {
        const style = s.getAttribute('style') || '', sc = (style.match(/stop-color:\s*([^;]+)/) || [])[1];
        const o = s.getAttribute('offset') || '0';
        return { o: /%$/.test(o) ? parseFloat(o) / 100 : parseFloat(o), c: new T.Color(sc || s.getAttribute('stop-color') || '#000').convertSRGBToLinear() };
      }).sort((a, b) => a.o - b.o);
      out.set(g.getAttribute('id'), { x1: num('x1', 0), y1: num('y1', 0), x2: num('x2', 1), y2: num('y2', 0), inv: invert(parseTransform(g.getAttribute('gradientTransform'))), stops });
    });
    return out;
  }
  function paintGradient(geo, gr) {
    const P = geo.attributes.position, col = new Float32Array(P.count * 3), c = new T.Color();
    const dx = gr.x2 - gr.x1, dy = gr.y2 - gr.y1, L2 = dx * dx + dy * dy || 1, S = gr.stops, iv = gr.inv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), gx = iv[0] * x + iv[2] * y + iv[4], gy = iv[1] * x + iv[3] * y + iv[5];
      const t = U.clamp(((gx - gr.x1) * dx + (gy - gr.y1) * dy) / L2, 0, 1);
      let j = 0; while (j < S.length - 1 && S[j + 1].o < t) j++;
      const a = S[j], b = S[Math.min(S.length - 1, j + 1)], k = b.o > a.o ? U.clamp((t - a.o) / (b.o - a.o), 0, 1) : 0;
      c.copy(a.c).lerp(b.c, k); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
  }

  // la cara de un relleno con degradado: el color se calcula en cada píxel (exacto, como el SVG), sin luz ni tono
  function gradientFace(gr, cx, cy) {
    const n = Math.min(10, gr.stops.length), offs = [], cols = [];
    for (let i = 0; i < 10; i++) { const st = gr.stops[Math.min(i, n - 1)]; offs.push(st.o); cols.push(st.c.clone()); }
    const iv = gr.inv;
    return new T.ShaderMaterial({
      uniforms: { offs: { value: offs }, cols: { value: cols }, n: { value: n }, ga: { value: new T.Vector2(gr.x1, gr.y1) }, gb: { value: new T.Vector2(gr.x2, gr.y2) }, inv: { value: new T.Matrix3().set(iv[0], iv[2], iv[4], iv[1], iv[3], iv[5], 0, 0, 1) }, center: { value: new T.Vector2(cx, cy) } },
      vertexShader: 'uniform vec2 center; varying vec2 vP; void main(){ vP = position.xy + center; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float offs[10]; uniform vec3 cols[10]; uniform int n; uniform vec2 ga, gb; uniform mat3 inv; varying vec2 vP;\n'
        + 'void main(){ vec3 g = inv * vec3(vP, 1.0); vec2 d = gb - ga; float t = clamp(dot(g.xy - ga, d) / max(1e-6, dot(d, d)), 0.0, 1.0); vec3 c = cols[0];\n'
        + ' for (int i = 1; i < 10; i++) { if (i >= n) break; if (t >= offs[i - 1]) c = mix(cols[i - 1], cols[i], clamp((t - offs[i - 1]) / max(1e-5, offs[i] - offs[i - 1]), 0.0, 1.0)); }\n'
        + ' gl_FragColor = linearToOutputTexel(vec4(c, 1.0)); }',
    });
  }

  /* ---------- un logo: SVG → formas → extrusión biselada, 1 m de alto, centrado ---------- */
  function buildLogo(text, key) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
    const vb = (svg.getAttribute('viewBox') || '0 0 24 24').trim().split(/[\s,]+/).map(Number), unit = Math.max(vb[2], vb[3]);
    const grads = parseGradients(doc);
    // los rellenos con degradado se guardan aparte (SVGLoader no los entiende) y se pintan por vértice
    doc.querySelectorAll('[fill]').forEach((n) => { const f = n.getAttribute('fill'); if (/^url\(/.test(f)) { n.setAttribute('data-fill', f); n.setAttribute('fill', '#ffffff'); } });
    const data = new T.SVGLoader().parse(new XMLSerializer().serializeToString(doc));
    const inner = new T.Group(), depth = unit * 0.15, bev = unit * 0.014, brand = BRANDS[key], byD = new Map();
    for (const path of data.paths) {
      const style = (path.userData && path.userData.style) || {}, node = path.userData && path.userData.node;
      if (style.fill === 'none' || style.fillOpacity === 0) continue;
      const shapes = T.SVGLoader.createShapes(path); if (!shapes.length) continue;
      const geo = new T.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 4, curveSegments: 20 });
      const gid = node && node.getAttribute('data-fill') ? node.getAttribute('data-fill').replace(/^url\(#|\)$/g, '') : null;
      // la cara del logo lleva el color oficial tal cual (sin luz ni tono); el canto biselado sí se ilumina y le da volumen
      let mat;
      if (gid && grads.has(gid)) { paintGradient(geo, grads.get(gid)); mat = [gradientFace(grads.get(gid), vb[0] + vb[2] / 2, vb[1] + vb[3] / 2), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12 })]; }
      else if (brand.ink) mat = new T.MeshStandardMaterial({ color: PF.col(brand.ink), roughness: 0.26, metalness: 0.35 });
      else { const c = path.color.clone().convertSRGBToLinear(); mat = [new T.MeshBasicMaterial({ color: c, toneMapped: false }), new T.MeshStandardMaterial({ color: c, roughness: 0.34, metalness: 0.08 })]; }
      geo.translate(-(vb[0] + vb[2] / 2), -(vb[1] + vb[3] / 2), -depth / 2);
      const m = new T.Mesh(geo, mat); m.castShadow = true; inner.add(m);
      // el icono de Foundry pinta dos veces la misma forma con otro degradado encima: solo cuenta la de arriba
      const d = node && node.getAttribute('d'); if (d) { const prev = byD.get(d); if (prev) { inner.remove(prev); prev.geometry.dispose(); } byD.set(d, m); }
    }
    inner.scale.set(1 / unit, -1 / unit, 1 / unit); // el eje Y del SVG crece hacia abajo
    const holder = new T.Group(); holder.add(inner); holder.userData.brand = key;
    return holder;
  }

  /* ---------- el escenario del cierre ---------- */
  const F = (PF.finale = { shownSet: [], group: null, t0: 0, cine: false });
  let stage = null, light = null, burstT = 0, burstsLeft = 0, camT = 0, center = V(), facing = 0, moveT = 0;
  const built = {};
  // el escenario y su luz existen desde el principio (con la luz apagada): añadir una luz después obligaría a
  // recompilar los shaders de toda la escena justo en el plano final
  function ensureStage() { if (stage) return; stage = new T.Group(); stage.position.set(0, -400, 0); PF.scene.add(stage); light = new T.PointLight(0xfff1d6, 0, 30, 2); stage.add(light); }
  const mark = V(), fwd = V(0, 0, 1);
  const SIZE = 3.2, GAP = 1.5;
  // los logos van detrás del protagonista, en lo alto; él se vuelve hacia la cámara (en la meta, se coloca en su marca)
  function placeStage() {
    const P = PF.player, goal = PF.level.goal.z;
    F.nearGoal = PF.state.won || (P.pos.z > goal - 4 && P.pos.z < goal + 14 && Math.abs(P.pos.x) < 12);
    if (F.nearGoal) { mark.set(0, 0, goal + 6.5); fwd.set(0, 0, 1); }
    else { const cy = PF.cam.yaw; fwd.set(Math.sin(cy), 0, Math.cos(cy)); mark.copy(P.pos); }
    center.copy(mark).addScaledVector(fwd, 9.5); center.y = mark.y + 7.6;
    facing = Math.atan2(-fwd.x, -fwd.z);
    ensureStage(); light.intensity = 1.6;
    stage.position.copy(center); stage.rotation.y = facing; light.position.set(0, 1.5, 6);
  }
  async function show(list) {
    if (!F.cine || !stage) placeStage();
    const want = ORDER.filter((k) => list.includes(k) || F.shownSet.includes(k));
    const texts = await Promise.all(want.map((k) => fetchSvg(k).catch((e) => { console.warn('logo', k, e); return null; })));
    for (const old of stage.children.filter((c) => c.userData.brand)) { if (old.userData.cached) { old.visible = false; old.userData.born = null; } else stage.remove(old); }
    const n = want.length, width = n * SIZE + (n - 1) * GAP;
    want.forEach((k, i) => {
      if (!texts[i]) return;
      const logo = built[k] || buildLogo(texts[i], k); logo.scale.setScalar(0.001); logo.visible = true;
      logo.position.set(-width / 2 + SIZE / 2 + i * (SIZE + GAP), 0, 0); logo.userData.phase = i * 0.9; logo.userData.born = PF.time + i * 0.18;
      if (logo.parent !== stage) stage.add(logo);
    });
    F.shownSet = want.filter((k, i) => texts[i]);
    const cap = document.querySelector('#caption span'); if (cap) cap.textContent = PF.L('Creado hablando · ', 'Built by talking · ') + F.shownSet.map((k) => BRANDS[k].name).join(' · ');
    burstsLeft = 6; burstT = 0; F.t0 = PF.time;
    PF.sfx.play('fanfare'); PF.sfx.play('confetti'); PF.shake(0.25);
    enterCine();
    PF.emit('logos', { brands: F.shownSet.slice() });
    return F.shownSet.slice();
  }
  function burst(big) {
    const w = (F.shownSet.length * (SIZE + GAP)) / 2 + 1.5, cols = ['#f25022', '#7fba00', '#00a4ef', '#ffb900', '#7274ff', '#ffffff', '#ff6fb5'];
    const pick = () => cols[Math.floor(Math.random() * cols.length)];
    for (const s of [-1, 1]) {
      const at = stage.localToWorld(V(s * w, -4.2, 1.5)), dir = center.clone().sub(at).setY(0).normalize();
      PF.fx.confetti(big ? 160 : 70, () => { const k = U.rand(1.5, 4.5); return { at: [at.x, at.y, at.z], v: [dir.x * k + U.rand(-1.5, 1.5), U.rand(9, 15), dir.z * k + U.rand(-1.5, 1.5)], c: pick(), life: U.rand(4, 7), scale: 1.2 }; });
    }
    PF.fx.confetti(big ? 120 : 50, () => { const p = stage.localToWorld(V(U.rand(-w, w), 3.5 + U.rand(0, 2), U.rand(-1.5, 1.5))); return { at: [p.x, p.y, p.z], v: [U.rand(-1, 1), U.rand(0, 2), U.rand(-1, 1)], c: pick(), life: U.rand(5, 8), scale: 1.2 }; });
    PF.sfx.play('confetti');
  }
  // encuadre final: el protagonista (y quien le acompañe) de cara a la cámara y los logos girando detrás, en lo alto
  function enterCine() {
    if (F.cine) return;
    F.cine = PF.state.cine = true; camT = 0; moveT = PF.time + 4;
    if (PF.env.target > 8 && PF.env.target < 17.5) PF.setTime(18.3); // hora dorada para el plano final
    document.body.classList.add('cine'); const win = document.getElementById('win'); if (win) win.classList.remove('on');
    const P = PF.player, from = PF.camera.position.clone(), fromLook = PF.cam.look.clone(); F.fov0 = PF.camera.fov;
    const faceYaw = Math.atan2(-fwd.x, -fwd.z);
    let arrived = !F.nearGoal || P.pos.distanceTo(mark) < 0.6;
    const celebrate = () => { PF.models.playOnce(P.ch, 'victory', 8); const pr = PF.get('princess'); if (pr && pr.state !== 'caged') PF.models.playOnce(pr.ch, 'heart', 6.2); for (const c of PF.all('companion')) c.task = { kind: 'cheer', t: 0, dur: 12 }; };
    if (!arrived) PF.autoWalk = { x: mark.x, z: mark.z, until: PF.time + 4, done: () => { arrived = true; celebrate(); } }; else celebrate();
    PF.cam.override = (dt) => {
      camT += dt;
      if (arrived) P.yaw = U.dampAngle(P.yaw, faceYaw, 5, dt);
      const side = V(fwd.z, 0, -fwd.x), sway = Math.sin(camT * 0.22) * 1.2;
      const want = mark.clone().addScaledVector(fwd, -6.8).addScaledVector(side, sway); want.y = mark.y + 2.6;
      const look = mark.clone().addScaledVector(fwd, 5.5); look.y = mark.y + 2.65;
      const k = U.smooth(Math.min(1, camT / 2.4));
      PF.cam.pos.lerpVectors(from, want, k); PF.cam.look.lerpVectors(fromLook, look, k);
      const fov = U.lerp(F.fov0, 60, k); if (Math.abs(PF.camera.fov - fov) > 0.01) { PF.camera.fov = fov; PF.camera.updateProjectionMatrix(); }
      PF.cam.apply(dt);
    };
  }
  F.exit = () => {
    if (!F.cine) return; F.cine = PF.state.cine = false; document.body.classList.remove('cine'); PF.autoWalk = null;
    if (F.fov0) { PF.camera.fov = F.fov0; PF.camera.updateProjectionMatrix(); }
    PF.cam.override = null; PF.cam.idleT = 0; PF.cam.yaw = PF.player.yaw + Math.PI; PF.player.yaw = PF.cam.yaw;
  };
  F.wantSet = [];
  F.logos = (list) => { const l = (list && list.length ? list : ['foundry', 'microsoft']).filter((k) => BRANDS[k]); for (const k of l) if (!F.wantSet.includes(k)) F.wantSet.push(k); F.pending = show(l); return F.pending; };
  // pedidos (aunque aún se estén construyendo) o ya en escena
  F.shown = (list) => (list || []).every((k) => F.wantSet.includes(k) || F.shownSet.includes(k));
  F.preload = () => { for (const k of ORDER) fetchSvg(k).catch(() => {}); };
  // al cargar: los cuatro logos ya extruidos (diminutos y ocultos bajo el nivel) y sus shaders compilados
  F.warm = async () => {
    ensureStage();
    for (const k of ORDER) { try { const logo = buildLogo(await fetchSvg(k), k); logo.userData.cached = true; logo.scale.setScalar(0.001); stage.add(logo); built[k] = logo; } catch (e) { console.warn('logo', k, e); } }
    try { PF.renderer.compile(PF.scene, PF.camera); } catch (e) {}
    for (const k of ORDER) if (built[k]) built[k].visible = false;
  };
  F.build = buildLogo;
  F.update = (dt) => {
    if (!stage) return;
    for (const logo of stage.children) {
      if (!logo.userData.brand || !logo.visible || logo.userData.born == null) continue;
      const age = PF.time - logo.userData.born; if (age < 0) continue;
      const s = SIZE * U.outBack(Math.min(1, age / 0.9)); logo.scale.setScalar(Math.max(0.001, s));
      // giro completo cada 4,5 s y, entre medias, de frente para que se lea bien en el vídeo
      const cyc = (PF.time + logo.userData.phase) % 4.5, spin = cyc < 1.4 ? U.smooth(cyc / 1.4) * Math.PI * 2 : 0;
      logo.rotation.y = spin + Math.sin(PF.time * 0.8 + logo.userData.phase) * 0.12;
      logo.position.y = Math.sin(PF.time * 1.6 + logo.userData.phase) * 0.18;
    }
    if (burstsLeft > 0) { burstT -= dt; if (burstT <= 0) { burst(burstsLeft === 6); burstsLeft--; burstT = 1.6; } }
    if (F.cine && PF.time > moveT) { const K = PF.input.keys; if (K.has('KeyW') || K.has('KeyA') || K.has('KeyS') || K.has('KeyD') || K.has('ArrowUp') || K.has('ArrowDown')) F.exit(); }
  };
})();
