/* Plataformas 3D · el jefe final y el fuego.
   El Rey Volcán (gólem redondo de basalto con grietas de lava y corona) lanza bolas de fuego que prenden la hierba, la madera y los árboles;
   el fuego se extiende y quema. Con una orden lanza flores (que florecen donde caen) u otra cosa; con un tutú se pone a
   bailar; con las dos cosas se le pasa el enfado, se aparta y abre el rastrillo. La lluvia (o la nieve) apaga el fuego. */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U, G = PF.G, mk = PF.mk;
  const V = (x, y, z) => new T.Vector3(x, y, z);

  /* ================= llamas: cuadrados instanciados con un shader de fuego ================= */
  const FIRE = (PF.fire = { flames: [], free: [], cells: [], burning: new Set(), lights: [] });
  let flameGeo, flameMat, flameMesh, aOff, aScale, aPhase;
  const NF = 700;
  function initFlames() {
    const base = new T.PlaneGeometry(1, 1);
    flameGeo = new T.InstancedBufferGeometry(); flameGeo.index = base.index; flameGeo.setAttribute('position', base.attributes.position); flameGeo.setAttribute('uv', base.attributes.uv);
    aOff = new T.InstancedBufferAttribute(new Float32Array(NF * 3), 3).setUsage(T.DynamicDrawUsage); aScale = new T.InstancedBufferAttribute(new Float32Array(NF), 1).setUsage(T.DynamicDrawUsage); aPhase = new T.InstancedBufferAttribute(new Float32Array(NF), 1);
    for (let i = 0; i < NF; i++) { aPhase.array[i] = Math.random(); FIRE.free.push(NF - 1 - i); }
    flameGeo.setAttribute('offset', aOff); flameGeo.setAttribute('scale', aScale); flameGeo.setAttribute('phase', aPhase); flameGeo.instanceCount = NF;
    flameMat = new T.ShaderMaterial({
      // alfa premultiplicado: llamas anaranjadas también sobre la hierba y el cielo claros (el aditivo las quemaba a blanco)
      uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
      vertexShader: 'attribute vec3 offset; attribute float scale; attribute float phase; varying vec2 vUv; varying float vPh;\n'
        + 'void main(){ vUv = uv; vPh = phase; vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 p = offset + r * position.x * scale + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * scale * 1.75; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); if (scale < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
      fragmentShader: 'uniform float time; varying vec2 vUv; varying float vPh;\n'
        + 'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n'
        + 'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }\n'
        + 'void main(){ vec2 uv = vUv; float t = time * 1.7 + vPh * 17.0;\n'
        + ' float n = noise(vec2(uv.x * 4.0 + vPh * 5.0, uv.y * 3.5 - t * 2.4)) * 0.62 + noise(vec2(uv.x * 9.0, uv.y * 8.0 - t * 3.6)) * 0.38;\n'
        + ' float x = (uv.x - 0.5) * 2.0; float w = max(0.05, 0.92 - uv.y * 0.8 + (n - 0.5) * 0.45);\n'
        + ' float body = (1.0 - smoothstep(0.0, 1.0, abs(x) / w)) * smoothstep(1.0, 0.2, uv.y + (n - 0.5) * 0.5) * smoothstep(0.0, 0.1, uv.y);\n'
        + ' float core = body * smoothstep(0.6, 0.0, uv.y + abs(x) * 0.7);\n'
        + ' vec3 col = mix(vec3(0.95, 0.2, 0.02), vec3(1.0, 0.62, 0.1), body) + vec3(1.0, 0.86, 0.5) * core * 0.55;\n'
        + ' float a = clamp(body * 1.2, 0.0, 1.0); if (a < 0.01) discard; gl_FragColor = vec4(col * a, a * 0.82); }',
    });
    flameMesh = new T.Mesh(flameGeo, flameMat); flameMesh.frustumCulled = false; flameMesh.renderOrder = 7; PF.scene.add(flameMesh);
    for (let i = 0; i < 3; i++) { const l = new T.PointLight(0xff7a2a, 0, 16, 2); PF.scene.add(l); FIRE.lights.push(l); }
  }
  FIRE.ensure = () => { if (!flameMesh) initFlames(); };
  FIRE.move = (i, x, y, z) => { if (i == null) return; aOff.setXYZ(i, x, y, z); aOff.needsUpdate = true; };
  FIRE.add = (x, y, z, s) => { const i = FIRE.free.pop(); if (i == null) return null; aOff.setXYZ(i, x, y, z); aScale.setX(i, s || 1); aOff.needsUpdate = aScale.needsUpdate = true; FIRE.flames.push(i); return i; };
  FIRE.remove = (i) => { if (i == null) return; aScale.setX(i, 0); aScale.needsUpdate = true; const k = FIRE.flames.indexOf(i); if (k >= 0) FIRE.flames.splice(k, 1); FIRE.free.push(i); };

  /* ================= hierba quemable de la arena ================= */
  let tufts, scorch;
  function initCells() {
    const W = PF.world, cells = W.cells, CS = W.cellSize, list = [];
    FIRE.cells = cells;
    tufts = new T.InstancedMesh(W.tuftGeo, W.tuftMat, cells.length * 3); tufts.receiveShadow = true;
    scorch = new T.InstancedMesh(new T.CircleGeometry(CS * 0.62, 18).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: PF.col('#2a211b'), roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), cells.length);
    const r = U.rng(5);
    cells.forEach((c, i) => {
      c.tuft = []; for (let k = 0; k < 3; k++) { const m = PF.mtx(c.x + (r() - 0.5) * CS * 0.8, 0, c.z + (r() - 0.5) * CS * 0.8, 0, r() * 6, 0, 0.8 + r() * 0.7); tufts.setMatrixAt(i * 3 + k, m); c.tuft.push(m); }
      scorch.setMatrixAt(i, PF.mtx(c.x, 0.02, c.z, 0, r() * 6, 0, 0.001)); c.fl = [];
    });
    PF.scene.add(tufts); PF.scene.add(scorch);
    // madera quemable: árboles, vallas y balas de paja de la arena
    const A = PF.level.arena;
    for (const [x, z] of [[-17, 160], [16, 163], [-14, 182], [18, 186], [-19, 198], [13, 199]]) PF.spawn('tree', { at: V(x, 0, z), quiet: true, tags: ['wood', 'arena'] });
    for (const [x, z, ry] of [[-9, 170, 0.3], [9.5, 172, -0.2], [-10, 186, 0.1], [11, 184, -0.4]]) { const e = PF.spawn('fence', { at: V(x, 0, z), quiet: true, tags: ['wood', 'arena'] }); e.root.rotation.y = ry; }
    for (const [x, z] of [[-6, 163], [6.5, 165], [-15, 175], [15, 177], [-6, 200], [7, 201]]) PF.spawn('hay', { at: V(x, 0, z), quiet: true, tags: ['wood', 'arena'] });
    void A; void list;
  }
  PF.KINDS.hay = {
    make(e) { const g = PF.grp(); g.add(mk(G.cyl(0.65, 0.65, 1.3, 18), PF.mat('#e9c25a', { rough: 0.95 }), 0, 0.65, 0, 0, 0, Math.PI / 2)); for (const x of [-0.35, 0.35]) g.add(mk(G.tor(0.66, 0.03, 0, 24), '#a0742c', x, 0.65, 0, 0, Math.PI / 2)); e.root.add(g); e.r = 0.7; e.h = 1.3; e.tags.add('wood'); e.cols.push(PF.addCyl(e.pos.x, e.pos.z, 0.7, 0, 1.3, 'hay', e)); },
    update() {},
  };
  function cellAt(x, z) { const W = PF.world, CS = W.cellSize; for (const c of FIRE.cells) if (Math.abs(c.x - x) <= CS / 2 && Math.abs(c.z - z) <= CS / 2) return c; return null; }
  const wet = () => PF.env.weather === 'rain' || PF.env.weather === 'storm' || PF.env.weather === 'snow';
  function igniteCell(c) {
    if (!c || c.s !== 0 || wet()) return false;
    c.s = 1; c.t = 7 + Math.random() * 3; FIRE.burning.add(c);
    const CS = PF.world.cellSize; for (let k = 0; k < 2; k++) c.fl.push(FIRE.add(c.x + (Math.random() - 0.5) * CS * 0.6, 0, c.z + (Math.random() - 0.5) * CS * 0.6, 1.3 + Math.random() * 0.7));
    for (let k = 0; k < 3; k++) { tufts.setMatrixAt(c.i * 3 + k, PF.mtx(0, -50, 0, 0, 0, 0, 0.001)); } tufts.instanceMatrix.needsUpdate = true;
    PF.emit('ignite', c); return true;
  }
  function burnOut(c, steam) {
    for (const f of c.fl) FIRE.remove(f); c.fl = []; FIRE.burning.delete(c); c.s = 2;
    scorch.setMatrixAt(c.i, PF.mtx(c.x, 0.02, c.z, 0, Math.random() * 6, 0, 1)); scorch.instanceMatrix.needsUpdate = true;
    if (steam) PF.fx.steam(c.x, 0, c.z, 6); else PF.fx.smoke(c.x, 0.4, c.z, 4);
  }
  function igniteEnt(e) {
    if (!e || !e.alive || !e.tags.has('wood') || e.data.burnt || e.data.burn > 0 || wet()) return false;
    e.data.burn = 9 + Math.random() * 3; e.data.fl = [];
    const n = e.type === 'tree' ? 4 : 2; for (let k = 0; k < n; k++) e.data.fl.push(FIRE.add(e.pos.x + U.rand(-0.6, 0.6), e.pos.y + (e.type === 'tree' ? 2 + Math.random() * 2 : 0.3), e.pos.z + U.rand(-0.6, 0.6), e.type === 'tree' ? 2.2 : 1.4));
    PF.sfx.play('fire'); return true;
  }
  function charEnt(e, steam) {
    for (const f of e.data.fl || []) FIRE.remove(f); e.data.fl = []; e.data.burn = 0;
    if (!steam) { e.data.burnt = true; e.root.traverse((o) => { if (o.isMesh) { o.material = new T.MeshStandardMaterial({ color: PF.col('#2b2420'), roughness: 1, vertexColors: false }); } }); }
    PF.fx[steam ? 'steam' : 'smoke'](e.pos.x, e.pos.y + 1, e.pos.z, 8);
  }
  FIRE.igniteAt = (x, z, rad) => {
    let n = 0;
    for (const c of FIRE.cells) if (Math.hypot(c.x - x, c.z - z) < rad) n += igniteCell(c) ? 1 : 0;
    for (const e of PF.all()) if (e.tags.has('wood') && Math.hypot(e.pos.x - x, e.pos.z - z) < rad + e.r) n += igniteEnt(e) ? 1 : 0;
    return n;
  };
  FIRE.extinguish = () => {
    let n = 0;
    for (const c of Array.from(FIRE.burning)) { burnOut(c, true); n++; }
    for (const e of PF.all()) if (e.data.burn > 0) { charEnt(e, true); n++; }
    if (n) { PF.sfx.play('steam'); PF.emit('extinguished', n); }
    return n;
  };
  FIRE.extinguishCell = (c) => { if (c && c.s === 1) burnOut(c, true); for (const e of PF.all()) if (e.data.burn > 0 && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 4) charEnt(e, true); };
  FIRE.count = () => FIRE.burning.size + PF.all().filter((e) => e.data.burn > 0).length;
  let spreadT = 0, lightT = 0, hurtT = 0;
  FIRE.update = (dt) => {
    flameMat.uniforms.time.value = PF.time;
    if (wet() && FIRE.count()) FIRE.extinguish();
    spreadT += dt;
    if (spreadT > 0.25) {
      const k = spreadT; spreadT = 0; const CS = PF.world.cellSize;
      for (const c of Array.from(FIRE.burning)) {
        c.t -= k; if (c.t <= 0) { burnOut(c); continue; }
        if (Math.random() < k * 0.55) { const dir = Math.floor(Math.random() * 4), nb = cellAt(c.x + CS * (dir === 0 ? 1 : dir === 1 ? -1 : 0), c.z + CS * (dir === 2 ? 1 : dir === 3 ? -1 : 0)); igniteCell(nb); }
        for (const e of PF.all()) if (e.tags.has('wood') && !e.data.burnt && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 2.4 && Math.random() < k * 0.3) igniteEnt(e);
        if (Math.random() < k * 2) PF.fx.embers(c.x, 0.2, c.z, 2); if (Math.random() < k * 0.8) PF.fx.smoke(c.x, 1.2, c.z, 2, '#4a433f');
      }
      for (const e of PF.all()) if (e.data.burn > 0) { e.data.burn -= k; if (Math.random() < k * 2) PF.fx.embers(e.pos.x, e.pos.y + 1.5, e.pos.z, 3); if (e.data.burn <= 0) charEnt(e); }
    }
    // el fuego quema a el protagonista
    hurtT -= dt; const P = PF.player;
    if (hurtT <= 0 && P.pos.y < 0.8) { const c = cellAt(P.pos.x, P.pos.z); if (c && c.s === 1) { hurtT = 0.6; const dx = P.pos.x - c.x, dz = P.pos.z - c.z, l = Math.hypot(dx, dz) || 1; if (PF.hurt('fire', 1, { x: (dx / l) * 7, z: (dz / l) * 7 - 3, y: 7 })) PF.say(P, PF.L('¡Quema, quema!', 'Hot, hot, hot!'), { voice: false }); } }
    // tres luces que siguen a los incendios
    lightT -= dt; const burning = Array.from(FIRE.burning);
    if (lightT <= 0) { lightT = 0.5; FIRE.lights.forEach((l, i) => { const c = burning[Math.floor((i + 0.5) / 3 * burning.length)]; if (c) { l.position.set(c.x, 1.4, c.z); l.userData.on = 1; } else l.userData.on = 0; }); }
    FIRE.lights.forEach((l) => { l.intensity = U.damp(l.intensity, (l.userData.on ? 2.2 : 0) * (0.8 + Math.random() * 0.4), 8, dt); });
  };
  PF.on('weather', ({ w }) => { if (w === 'rain' || w === 'storm' || w === 'snow') PF.after(0.8, () => FIRE.extinguish()); });

  /* ================= proyectiles ================= */
  const proj = (PF.projectiles = []);
  const GRAV = 16;
  function projMesh(kind) {
    const g = PF.grp();
    if (kind === 'fireballs') { g.add(mk(G.ico(0.42, 2), PF.mat('#ffb347', { emissive: '#ff5a10', glow: 1.5, flat: true }))); const halo = new T.Mesh(G.sph(0.72, 16, 12), new T.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false })); g.add(halo); }
    else if (kind === 'flowers') { for (let i = 0; i < 6; i++) { const m = new T.Mesh(PF.models.flowerGeo(i), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); m.scale.setScalar(1.7); m.rotation.set((i - 2.5) * 0.25, i, (i % 2 - 0.5) * 0.5); m.position.y = -0.35; g.add(m); } g.add(mk(G.tor(0.12, 0.05, 0, 12), '#ff6fb5', 0, -0.2, 0, Math.PI / 2)); }
    else if (kind === 'bubbles') g.add(new T.Mesh(G.sph(0.55, 20, 14), new T.MeshStandardMaterial({ color: PF.col('#bfe9ff'), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, envMapIntensity: 2 })));
    else if (kind === 'snowballs') g.add(mk(G.sph(0.42, 16, 12), PF.mat('#ffffff', { rough: 0.9 })));
    else if (kind === 'hearts') { const h = PF.models.heart(); h.scale.setScalar(1.2); g.add(h); }
    else { for (let i = 0; i < 8; i++) g.add(mk(G.box(0.14, 0.22, 0.02), ['#ff4d6d', '#ffd84d', '#4dd2ff', '#7fe3b0'][i % 4], U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), Math.random() * 3, Math.random() * 3, 0)); }
    PF.scene.add(g); return g;
  }
  PF.launch = (kind, from, to, tFlight) => {
    const tf = tFlight || 1.2, v = V((to.x - from.x) / tf, (to.y - from.y) / tf + 0.5 * GRAV * tf, (to.z - from.z) / tf);
    const p = { kind, pos: from.clone(), vel: v, mesh: projMesh(kind), age: 0 }; p.mesh.position.copy(from); proj.push(p);
    PF.sfx.play(kind === 'fireballs' ? 'whoosh' : 'pop'); return p;
  };
  function impact(p, hitPlayer) {
    const x = p.pos.x, z = p.pos.z, y = Math.max(0, p.pos.y), P = PF.player;
    PF.scene.remove(p.mesh);
    const near = Math.hypot(P.pos.x - x, P.pos.z - z);
    if (p.kind === 'fireballs') {
      if (wet()) { PF.fx.steam(x, y, z, 18); PF.sfx.play('steam'); return; }
      PF.fx.sparks(x, y + 0.2, z, 40); PF.fx.smoke(x, y + 0.4, z, 10); PF.sfx.play('fire'); PF.shake(0.2);
      FIRE.igniteAt(x, z, 2.3);
      if (hitPlayer || (near < 1.9 && P.pos.y < y + 2)) PF.hurt('fireball', 1, { x: (P.pos.x - x) / (near || 1) * 8, z: (P.pos.z - z) / (near || 1) * 8 - 2, y: 7 });
    } else if (p.kind === 'flowers') {
      PF.sfx.play('bloom'); PF.fx.petals(x, y + 0.3, z, 26); const n = 12 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 1.8; const gx = x + Math.cos(a) * r, gz = z + Math.sin(a) * r, gy = PF.groundAt(gx, gz, y + 1); if (gy > -5) PF.flowerAt(gx, gy, gz, i * 0.025); }
      if (hitPlayer) PF.say(P, PF.L('¡Huele a primavera!', 'Smells like spring!'), { voice: false });
      PF.emit('bloom', { x, z });
    } else if (p.kind === 'bubbles') { PF.sfx.play('pop'); PF.fx.emit(18, () => ({ at: [x + U.rand(-0.4, 0.4), y + 0.5, z + U.rand(-0.4, 0.4)], v: [U.rand(-1, 1), U.rand(1, 3), U.rand(-1, 1)], c: '#dff6ff', life: 0.8, s0: 0.3, s1: 0.05, a: 0.8 })); }
    else if (p.kind === 'snowballs') { PF.fx.poof(x, y + 0.2, z, '#ffffff', 22); for (const c of FIRE.cells) if (c.s === 1 && Math.hypot(c.x - x, c.z - z) < 2.5) burnOut(c, true); }
    else if (p.kind === 'hearts') { PF.spawn('heart', { at: V(x, Math.max(0, PF.groundAt(x, z, y + 1)), z) }); }
    else { PF.fx.confetti(60, () => ({ at: [x, y + 0.5, z], v: [U.rand(-4, 4), U.rand(3, 8), U.rand(-4, 4)], c: ['#ff4d6d', '#ffd84d', '#4dd2ff', '#7fe3b0', '#c9a8ff'][Math.floor(Math.random() * 5)], life: U.rand(3, 5) })); PF.sfx.play('confetti'); }
  }
  function updateProj(dt) {
    const P = PF.player, pc = V(P.pos.x, P.pos.y + 0.9, P.pos.z);
    for (let i = proj.length - 1; i >= 0; i--) {
      const p = proj[i]; p.age += dt; p.vel.y -= GRAV * dt; p.pos.addScaledVector(p.vel, dt); p.mesh.position.copy(p.pos); p.mesh.rotation.y += dt * 4; p.mesh.rotation.x += dt * 2;
      if (p.kind === 'fireballs') { PF.fx.embers(p.pos.x, p.pos.y - 0.3, p.pos.z, 2); if (Math.random() < 0.5) PF.fx.smoke(p.pos.x, p.pos.y, p.pos.z, 1, '#6a5f58'); }
      else if (p.kind === 'flowers' && Math.random() < dt * 14) PF.fx.petals(p.pos.x, p.pos.y, p.pos.z, 1);
      // un compañero fuerte puede devolver la bola de un puñetazo
      if (p.kind === 'fireballs' && PF.allies && PF.allies.deflect && PF.allies.deflect(p)) { proj.splice(i, 1); continue; }
      const hitP = p.pos.distanceTo(pc) < 1.0 && P.inv <= 0;
      const gy = PF.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
      if (hitP || p.pos.y <= gy + 0.15 || p.age > 6) { if (p.pos.y < gy) p.pos.y = gy; impact(p, hitP); proj.splice(i, 1); }
    }
  }

  /* ================= el Rey Volcán ================= */
  const SAY = PF.L({
    hello: ['¡Nadie cruza mi arena!', '¡Fuera de mi castillo, enano!'],
    flowers: '¿Flores? ¡¿Pero qué…?! …Huelen bien, eso sí.',
    fire: '¡Vuelven las bolas de fuego!',
    tutu: '¡¿Un tutú?! …Pues me queda divino.',
    happy: '¡Me siento… precioso! Pasa, pasa, que voy a bailar.',
    dance: ['¡Y un, dos, tres, pirueta!', '¡Mirad qué gracia!', '¡Soy la estrella del ballet!'],
    gone: '¡Nooo! ¡Mi castillooo!',
  }, {
    hello: ['Nobody crosses my arena!', 'Get out of my castle, shorty!'],
    flowers: 'Flowers? What the…?! …They do smell lovely, though.',
    fire: 'The fireballs are back!',
    tutu: 'A tutu?! …Well, I look divine.',
    happy: 'I feel… gorgeous! Go on through, I’m going to dance.',
    dance: ['And one, two, three, pirouette!', 'Look how graceful I am!', 'I’m the star of the ballet!'],
    gone: 'Nooo! My castle!',
  });
  PF.KINDS.boss = {
    make(e) {
      e.ch = PF.models.character('boss'); e.root.add(e.ch.root); e.h = e.ch.height; e.r = e.ch.radius * 0.9; e.name = e.label = PF.L('Rey Volcán', 'Volcano King');
      e.projectile = 'fireballs'; e.state = 'guard'; e.mood = 'angry'; e.yaw = Math.PI; e.throwT = 2.5; e.home = e.pos.clone(); e.data.k = 0; e.waistR = e.ch.model.rig && e.ch.model.rig.waistR;
      e.cols.push(PF.addCyl(e.pos.x, e.pos.z, e.r, e.pos.y - 1, e.pos.y + e.h + 0.6, 'boss', e));
      // en inglés, voz grave y teatral (en-GB-Harry; ver server/voice.mjs). En español, la de siempre (por semilla)
      e.voice = { name: e.name, role: 'a grumpy volcano golem king in a children\'s platform game', seed: 'boss-2', gender: 'male', cast: { en: 'en-GB-Harry' } };
      const glow = new T.PointLight(0xff6a1a, 1.6, 12, 2); glow.position.set(0, e.h * 0.48, e.r + 0.6); e.root.add(glow); e.data.glow = glow;
    },
    update(e, dt) {
      const P = PF.player, d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z), col = e.cols[0];
      const awake = P.pos.z > 157 && P.pos.z < 206 && !PF.state.won;
      if (awake && !e.data.greeted) { e.data.greeted = true; PF.say(e, SAY.hello[0], { voice: true }); }
      const tutu = !!(e.wearing && e.wearing.tutu), friendly = e.projectile !== 'fireballs';
      if (e.mood !== 'happy' && tutu && friendly) becomeHappy(e);
      let mode = 'idle', spin = 0;
      if (e.mood === 'happy') {
        // se aparta bailando hacia un lado del rastrillo
        const tx = 8.5, tz = e.home.z - 1; e.pos.x = U.damp(e.pos.x, tx, 0.9, dt); e.pos.z = U.damp(e.pos.z, tz, 0.9, dt);
        const g = PF.groundAt(e.pos.x, e.pos.z, e.pos.y + 1); if (g > -5) e.pos.y = U.damp(e.pos.y, g, 4, dt);
        mode = 'dance'; spin = PF.real && PF.real.shooting() ? 0.8 : 2.2; if (Math.random() < dt * 0.6) PF.fx.petals(e.pos.x, e.pos.y + 4, e.pos.z, 3);
        if ((e.data.bloomed || 0) < 140 && Math.random() < dt * 3) bloomAround(e, 1); // donde baila, florece
        if (PF.time > (e.data.danceSay || 0)) { e.data.danceSay = PF.time + 9; PF.say(e, SAY.dance[Math.floor(Math.random() * 3)], { voice: false }); }
      } else if (awake) {
        if (tutu) { spin = 4.5; mode = 'dance'; } else e.yaw = U.dampAngle(e.yaw, Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z), 3, dt);
        e.throwT -= dt;
        if (e.throwT <= 0 && e.state !== 'throw') { e.state = 'throw'; e.data.k = 0; }
      }
      if (e.state === 'throw') {
        e.data.k += dt / 0.7; mode = 'throw';
        if (e.data.k >= 0.55 && !e.data.thrown) { e.data.thrown = true; throwAt(e, tutu && e.mood !== 'happy'); }
        if (e.data.k >= 1) { e.state = 'guard'; e.data.thrown = false; e.throwT = friendly ? 2.6 : tutu ? 1.4 : 2.3; }
      }
      // con el GLB (esqueleto de Meshy): golpes en el pecho mientras ataca y pisotones mientras te acercas
      if (e.ch.mixer && e.mood !== 'happy' && !tutu) { if (awake && mode !== 'dance') mode = 'throw'; else if (P.pos.z > 138 && P.pos.z < 206) mode = 'angry'; }
      if (spin) e.yaw += spin * dt;
      e.root.rotation.y = e.yaw;
      if (col) { col.x = e.pos.x; col.z = e.pos.z; col.y0 = e.pos.y - 1; col.y1 = e.pos.y + e.h + 0.6; }
      if (e.data.glow) e.data.glow.intensity = (e.mood === 'happy' ? 0.6 : 1.6) + Math.sin(PF.time * 5) * 0.3;
      PF.models.animateCharacter(e.ch, { mode, speed: 0, k: e.data.k, calm: friendly, happy: e.mood === 'happy' }, dt);
      if (e.ch.rig && e.ch.rig.lava) { const L = e.ch.rig.lava; L.emissive.lerp(PF.col(friendly ? '#ff5fa8' : '#ff5a14'), 1 - Math.exp(-3 * dt)); }
    },
    remove(e) { PF.world.openGate(); PF.emit('bossGone', e); },
    // si lo eliminan, sale volando (clip «hit» del GLB o un vuelo por código) y desaparece en una nube
    vanish(e, how, done) {
      const anim = PF.models.playOnce(e.ch, 'hit', 1.5); PF.say(e, SAY.gone, { voice: false }); PF.sfx.play('punch'); PF.shake(0.6);
      const p0 = e.pos.clone(), y0 = e.root.rotation.y;
      PF.tween(anim ? 1.5 : 1.3, (k) => { if (!anim) { e.root.rotation.y = y0 + k * 10; e.pos.y = p0.y + Math.sin(k * Math.PI) * 6; e.pos.z = p0.z + k * 6; } PF.models.animateCharacter(e.ch, { mode: 'hit' }, 1 / 60); }, () => {
        PF.fx.poof(e.pos.x, e.pos.y + 3, e.pos.z, '#ffd9b8', 80); PF.fx.sparks(e.pos.x, e.pos.y + 3, e.pos.z, 40); PF.sfx.play('poof');
        PF.tween(0.3, (k) => e.root.scale.setScalar(Math.max(0.001, 1 - k)), done);
      });
    },
  };
  function throwAt(e, wild) {
    const P = PF.player, s = Math.sin(e.yaw), c = Math.cos(e.yaw), k = e.h / 6.3;
    const from = V(e.pos.x + (c * -1.9 + s * 1.2) * k, e.pos.y + 5.6 * k, e.pos.z + (s * 1.9 + c * 1.2) * k);
    let to;
    if (wild && Math.random() < 0.6) { const a = Math.random() * 6.283, r = 5 + Math.random() * 14; to = V(e.pos.x + Math.cos(a) * r, 0, e.pos.z - Math.abs(Math.sin(a)) * r); }
    else { const lead = 0.9; to = V(P.pos.x + P.vel.x * lead + U.rand(-1, 1), Math.max(0, P.pos.y), P.pos.z + P.vel.z * lead + U.rand(-1, 1)); }
    const gy = PF.groundAt(to.x, to.z, 20); to.y = gy > -5 ? gy : 0;
    PF.launch(e.projectile, from, to, 1.05 + from.distanceTo(to) / 45);
  }
  // flores alrededor de sus pies (las mismas que florecen donde caen las que lanza)
  function bloomAround(e, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = 1.5 + Math.sqrt(Math.random()) * 3.4, x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r, gy = PF.groundAt(x, z, e.pos.y + 1.5); if (gy > -5) PF.flowerAt(x, gy, z, i * 0.05); }
    e.data.bloomed = (e.data.bloomed || 0) + n;
  }
  function becomeHappy(e) {
    e.mood = 'happy'; e.state = 'guard'; bloomAround(e, 24);
    PF.say(e, SAY.happy, { voice: true }); PF.sfx.play('fanfare');
    PF.after(1.2, () => { PF.world.openGate(); PF.toast && PF.toast(PF.L('El Rey Volcán se aparta: ¡el rastrillo está abierto!', 'The Volcano King steps aside: the gate is open!')); });
    const pr = PF.get('princess'); if (pr && pr.state === 'caged') PF.after(2.4, () => PF.say(pr, PF.L('¡Bravo! ¡Qué bien baila!', 'Bravo! What a dancer!'), { voice: false }));
    PF.emit('bossHappy', e);
  }
  PF.boss = {
    setProjectile(e, kind) {
      if (!e) return false; const prev = e.projectile; e.projectile = kind;
      if (prev !== kind) { PF.fx.magic(e.pos.x, e.pos.y + 3, e.pos.z, 60, kind === 'fireballs' ? '#ff9a3c' : '#ffb3d9'); PF.sfx.play('sparkle'); PF.say(e, kind === 'fireballs' ? SAY.fire : kind === 'flowers' ? SAY.flowers : PF.L('¡Ahora lanzo ' + ({ bubbles: 'pompas', snowballs: 'bolas de nieve', confetti: 'confeti', hearts: 'corazones' }[kind] || kind) + '!', 'Now I throw ' + kind + '!'), { voice: true }); e.throwT = Math.min(e.throwT, 1.2); }
      PF.emit('projectile', { e, kind }); return true;
    },
  };
  PF.on('wear', ({ e, item }) => { if (e.type === 'boss' && item === 'tutu') { PF.after(0.6, () => PF.say(e, SAY.tutu, { voice: true })); const pr = PF.get('princess'); if (pr) PF.after(2.2, () => PF.say(pr, PF.L('¡Jajaja! ¡Qué tutú tan bonito!', 'Hahaha! What a pretty tutu!'), { voice: false })); } });

  PF.initBoss = () => {
    FIRE.ensure(); initCells();
    const b = PF.spawn('boss', { id: 'boss', at: V(PF.level.bossAt[0], PF.level.bossAt[1], PF.level.bossAt[2]) });
    return b;
  };
  PF.updateBoss = (dt) => { updateProj(dt); FIRE.update(dt); };
})();
