/* Plataformas 3D · actores: entidades, el protagonista (control y física), cámara de persecución y las piezas con las que se
   juega (enemigos, princesa, escalera, charco, tiburón, puente y el resto del catálogo). */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U, G = PF.G, mk = PF.mk;
  const V = (x, y, z) => new T.Vector3(x, y, z);

  /* ================= entidades ================= */
  const ents = (PF.ents = new Map());
  const seq = {};
  PF.newId = (type) => { seq[type] = (seq[type] || 0) + 1; return type + seq[type]; };
  const LABEL = PF.L({ enemy: 'Gruñón', wall: 'muro', ladder: 'escalera', puddle: 'charco', shark: 'tiburón', bridge: 'puente', boss: 'Rey Volcán', princess: 'Princesa Lúa', spring: 'muelle', platform: 'plataforma', crate: 'caja', gem: 'gema', heart: 'corazón', tree: 'árbol', flowers: 'flores', rock: 'roca', lantern: 'farol', balloon: 'globo', campfire: 'hoguera', fence: 'valla', invented: 'invento', companion: 'compañero', player: PF.NAME },
    { enemy: 'Grumble', wall: 'wall', ladder: 'ladder', puddle: 'puddle', shark: 'shark', bridge: 'bridge', boss: 'Volcano King', princess: 'Princess Lúa', spring: 'spring', platform: 'platform', crate: 'crate', gem: 'gem', heart: 'heart', tree: 'tree', flowers: 'flowers', rock: 'rock', lantern: 'lantern', balloon: 'balloon', campfire: 'campfire', fence: 'fence', invented: 'invention', companion: 'companion', player: PF.NAME });
  PF.LABEL = LABEL;
  PF.KINDS = {};
  PF.spawn = (type, o) => {
    o = o || {};
    const K = PF.KINDS[type]; if (!K) throw new Error('tipo desconocido: ' + type);
    const e = { id: o.id || PF.newId(type), type, label: o.label || LABEL[type] || type, name: o.name || null, root: PF.grp(), alive: true, born: PF.time, r: 0.5, h: 1, data: {}, cols: [], extras: [], tags: new Set(o.tags || []) };
    e.pos = e.root.position; if (o.at) e.pos.copy(o.at);
    PF.scene.add(e.root); ents.set(e.id, e);
    K.make(e, o);
    PF.emit('spawn', e);
    return e;
  };
  PF.kill = (e, how) => {
    if (!e || !e.alive) return false; e.alive = false;
    const K = PF.KINDS[e.type]; for (const c of e.cols) PF.dropCollider(c); e.cols = [];
    if (K && K.remove) try { K.remove(e, how); } catch (x) { console.warn(x); }
    const done = () => { PF.scene.remove(e.root); ents.delete(e.id); };
    if (K && K.vanish && how !== 'silent') { K.vanish(e, how, done); PF.emit('kill', { e, how }); return true; }
    if (how === 'poof') { const c = e.pos.clone(); PF.fx.poof(c.x, c.y + e.h * 0.5, c.z, '#ffffff', 30 + e.h * 6); PF.sfx.play('poof'); PF.shake(0.25); const s0 = e.root.scale.clone(); PF.tween(0.28, (k) => e.root.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 + k * 0.25 - U.smooth(k) * 1.25)), done); }
    else if (how === 'keep') { ents.delete(e.id); }
    else done();
    PF.emit('kill', { e, how });
    return true;
  };
  PF.get = (id) => { const e = ents.get(id); return e && e.alive ? e : null; };
  PF.all = (type) => Array.from(ents.values()).filter((e) => e.alive && (!type || e.type === type));

  /* ================= el protagonista (PF.NAME) ================= */
  const P = (PF.player = { id: 'player', type: 'player', label: PF.NAME, name: PF.NAME, pos: V(0, 0, 2), vel: V(), yaw: 0, r: 0.38, h: 1.5, onGround: true, coyote: 0, jumpBuf: 0, hearts: 3, maxHearts: 3, inv: 0, gems: 0, cp: 0, climb: null, ride: null, alive: true, squash: 1, sqV: 0, mode: 'idle', lastSafe: V(0, 0, 2), stuckT: 0, bestZ: 0, carried: null, frozen: false });
  PF.initPlayer = () => {
    P.ch = PF.models.character('hero'); P.root = P.ch.root; PF.scene.add(P.root); P.root.position.copy(P.pos);
    const blob = new T.Mesh(new T.CircleGeometry(0.42, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })); blob.rotation.x = -Math.PI / 2; PF.scene.add(blob); P.blob = blob;
  };
  const GRAV = 30, JUMP_V = 9.6, WALK = 5.2, RUN = 8.6, STEP = 0.46;
  function overlapBox(b, c, x, y, z) { return x + b.r > c.min[0] && x - b.r < c.max[0] && z + b.r > c.min[2] && z - b.r < c.max[2] && y + b.h > c.min[1] + 0.001 && y < c.max[1] - 0.001; }
  function headroom(b, x, y, z) { for (const c of PF.solids) if (c.on && overlapBox(b, c, x, y, z)) return false; return true; }
  // mueve un cuerpo (cilindro vertical aproximado por su caja) contra cajas y cilindros, eje a eje
  PF.moveBody = (b, dt) => {
    const nx = b.pos.x + b.vel.x * dt, nz = b.pos.z + b.vel.z * dt;
    for (const axis of [0, 2]) {
      const px = b.pos.x, pz = b.pos.z;
      if (axis === 0) b.pos.x = nx; else b.pos.z = nz;
      for (const c of PF.solids) {
        if (!c.on || c.tag === 'ghost' || !overlapBox(b, c, b.pos.x, b.pos.y, b.pos.z)) continue;
        const rise = c.max[1] - b.pos.y;
        if ((b.onGround || b.coyote > 0) && rise > 0 && rise <= STEP && headroom(b, b.pos.x, c.max[1] + 0.01, b.pos.z)) { b.pos.y = c.max[1]; continue; }
        if (axis === 0) { if (px + b.r <= c.min[0] + 0.01) b.pos.x = c.min[0] - b.r - 1e-4; else if (px - b.r >= c.max[0] - 0.01) b.pos.x = c.max[0] + b.r + 1e-4; else b.pos.x = px; b.vel.x = 0; }
        else { if (pz + b.r <= c.min[2] + 0.01) b.pos.z = c.min[2] - b.r - 1e-4; else if (pz - b.r >= c.max[2] - 0.01) b.pos.z = c.max[2] + b.r + 1e-4; else b.pos.z = pz; b.vel.z = 0; }
        b.blockedBy = c;
      }
    }
    for (const c of PF.cyls) {
      if (!c.on || c.ent === b.self || b.pos.y + b.h <= c.y0 || b.pos.y >= c.y1 - 0.02) continue;
      const dx = b.pos.x - c.x, dz = b.pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + b.r;
      if (d >= m) continue;
      const ux = d > 1e-4 ? dx / d : 0, uz = d > 1e-4 ? dz / d : -1;
      b.pos.x = c.x + ux * (m + 1e-3); b.pos.z = c.z + uz * (m + 1e-3);
      const vn = b.vel.x * ux + b.vel.z * uz; if (vn < 0) { b.vel.x -= vn * ux; b.vel.z -= vn * uz; }
      b.blockedBy = c;
    }
    // vertical
    const y0 = b.pos.y, ny = y0 + b.vel.y * dt; let land = null, ceil = null;
    for (const c of PF.solids) {
      if (!c.on || c.tag === 'ghost') continue;
      if (!(b.pos.x + b.r * 0.85 > c.min[0] && b.pos.x - b.r * 0.85 < c.max[0] && b.pos.z + b.r * 0.85 > c.min[2] && b.pos.z - b.r * 0.85 < c.max[2])) continue;
      if (b.vel.y <= 0 && c.max[1] <= y0 + 0.05 && c.max[1] >= ny - 0.001) { if (land === null || c.max[1] > land) land = c.max[1]; }
      if (b.vel.y > 0 && c.min[1] >= y0 + b.h - 0.05 && c.min[1] <= ny + b.h) { if (ceil === null || c.min[1] < ceil) ceil = c.min[1]; }
    }
    const was = b.onGround;
    if (land !== null) { b.pos.y = land; if (!was && b.vel.y < -4 && b.onLand) b.onLand(-b.vel.y); b.vel.y = 0; b.onGround = true; }
    else if (ceil !== null) { b.pos.y = ceil - b.h - 0.001; b.vel.y = Math.min(0, b.vel.y) * 0.2; b.onGround = false; }
    else { b.pos.y = ny; b.onGround = false; }
  };

  // dirección de la cámara → entrada en el mundo
  PF.facing = () => V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  PF.hurt = (src, dmg, push) => {
    if (P.inv > 0 || P.frozen || PF.state.won) return false;
    P.hearts -= dmg || 1; P.inv = 1.3; PF.sfx.play('hurt'); PF.shake(0.4); PF.emit('hurt', { src, hearts: P.hearts });
    if (push) { P.vel.x = push.x; P.vel.z = push.z; P.vel.y = push.y != null ? push.y : 6; P.onGround = false; P.climb = null; }
    if (P.hearts <= 0) { P.frozen = true; P.vel.set(0, 0, 0); const anim = PF.models.playOnce(P.ch, 'hit', 1.4); PF.after(anim ? 1.45 : 0.8, () => { P.frozen = false; PF.respawn(true); }); }
    return true;
  };
  PF.respawn = (dead) => {
    const cp = PF.level.checkpoints[P.cp] || PF.level.checkpoints[0];
    P.pos.set(cp[0], cp[1], cp[2]); P.vel.set(0, 0, 0); P.climb = null; P.ride = null; P.carried = null; P.onGround = true; P.inv = 1.5;
    if (dead || P.hearts <= 0) P.hearts = P.maxHearts;
    PF.fx.magic(P.pos.x, P.pos.y, P.pos.z, 30); PF.cam.snap(); PF.emit('respawn', {});
  };
  PF.shake = (k) => { PF.cam.shakeK = Math.max(PF.cam.shakeK, k); };

  PF.climbables = [];
  function updatePlayer(dt, inp) {
    if (P.inv > 0) P.inv -= dt;
    if (P.frozen) { P.vel.set(0, 0, 0); return; }
    // entrada relativa a la cámara
    const cy = PF.cam.yaw, fwd = V(Math.sin(cy), 0, Math.cos(cy)), right = V(-Math.cos(cy), 0, Math.sin(cy));
    const f = inp.f, s = inp.s; const mv = inp.wx != null ? V(inp.wx, 0, inp.wz) : fwd.clone().multiplyScalar(f).add(right.multiplyScalar(s)); const ml = Math.min(1, mv.length()); if (ml > 0.01) mv.normalize();
    // montado en un compañero o llevado por otro: él manda
    if (P.carried) { P.vel.set(0, 0, 0); P.onGround = false; return; }
    if (P.ride) { P.onGround = true; P.vel.set(0, 0, 0); if (inp.jump) { const r = P.ride; P.ride = null; if (r.data) r.data.rider = null; P.vel.y = JUMP_V; PF.sfx.play('jump'); } return; }
    // escaleras
    if (P.climb) {
      const L = P.climb; P.vel.set(0, 0, 0);
      const toward = ml > 0.2 ? mv.x * Math.sin(L.yaw) + mv.z * Math.cos(L.yaw) : 0;
      const up = (toward > 0.3 ? 1 : toward < -0.3 ? -1 : 0) || (inp.jumpHeld ? 1 : 0);
      P.pos.y += up * 3.4 * dt; P.mode = 'climb'; P.speed = Math.abs(up) * 3;
      const k = U.clamp(P.pos.y / Math.max(0.1, L.topY), 0, 1); P.pos.x = U.damp(P.pos.x, L.x, 12, dt); P.pos.z = U.damp(P.pos.z, L.zb + (L.zt - L.zb) * k, 12, dt); P.yaw = L.yaw;
      if (up > 0 && !P.clankT) { PF.sfx.play('clank'); P.clankT = 0.5; } if (P.clankT) P.clankT = Math.max(0, P.clankT - dt) || 0;
      if (P.pos.y >= L.topY - 0.12) { P.pos.set(L.x, L.topY + 0.02, L.exitZ); P.climb = null; P.onGround = true; P.vel.set(0, 0, 0); PF.fx.dust(P.pos.x, P.pos.y, P.pos.z); PF.emit('climbed', L); }
      else if (P.pos.y <= 0.02 && up < 0) { P.climb = null; P.pos.y = Math.max(P.pos.y, 0); }
      if (inp.jump && P.climb && P.pos.y < 0.4) { P.climb = null; P.vel.set(-Math.sin(L.yaw) * 3, 6, -Math.cos(L.yaw) * 3); }
      return;
    }
    for (const L of PF.climbables) {
      if (!L.on) continue;
      if (P.pos.x > L.x0 && P.pos.x < L.x1 && P.pos.z > L.z0 && P.pos.z < L.z1 && P.pos.y >= L.y0 && P.pos.y < L.topY - 0.3) {
        const toward = mv.x * Math.sin(L.yaw) + mv.z * Math.cos(L.yaw);
        if ((ml > 0.2 && toward > 0.35) || (inp.jumpHeld && P.onGround)) { P.climb = L; P.vel.set(0, 0, 0); return; }
      }
    }
    // horizontal
    const run = inp.run, maxV = (run ? RUN : WALK) * (P.slow || 1);
    const tx = mv.x * maxV * ml, tz = mv.z * maxV * ml;
    const acc = P.onGround ? (ml > 0.01 ? 48 : 38) : 20;
    const dvx = tx - P.vel.x, dvz = tz - P.vel.z, dl = Math.hypot(dvx, dvz), st = Math.min(dl, acc * dt);
    if (dl > 1e-4) { P.vel.x += (dvx / dl) * st; P.vel.z += (dvz / dl) * st; }
    if (ml > 0.05) P.yaw = U.dampAngle(P.yaw, Math.atan2(mv.x, mv.z), 14, dt);
    // salto con margen (coyote) y memoria de pulsación
    if (inp.jump) P.jumpBuf = 0.14; else P.jumpBuf = Math.max(0, P.jumpBuf - dt);
    if (P.onGround) P.coyote = 0.12; else P.coyote = Math.max(0, P.coyote - dt);
    if (P.jumpBuf > 0 && P.coyote > 0) { P.vel.y = JUMP_V * (P.jumpBoost || 1); P.onGround = false; P.coyote = 0; P.jumpBuf = 0; PF.sfx.play('jump'); P.sqV = 2.2; PF.fx.dust(P.pos.x, P.pos.y, P.pos.z, 6); PF.emit('jump', {}); }
    const g = P.vel.y > 0 && inp.jumpHeld ? GRAV * 0.6 : GRAV;
    P.vel.y = Math.max(-32, P.vel.y - g * dt);
    P.self = null; P.blockedBy = null;
    const wasGround = P.onGround;
    PF.moveBody(P, dt);
    if (!wasGround && P.onGround) { PF.sfx.play('land'); PF.fx.dust(P.pos.x, P.pos.y, P.pos.z, 8); P.sqV = -2.6; }
    const hs = Math.hypot(P.vel.x, P.vel.z); P.speed = hs;
    P.mode = !P.onGround ? (P.vel.y > 0 ? 'jump' : 'fall') : hs > 3.8 ? 'run' : hs > 0.4 ? 'walk' : 'idle';
    if (P.onGround && P.pos.y > -1) P.lastSafe.copy(P.pos);
    if (P.pos.y < -16) { P.hearts -= 1; PF.sfx.play('hurt'); PF.respawn(P.hearts <= 0); }
    // puntos de control
    const cps = PF.level.checkpoints; for (let i = P.cp + 1; i < cps.length; i++) if (P.pos.z > cps[i][2] - 1 && P.onGround && Math.abs(P.pos.y - cps[i][1]) < 1.5) { P.cp = i; PF.emit('checkpoint', i); }
    if (P.pos.z > P.bestZ) P.bestZ = P.pos.z;
  }
  function animatePlayer(dt) {
    // estirar y encoger (squash & stretch) con un muelle
    P.sqV += (-(P.squash - 1) * 220 - P.sqV * 14) * dt; P.squash = U.clamp(P.squash + P.sqV * dt, 0.7, 1.3);
    const sy = P.squash, sxz = 1 / Math.sqrt(sy);
    P.root.position.copy(P.pos); P.root.rotation.y = P.yaw; P.root.scale.set(sxz, sy, sxz);
    P.root.visible = !(P.inv > 0 && Math.floor(P.inv * 12) % 2 === 0 && P.inv < 1.25);
    PF.models.animateCharacter(P.ch, { mode: P.mode, speed: P.speed || 0 }, dt);
    const gy = PF.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.1); P.blob.visible = gy > -50 && !P.climb; if (P.blob.visible) { P.blob.position.set(P.pos.x, gy + 0.02, P.pos.z); const hgt = Math.max(0, P.pos.y - gy); P.blob.scale.setScalar(U.clamp(1 - hgt * 0.12, 0.3, 1)); P.blob.material.opacity = 0.22 * U.clamp(1 - hgt * 0.15, 0.2, 1); }
  }

  /* ================= cámara de persecución ================= */
  const C = (PF.cam = { yaw: 0, pitch: 0.32, dist: 8.2, shakeK: 0, mode: 'follow', idleT: 9, pos: V(0, 4, -6), look: V(0, 1.5, 2), override: null });
  C.snap = () => { C.yaw = P.yaw; C.pos.copy(P.pos).add(V(-Math.sin(C.yaw) * C.dist, 3.2, -Math.cos(C.yaw) * C.dist)); C.look.copy(P.pos).add(V(0, 1.5, 0)); };
  function rayBoxes(o, d, maxT) {
    let best = maxT;
    for (const c of PF.solids) {
      if (!c.on) continue;
      let t0 = 0, t1 = best, ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
        if (Math.abs(da) < 1e-6) { if (oa < c.min[a] || oa > c.max[a]) ok = false; continue; }
        let ta = (c.min[a] - oa) / da, tb = (c.max[a] - oa) / da; if (ta > tb) { const q = ta; ta = tb; tb = q; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
      }
      if (ok && t0 > 0.05 && t0 < best) best = t0;
    }
    return best;
  }
  function updateCamera(dt, inp) {
    const IN = PF.input;
    if (C.override) { C.override(dt); return; }
    if (IN.dx || IN.dy) { C.yaw -= IN.dx * 0.0055; C.pitch = U.clamp(C.pitch + IN.dy * 0.004, -0.25, 1.25); C.idleT = 0; IN.dx = IN.dy = 0; } else C.idleT += dt;
    if (IN.wheel) { C.dist = U.clamp(C.dist * (1 + IN.wheel * 0.0012), 4, 18); IN.wheel = 0; }
    // la cámara vuelve sola detrás de el protagonista cuando avanza (bueno para el vídeo)
    if (C.idleT > 1.4 && P.speed > 1 && !P.climb) { const h = Math.atan2(P.vel.x, P.vel.z), d = U.wrapAngle(h - C.yaw); if (Math.abs(d) < 2.3) C.yaw = U.dampAngle(C.yaw, h, 1.1, dt); }
    if (C.idleT > 4 && !P.climb) C.pitch = U.damp(C.pitch, 0.3, 0.6, dt);
    const tgt = P.pos.clone().add(V(0, 1.45, 0)); if (P.ride) tgt.y += 0.6;
    const fw = V(Math.sin(C.yaw) * Math.cos(C.pitch), -Math.sin(C.pitch), Math.cos(C.yaw) * Math.cos(C.pitch));
    let dist = C.dist; const back = fw.clone().negate(); dist = Math.min(dist, rayBoxes(tgt, back, dist) - 0.35);
    dist = Math.max(1.6, dist);
    const want = tgt.clone().addScaledVector(back, dist);
    const gy = PF.groundAt(want.x, want.z, want.y + 2); if (want.y < gy + 0.5) want.y = gy + 0.5;
    C.pos.lerp(want, 1 - Math.exp(-12 * dt));
    const look = tgt.clone().add(V(P.vel.x * 0.12, 0, P.vel.z * 0.12)); C.look.lerp(look, 1 - Math.exp(-10 * dt));
    applyCam(dt);
  }
  function applyCam(dt) {
    const cam = PF.camera; cam.position.copy(C.pos);
    if (C.shakeK > 0.001) { const k = C.shakeK * C.shakeK; cam.position.x += (Math.random() - 0.5) * k * 0.9; cam.position.y += (Math.random() - 0.5) * k * 0.9; cam.position.z += (Math.random() - 0.5) * k * 0.9; C.shakeK = Math.max(0, C.shakeK - dt * 1.6); }
    cam.lookAt(C.look);
  }
  C.apply = applyCam;

  /* ================= enemigos: Gruñón ================= */
  /* ================= enemigos: duendecillos de brasa ================= 
     Son pequeños (por la cintura del protagonista), pero guardan el paso estrecho con un anillo de brasas tan ancho como
     el camino: no se puede rodear ni saltar. */
  function aura(e) {
    if (!PF.fire || !PF.fire.ensure) return; PF.fire.ensure();
    const n = 14, R = Math.max(0.6, e.r - 0.25); e.data.aura = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const f = PF.fire.add(e.pos.x + Math.cos(a) * R, e.pos.y, e.pos.z + Math.sin(a) * R, 0.75 + (i % 3) * 0.12); if (f != null) e.data.aura.push({ f, a, R }); }
  }
  function clearAura(e) { for (const q of e.data.aura || []) PF.fire.remove(q.f); e.data.aura = []; }
  PF.KINDS.enemy = {
    make(e, o) {
      e.ch = PF.models.character('enemy'); e.root.add(e.ch.root); e.h = e.ch.height; e.r = o.guardR || 1.75; e.name = o.name || LABEL.enemy;
      // el cilindro de choque cubre el anillo de brasas y es más alto que un salto
      e.cols.push(PF.addCyl(e.pos.x, e.pos.z, e.r, e.pos.y - 0.5, e.pos.y + 3.2, 'enemy', e)); e.home = e.pos.clone(); e.state = 'guard'; e.yaw = Math.PI; e.mood = 0;
      e.root.rotation.y = e.yaw; e.hp = 3; aura(e);
    },
    update(e, dt) {
      const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z), col = e.cols[0];
      e.inWater = !!PF.all('puddle').find((p) => p.contains(e.pos.x, e.pos.z));
      if (e.state === 'doomed' && e.data.aura && e.data.aura.length) clearAura(e);
      if (e.state === 'guard' || e.state === 'chase') {
        let goal = e.home;
        if (e.state === 'chase' && e.data.lure && e.data.lure.alive !== false) { goal = e.data.lure.pos; if (Math.hypot(goal.x - e.pos.x, goal.z - e.pos.z) > 0.8) { const dx = goal.x - e.pos.x, dz = goal.z - e.pos.z, l = Math.hypot(dx, dz); e.pos.x += (dx / l) * 2.4 * dt; e.pos.z += (dz / l) * 2.4 * dt; e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 6, dt); } }
        else if (d < 16) e.yaw = U.dampAngle(e.yaw, Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z), 4, dt);
        e.mood = U.damp(e.mood, d < 12 ? 1 : 0, 3, dt);
        if (d < 9 && Math.random() < dt * 0.25) PF.sfx.play('grr');
        if (e.inWater && Math.random() < dt * 3) PF.fx.steam(e.pos.x + U.rand(-0.6, 0.6), 0.05, e.pos.z + U.rand(-0.6, 0.6), 2);
        if (Math.random() < dt * 4) PF.fx.embers(e.pos.x, e.pos.y + 0.3, e.pos.z, 1);
        // contacto con el anillo de brasas: quema y te empuja
        if (d < e.r + P.r + 0.12 && P.pos.y < e.pos.y + 3) { const ux = (P.pos.x - e.pos.x) / (d || 1), uz = (P.pos.z - e.pos.z) / (d || 1); if (PF.hurt(e, 1, { x: ux * 8, z: uz * 8 - 2, y: 6 })) { e.data.bump = 0.3; PF.say(e, PF.L(['¡Grrr! ¡Por aquí no se pasa!', '¡Fuera de mi paso!', '¡Ni lo sueñes!'], ['Grrr! Nobody gets past here!', 'Out of my pass!', 'Don’t even think about it!'])[Math.floor(Math.random() * 3)], { voice: false }); } }
        const ring = e.state === 'chase' ? Math.min(0.7, e.r) : null; // si le distraen, recoge sus brasas
        for (const q of e.data.aura || []) { const R = ring || q.R; PF.fire.move(q.f, e.pos.x + Math.cos(q.a + PF.time * 0.6) * R, e.pos.y, e.pos.z + Math.sin(q.a + PF.time * 0.6) * R); }
      }
      if (col) { col.x = e.pos.x; col.z = e.pos.z; }
      e.root.rotation.y = e.yaw;
      if (e.data.bump > 0) { e.data.bump -= dt; e.root.scale.setScalar(1 + Math.sin(e.data.bump * 30) * 0.08); } else e.root.scale.setScalar(1);
      if (e.state !== 'doomed') PF.models.animateCharacter(e.ch, { mode: e.state === 'chase' ? 'walk' : e.mood > 0.5 ? 'angry' : 'idle', speed: e.state === 'chase' ? 2.4 : 0, angry: e.mood > 0.5 }, dt);
      else PF.models.animateCharacter(e.ch, { mode: 'hit' }, dt);
    },
    remove(e) { clearAura(e); },
    // «elimina a este enemigo»: sale volando (clip «hit» del GLB, o por código) y desaparece en una nube
    vanish(e, how, done) {
      if (how === 'eaten') { done(); return; }
      PF.models.playOnce(e.ch, 'hit', 1.5);
      const p0 = e.pos.clone(), side = P.pos.x <= e.pos.x ? 1 : -1, r0 = e.root.rotation.z;
      PF.sfx.play('punch'); PF.shake(0.35); PF.fx.sparks(p0.x, p0.y + 0.5, p0.z, 30); PF.fx.poof(p0.x, p0.y + 0.4, p0.z, '#ffd9b8', 16);
      PF.tween(1.15, (k) => { e.pos.set(p0.x + side * k * 3.5, p0.y + Math.sin(k * Math.PI * 0.85) * 3.8, p0.z + k * 4); e.root.rotation.z = r0 + side * k * 7; PF.models.animateCharacter(e.ch, { mode: 'hit' }, 1 / 60); }, () => {
        PF.fx.poof(e.pos.x, e.pos.y + 0.3, e.pos.z, '#fff3a8', 34); PF.fx.sparks(e.pos.x, e.pos.y + 0.3, e.pos.z, 24); PF.sfx.play('poof');
        PF.tween(0.25, (k) => e.root.scale.setScalar(Math.max(0.001, 1 - k)), done);
      });
    },
  };

  /* ================= princesa Lúa ================= */
  PF.KINDS.princess = {
    make(e) { e.ch = PF.models.character('princess'); e.root.add(e.ch.root); e.r = e.ch.radius; e.h = e.ch.height; e.name = 'Lúa'; e.state = 'caged'; e.yaw = Math.PI; e.data.callT = 0; },
    update(e, dt) {
      let mode = 'idle', speed = 0;
      if (e.state === 'caged') {
        e.root.rotation.y = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
        const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
        if (d < 48 && PF.time > e.data.callT) { e.data.callT = PF.time + 16; PF.say(e, PF.L(['¡' + PF.NAME + '! ¡Aquí arriba!', '¡Sácame de esta jaula!', '¡Dile a Plató que me baje!'], [PF.NAME + '! Up here!', 'Get me out of this cage!', 'Tell Plató to get me down!'])[Math.floor(Math.random() * 3)], { voice: !e.data.spoke }); e.data.spoke = true; }
        mode = d < 48 ? 'cheer' : 'idle';
      } else if (e.state === 'follow') {
        const r = PF.follow(e, P, 1.7, -1.2, dt, 6.5); mode = r.mode === 'idle' && e.data.happy ? 'cheer' : r.mode; speed = r.speed;
      } else if (e.state === 'goal') mode = 'cheer';
      PF.models.animateCharacter(e.ch, { mode, speed }, dt);
    },
  };
  // seguir a alguien: colocarse a un lado y un poco detrás; si se queda atrás o hay desnivel, da un salto hasta él
  PF.follow = (e, lead, side, back, dt, speed) => {
    const fy = lead.yaw != null ? lead.yaw : 0, rx = -Math.cos(fy), rz = Math.sin(fy);
    const tx = lead.pos.x + rx * side + Math.sin(fy) * back, tz = lead.pos.z + rz * side + Math.cos(fy) * back;
    if (e.data.leap) { const L = e.data.leap; L.t += dt / L.dur; const k = Math.min(1, L.t); e.pos.lerpVectors(L.a, L.b, k); e.pos.y += Math.sin(k * Math.PI) * L.hgt; if (k >= 1) { e.data.leap = null; PF.fx.dust(e.pos.x, e.pos.y, e.pos.z, 6); } e.root.rotation.y = Math.atan2(L.b.x - L.a.x, L.b.z - L.a.z); return { mode: 'jump', speed: 4 }; }
    const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
    const gy = PF.groundAt(tx, tz, lead.pos.y + 0.6);
    if (d > 12 || Math.abs(lead.pos.y - e.pos.y) > 1.2 && d > 1 && lead.onGround !== false) {
      const b = V(tx, gy > -50 ? gy : lead.pos.y, tz); e.data.leap = { a: e.pos.clone(), b, t: 0, dur: U.clamp(d / 14, 0.45, 1.1), hgt: 2 + Math.max(0, b.y - e.pos.y) }; PF.sfx.play('boing'); return { mode: 'jump', speed: 4 };
    }
    if (d > 0.35) { const sp = Math.min(speed * (d > 4 ? 1.4 : 1), d * 4); e.pos.x += (dx / d) * sp * dt; e.pos.z += (dz / d) * sp * dt; e.root.rotation.y = U.dampAngle(e.root.rotation.y, Math.atan2(dx, dz), 8, dt); const g2 = PF.groundAt(e.pos.x, e.pos.z, e.pos.y + 0.6); if (g2 > -50) e.pos.y = U.damp(e.pos.y, g2, 20, dt); return { mode: sp > 5.5 ? 'run' : 'walk', speed: sp }; }
    e.root.rotation.y = U.dampAngle(e.root.rotation.y, fy, 4, dt);
    return { mode: 'idle', speed: 0 };
  };

  /* ================= escalera: se apoya en el muro que te corta el paso ================= */
  PF.KINDS.ladder = {
    make(e, o) {
      const h = o.h || 5.5, lean = 0.95, len = Math.hypot(h, lean) + 0.5, zw = o.zFace, x = o.x;
      const L = PF.models.ladder(len); e.root.add(L.root); e.r = 0.6; e.h = h;
      e.pos.set(x, 0, zw - lean); e.root.rotation.x = Math.atan2(lean, h);
      const yaw = o.yaw || 0;
      e.climb = { on: true, x, x0: x - 0.75, x1: x + 0.75, z0: zw - lean - 0.9, z1: zw + 0.05, y0: -0.6, topY: h, zb: zw - lean - 0.35, zt: zw - 0.35, exitZ: zw + 0.9, yaw, ent: e };
      PF.climbables.push(e.climb);
      L.rungs.forEach((r, i) => { r.scale.set(0.001, 0.001, 0.001); PF.after(0.05 + i * 0.045, () => { PF.tween(0.22, (k) => r.scale.setScalar(Math.max(0.001, U.outBack(k)))); if (i % 3 === 0) PF.sfx.play('knock'); }); });
      e.root.scale.set(1, 0.001, 1); PF.tween(0.5, (k) => e.root.scale.set(1, Math.max(0.001, U.outBack(k)), 1));
      PF.fx.dust(x, 0, zw - lean, 14); PF.fx.magic(x, h * 0.5, zw - 0.6, 26);
    },
    remove(e) { e.climb.on = false; const i = PF.climbables.indexOf(e.climb); if (i >= 0) PF.climbables.splice(i, 1); if (P.climb === e.climb) P.climb = null; },
    update() {},
  };

  /* ================= charco (y su agua animada) ================= */
  let waterNormal = null;
  function waterTex() {
    if (waterNormal) return waterNormal;
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S), hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = (x / S) * Math.PI * 2, b = (y / S) * Math.PI * 2; hgt[y * S + x] = Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * 0.5 + Math.sin(b * 4 + a) * 0.35 + Math.sin((a + b) * 5) * 0.15; }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)], hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x]; const n = V(-hx * 1.2, -hy * 1.2, 1).normalize(), i = (y * S + x) * 4; img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); waterNormal = new T.CanvasTexture(c); waterNormal.wrapS = waterNormal.wrapT = T.RepeatWrapping; return waterNormal;
  }
  PF.KINDS.puddle = {
    make(e, o) {
      const rx = o.rx || 2.2, rz = o.rz || 2.2; e.rx = rx; e.rz = rz; e.r = Math.max(rx, rz); e.h = 0.1; e.pos.y = o.y || 0;
      const nm = waterTex().clone(); nm.needsUpdate = true; nm.repeat.set(rx / 1.6, rz / 1.6);
      const wm = new T.MeshStandardMaterial({ color: PF.col('#2ea9f0'), roughness: 0.06, metalness: 0.15, normalMap: nm, normalScale: new T.Vector2(0.55, 0.55), transparent: true, opacity: 0.86, envMapIntensity: 1.4 });
      const water = new T.Mesh(new T.CircleGeometry(1, 48), wm); water.rotation.x = -Math.PI / 2; water.scale.set(rx, rz, 1); water.position.y = 0.05; water.receiveShadow = true; e.root.add(water);
      const rim = new T.Mesh(new T.RingGeometry(0.96, 1.12, 48), new T.MeshStandardMaterial({ color: PF.col('#5b4330'), roughness: 0.6, transparent: true, opacity: 0.85 })); rim.rotation.x = -Math.PI / 2; rim.scale.set(rx, rz, 1); rim.position.y = 0.045; e.root.add(rim);
      const foam = new T.Mesh(new T.RingGeometry(0.93, 0.99, 48), new T.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.7 })); foam.rotation.x = -Math.PI / 2; foam.scale.set(rx, rz, 1); foam.position.y = 0.06; e.root.add(foam);
      e.data.nm = nm; e.data.water = water;
      e.contains = (x, z, pad) => { const a = (x - e.pos.x) / (e.rx + (pad || 0)), b = (z - e.pos.z) / (e.rz + (pad || 0)); return a * a + b * b < 1; };
      e.root.scale.set(0.01, 1, 0.01); PF.tween(0.6, (k) => { const s = Math.max(0.01, U.outBack(k)); e.root.scale.set(s, 1, s); });
      PF.fx.splash(e.pos.x, 0.1, e.pos.z, 50); PF.sfx.play('splash');
    },
    update(e, dt) {
      e.data.nm.offset.x += dt * 0.05; e.data.nm.offset.y += dt * 0.03;
      const inside = e.contains(P.pos.x, P.pos.z, -0.15) && P.pos.y < 0.35 && !P.climb;
      if (inside) {
        if (Math.random() < dt * 8 && P.speed > 0.5) PF.fx.splash(P.pos.x, 0.08, P.pos.z, 5);
        P.slow = 0.7;
        if (e.shark && e.shark.alive && e.shark.state === 'swim' && Math.hypot(e.shark.pos.x - P.pos.x, e.shark.pos.z - P.pos.z) < 1.7 && !(P.ride && P.ride.type === 'companion' && P.ride.data.role === 'mount')) {
          // el tiburón muerde a quien se mete en su charco
          const sh = e.shark; const away = V(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z); if (away.lengthSq() < 0.01) away.set(0, 0, -1); away.normalize();
          const back = Math.abs(P.pos.z - e.pos.z) < 0.5 ? V(0, 0, -1) : V(0, 0, Math.sign(P.pos.z - e.pos.z));
          if (PF.hurt(sh, 1, { x: back.x * 9, z: back.z * 9, y: 8 })) { PF.KINDS.shark.snap(sh); PF.say(sh, PF.L(['¡Ñam! Ups, perdona.', '¡Este charco es MÍO!', '¡Chomp!'], ['Chomp! Oops, sorry.', 'This puddle is MINE!', 'Chomp!'])[Math.floor(Math.random() * 3)], { voice: false }); }
        }
      } else if (P.slow && !PF.all('puddle').some((p) => p.contains(P.pos.x, P.pos.z, -0.15))) P.slow = 1;
    },
  };

  /* ================= tiburón ================= */
  PF.KINDS.shark = {
    make(e, o) {
      e.ch = { model: PF.models.BUILD.shark() }; e.ch.root = e.ch.model.root; e.root.add(e.ch.root); e.r = 1.2; e.h = 1;
      e.puddle = o.puddle || null; if (e.puddle) e.puddle.shark = e;
      e.data.a = 0; e.state = 'swim'; e.name = PF.L('Tiburón', 'Shark');
      const p = e.puddle; if (p) e.pos.set(p.pos.x, -0.7, p.pos.z);
      PF.fx.splash(e.pos.x, 0.1, e.pos.z, 60); PF.sfx.play('splash');
      e.data.rise = 0; PF.tween(0.9, (k) => { e.data.rise = U.outBack(k); });
    },
    snap(e) { if (e.state === 'swim') e.data.snap = 0.6; },
    eat(e, target, done) {
      if (!target || !target.alive) return false;
      e.state = 'leap'; target.state = 'doomed'; if (target.ch) PF.models.playOnce(target.ch, 'hit', 1.5);
      const a = e.pos.clone(), tp = target.pos.clone(), hgt = (target.h || 2) * 0.6;
      PF.say(e, PF.L('¡Ñam ñam!', 'Yum yum!'), { voice: false }); PF.sfx.play('whoosh');
      const startYaw = Math.atan2(tp.x - a.x, tp.z - a.z);
      PF.fx.splash(a.x, 0.1, a.z, 50); PF.sfx.play('splash');
      let swallowed = false; const ts = target.root.scale.clone();
      PF.tween(1.5, (k) => {
        const kk = U.smooth(Math.min(1, k / 0.6)), back = U.smooth(Math.max(0, (k - 0.6) / 0.4));
        const up = Math.sin(Math.min(1, k / 0.6) * Math.PI * 0.5) * (hgt + 1.8) * (1 - back) + (-0.7) * back;
        e.pos.set(U.lerp(a.x, tp.x, kk * (1 - back * 0.5)), up, U.lerp(a.z, tp.z, kk * (1 - back * 0.5)));
        e.root.rotation.set(-0.6 * (1 - kk) + 0.5 * back, startYaw, 0); e.data.bite = k < 0.5 ? U.smooth(k / 0.45) : Math.max(0, 1 - (k - 0.5) * 6);
        if (k > 0.45 && !swallowed) { swallowed = true; PF.sfx.play('chomp'); PF.shake(0.35); }
        if (swallowed && target.alive) { const s = Math.max(0.001, 1 - U.smooth((k - 0.45) / 0.2)); target.root.scale.copy(ts).multiplyScalar(s); target.pos.lerp(V(e.pos.x, e.pos.y + 0.2, e.pos.z), 0.25); }
      }, () => {
        if (target.alive) PF.kill(target, 'eaten');
        e.state = 'swim'; e.data.bite = 0; PF.fx.splash(e.pos.x, 0.1, e.pos.z, 60); PF.sfx.play('splash');
        PF.after(0.7, () => { PF.sfx.play('burp'); PF.fx.emit(10, () => ({ at: [e.pos.x, 0.3, e.pos.z], v: [U.rand(-0.3, 0.3), U.rand(1, 2), U.rand(-0.3, 0.3)], c: '#dff6ff', life: 1.2, s0: 0.25, s1: 0.5, a: 0.8 })); });
        if (done) done();
      });
      return true;
    },
    update(e, dt) {
      const p = e.puddle; let bite = e.data.bite || 0;
      if (e.state === 'swim') {
        if (!p || !p.alive) { e.pos.y = U.damp(e.pos.y, 0.6, 3, dt); e.data.flop = (e.data.flop || 0) + dt; e.root.rotation.z = Math.sin(e.data.flop * 10) * 0.6; }
        else {
          // patrulla el charco a lo largo y, si alguien se mete en el agua, va a por él (es más rápido que quien vadea)
          const Rx = Math.max(0.3, p.rx * 0.45), Rz = Math.max(0.5, Math.max(p.rx, p.rz) - 1.0), wet = p.contains(P.pos.x, P.pos.z, -0.15) && P.pos.y < 0.35 && !P.climb && !(P.ride && P.ride.data && P.ride.data.role === 'mount');
          let tx, tz, sp;
          if (wet) { tx = P.pos.x; tz = P.pos.z; sp = 6.5; }
          else { e.data.a += dt * 2.6 / ((Rx + Rz) / 2); tx = p.pos.x + Math.cos(e.data.a) * Rx; tz = p.pos.z + Math.sin(e.data.a) * Rz; sp = 4; }
          const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
          if (d > 0.02) { const k = Math.min(sp * dt, d); let nx = e.pos.x + (dx / d) * k, nz = e.pos.z + (dz / d) * k; const qx = (nx - p.pos.x) / (p.rx * 0.9), qz = (nz - p.pos.z) / (p.rz * 0.9), q = Math.hypot(qx, qz); if (q > 1) { nx = p.pos.x + (nx - p.pos.x) / q; nz = p.pos.z + (nz - p.pos.z) / q; } if (Math.hypot(nx - e.pos.x, nz - e.pos.z) > 1e-4) e.root.rotation.set(0, U.dampAngle(e.root.rotation.y, Math.atan2(nx - e.pos.x, nz - e.pos.z), 10, dt), 0); e.pos.x = nx; e.pos.z = nz; }
          e.pos.y = -0.62 + (1 - (e.data.rise || 0)) * -0.6;
          if (e.data.snap > 0) { e.data.snap -= dt; bite = Math.sin((0.6 - e.data.snap) / 0.6 * Math.PI); e.pos.y += bite * 0.7; }
          if (Math.random() < dt * 3) PF.fx.emit(1, () => ({ at: [e.pos.x, 0.08, e.pos.z], v: [0, 0.2, 0], c: '#e8f8ff', life: 0.8, s0: 0.2, s1: 0.6, a: 0.6 }));
        }
      }
      PF.models.animate(e.ch.model, { mode: 'swim', bite }, dt);
    },
  };

  /* ================= puente (de madera o de piedra) ================= */
  PF.KINDS.bridge = {
    make(e, o) {
      const len = o.len || 10, w = o.width || 2.1, x = o.x, z = o.z, deck = 0.42;
      const B = PF.models.bridge(len, w, o.material); e.root.add(B.root); e.pos.set(x, deck - 0.06, z); e.r = len / 2; e.h = 1; e.len = len; e.material = o.material || 'wood';
      e.label = e.material === 'stone' ? PF.L('puente de piedra', 'stone bridge') : PF.L('puente de madera', 'wooden bridge');
      e.cols.push(PF.addBox(x - w / 2, -0.2, z - len / 2, x + w / 2, deck, z + len / 2, 'bridge', e));
      e.cols.push(PF.addBox(x - w / 2 - 0.12, deck, z - len / 2 + 0.3, x - w / 2 + 0.02, deck + 1.0, z + len / 2 - 0.3, 'rail', e));
      e.cols.push(PF.addBox(x + w / 2 - 0.02, deck, z - len / 2 + 0.3, x + w / 2 + 0.12, deck + 1.0, z + len / 2 - 0.3, 'rail', e));
      B.planks.forEach((pl, i) => { const y0 = pl.position.y; pl.visible = false; PF.after(i * 0.05, () => { pl.visible = true; PF.tween(0.35, (k) => { pl.position.y = y0 + (1 - U.outBack(k)) * 2.5; }); if (i % 3 === 0) PF.sfx.play('knock'); if (i % 4 === 0) PF.fx.dust(x + U.rand(-1, 1), deck, z - len / 2 + (i / B.planks.length) * len, 4); }); });
      [...B.posts, ...B.rails].forEach((q) => { q.scale.y = 0.001; PF.after(B.planks.length * 0.05, () => PF.tween(0.35, (k) => { q.scale.y = Math.max(0.001, U.outBack(k)); })); });
      PF.sfx.play('build');
    },
    update() {},
  };

  /* ================= catálogo de piezas sencillas ================= */
  const simple = (build, r, h, extra) => ({
    make(e, o) { const m = build(o, e); if (m) e.root.add(m.root || m); e.r = typeof r === 'function' ? r(o) : r; e.h = typeof h === 'function' ? h(o) : h; if (extra && extra.make) extra.make(e, o); if (o.quiet) { e.root.scale.setScalar(o.scale || 1); return; } e.root.scale.setScalar(0.01); PF.tween(0.45, (k) => e.root.scale.setScalar(Math.max(0.01, U.outBack(k)) * (o.scale || 1))); PF.fx.magic(e.pos.x, e.pos.y + 0.5, e.pos.z, 16); PF.sfx.play('pop'); },
    update: extra && extra.update ? extra.update : () => {},
  });
  PF.KINDS.spring = simple(() => { const s = PF.models.spring(); return s.root; }, 0.6, 0.85, {
    make(e) { e.cols.push(PF.addBox(e.pos.x - 0.55, e.pos.y - 0.2, e.pos.z - 0.55, e.pos.x + 0.55, e.pos.y + 0.85, e.pos.z + 0.55, 'spring', e)); },
    update(e, dt) { if (P.onGround && Math.abs(P.pos.y - (e.pos.y + 0.85)) < 0.05 && Math.abs(P.pos.x - e.pos.x) < 0.9 && Math.abs(P.pos.z - e.pos.z) < 0.9) { P.vel.y = 19.5; P.onGround = false; P.sqV = 3; PF.sfx.play('boing'); e.data.k = 1; PF.emit('bounce', e); } if (e.data.k > 0) { e.data.k = Math.max(0, e.data.k - dt * 3); e.root.scale.y = 1 - Math.sin(e.data.k * Math.PI) * 0.35; } },
  });
  PF.KINDS.crate = simple(() => PF.models.crate(), 0.6, 1.1, { make(e) { e.cols.push(PF.addBox(e.pos.x - 0.55, e.pos.y, e.pos.z - 0.55, e.pos.x + 0.55, e.pos.y + 1.1, e.pos.z + 0.55, 'crate', e)); } });
  PF.KINDS.platform = simple(() => PF.models.platform(2.6, 2.6), 1.3, 0.5, { make(e) { e.cols.push(PF.addBox(e.pos.x - 1.3, e.pos.y - 0.5, e.pos.z - 1.3, e.pos.x + 1.3, e.pos.y, e.pos.z + 1.3, 'platform', e)); } });
  PF.KINDS.rock = simple((o) => PF.models.rock(o.seed), 0.8, 1, { make(e) { e.cols.push(PF.addCyl(e.pos.x, e.pos.z, 0.75, e.pos.y, e.pos.y + 1.0, 'rock', e)); } });
  PF.KINDS.fence = simple(() => PF.models.fence(3.6), 1.8, 1, { make(e) { e.cols.push(PF.addBox(e.pos.x - 1.8, e.pos.y, e.pos.z - 0.1, e.pos.x + 1.8, e.pos.y + 1.0, e.pos.z + 0.1, 'fence', e)); } });
  PF.KINDS.lantern = simple(() => PF.models.lantern(), 0.2, 2.8, { make(e) { const l = new T.PointLight(0xffc46b, 1.2, 12, 2); l.position.y = 2.4; e.root.add(l); } });
  PF.KINDS.tree = simple(() => new T.Mesh(PF.world.treeGeo, PF.world.treeMat), 0.4, 5, { make(e) { e.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); e.cols.push(PF.addCyl(e.pos.x, e.pos.z, 0.35, e.pos.y, e.pos.y + 3, 'tree', e)); e.tags.add('wood'); } });
  PF.KINDS.balloon = simple((o) => PF.models.balloon(o.color), 0.5, 3.2, { update(e, dt) { e.root.position.y = e.data.y0 == null ? (e.data.y0 = e.pos.y) : e.data.y0 + Math.sin(PF.time * 1.5 + e.born) * 0.15; if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 0.9 && !e.data.used) { e.data.used = true; PF.sfx.play('pop'); P.vel.y = 13; P.onGround = false; PF.say(P, PF.L('¡Uuuh, vuelo!', 'Wheee, I’m flying!'), { voice: false }); PF.after(0.2, () => PF.kill(e, 'poof')); } } });
  PF.KINDS.campfire = simple(() => PF.models.campfire(), 0.7, 0.6, { make(e) { e.data.fire = PF.fire ? PF.fire.add(e.pos.x, e.pos.y + 0.2, e.pos.z, 1.1) : null; e.cols.push(PF.addCyl(e.pos.x, e.pos.z, 0.6, e.pos.y, e.pos.y + 0.6, 'campfire', e)); }, update(e) { if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 1.2 && P.pos.y < e.pos.y + 1) PF.hurt(e, 1, { x: (P.pos.x - e.pos.x) * 5, z: (P.pos.z - e.pos.z) * 5, y: 5 }); } });
  PF.KINDS.gem = {
    make(e) { const g = PF.models.gem(); e.root.add(g); e.r = 0.4; e.h = 0.8; e.data.y0 = e.pos.y + 0.8; PF.fx.magic(e.pos.x, e.pos.y + 0.5, e.pos.z, 8); },
    update(e, dt) { e.root.rotation.y += dt * 2.4; e.pos.y = e.data.y0 + Math.sin(PF.time * 3 + e.born * 7) * 0.12; if (P.pos.distanceTo(V(e.pos.x, e.pos.y - 0.4, e.pos.z)) < 1.1) { P.gems++; PF.sfx.play('gem'); PF.fx.magic(e.pos.x, e.pos.y, e.pos.z, 14, '#7fe9ff'); PF.emit('gem', P.gems); PF.kill(e, 'silent'); } },
  };
  PF.KINDS.heart = {
    make(e) { const h = PF.models.heart(); e.root.add(h); e.r = 0.4; e.h = 0.8; e.data.y0 = e.pos.y + 0.9; PF.fx.magic(e.pos.x, e.pos.y + 0.5, e.pos.z, 10, '#ff9db0'); },
    update(e, dt) { e.root.rotation.y += dt * 2; e.pos.y = e.data.y0 + Math.sin(PF.time * 3) * 0.12; if (P.pos.distanceTo(V(e.pos.x, e.pos.y - 0.5, e.pos.z)) < 1.2) { P.hearts = Math.min(P.maxHearts, P.hearts + 1); PF.sfx.play('ding'); PF.emit('heal', P.hearts); PF.kill(e, 'poof'); } },
  };
  PF.KINDS.flowers = {
    make(e, o) { e.r = 1.2; e.h = 0.4; const n = o.count || 14; e.data.ids = []; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 1.4; const id = PF.flowerAt(e.pos.x + Math.cos(a) * r, e.pos.y, e.pos.z + Math.sin(a) * r, i * 0.03); if (id != null) e.data.ids.push(id); } PF.sfx.play('bloom'); PF.fx.petals(e.pos.x, e.pos.y + 0.3, e.pos.z, 20); },
    remove(e) { for (const id of e.data.ids) PF.flowerAt.hide(id); },
    update() {},
  };
  // macizo de flores compartido (lo usan el catálogo y las flores que lanza el jefe)
  (function () {
    const N = 700, pools = [];
    PF.flowerAt = (x, y, z, delay) => {
      if (!pools.length) for (let v = 0; v < 6; v++) { const im = new T.InstancedMesh(PF.models.flowerGeo(v), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), N); im.count = 0; im.castShadow = false; im.frustumCulled = false; PF.scene.add(im); pools.push({ im, n: 0, data: [] }); }
      const v = Math.floor(Math.random() * 6), p = pools[v]; if (p.n >= N) return null;
      const i = p.n++; p.im.count = p.n; const s = 0.8 + Math.random() * 0.7, ry = Math.random() * 6.283;
      p.im.setMatrixAt(i, PF.mtx(x, y, z, 0, ry, 0, 0.001)); p.im.instanceMatrix.needsUpdate = true;
      PF.after(delay || 0, () => PF.tween(0.5, (k) => { p.im.setMatrixAt(i, PF.mtx(x, y, z, 0, ry, 0, Math.max(0.001, U.outBack(k) * s))); p.im.instanceMatrix.needsUpdate = true; }));
      return v * 100000 + i;
    };
    PF.flowerAt.hide = (id) => { const p = pools[Math.floor(id / 100000)]; if (!p) return; p.im.setMatrixAt(id % 100000, PF.mtx(0, -999, 0, 0, 0, 0, 0.001)); p.im.instanceMatrix.needsUpdate = true; };
    PF.flowerAt.count = () => pools.reduce((a, p) => a + p.n, 0);
  })();

  /* ================= el muro (pieza del nivel que también se puede quitar o romper) ================= */
  PF.KINDS.wall = {
    make(e) {
      const L = PF.level.wall, m = PF.world.wallMesh; Object.assign(e, { x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, h: L.h, r: 1.25 }); e.pos.set(0, 0, (L.z0 + L.z1) / 2);
      PF.scene.remove(m); m.position.set(0, 0, -e.pos.z); e.root.add(m); e.tags.add('stone');
      e.cols.push(PF.addBox(L.x0, 0, L.z0, L.x1, L.h, L.z1, 'wall', e));
    },
    remove(e) { for (const l of PF.all('ladder')) if (l.data.wall === e) PF.kill(l, 'poof'); },
    vanish(e, how, done) {
      PF.sfx.play('rumble'); PF.shake(0.8);
      for (let i = 0; i < 26; i++) { const b = mk(G.rbox(0.9, 0.6, 0.6, 0.08), PF.mat('#c9c2dc', { map: 'stone' }), U.rand(e.x0 + 1, e.x1 - 1), U.rand(0.5, e.h), U.rand(e.z0, e.z1)); PF.scene.add(b); const v = V(U.rand(-3, 3), U.rand(2, 7), U.rand(-4, 4)), r = V(U.rand(-5, 5), U.rand(-5, 5), U.rand(-5, 5)); PF.tween(1.6, (k) => { b.position.addScaledVector(v, 1 / 60); v.y -= 0.35; b.rotation.x += r.x / 60; b.rotation.y += r.y / 60; if (b.position.y < 0.3) { b.position.y = 0.3; v.multiplyScalar(0.5); } b.scale.setScalar(Math.max(0.01, 1 - Math.max(0, k - 0.6) * 2.5)); }, () => PF.scene.remove(b)); }
      for (let x = e.x0 + 1; x < e.x1; x += 2) PF.fx.smoke(x, 1.5, (e.z0 + e.z1) / 2, 4, '#d9d2e6');
      PF.tween(1.0, (k) => { e.root.position.y = -U.smooth(k) * (e.h + 0.5); e.root.scale.y = 1 - k * 0.3; }, done);
    },
    update() {},
  };

  /* ================= complementos (tutú, corona, gafas…) ================= */
  PF.wear = (e, item) => {
    if (!e) return false;
    const h = e.h || (e.ch && e.ch.height) || 1.6, r = e.r || 0.5;
    e.wearing = e.wearing || {};
    if (e.wearing[item]) return true;
    let g, where, y, z = 0;
    if (item === 'tutu') {
      const big = e.type === 'boss', rig = e.ch && e.ch.model && e.ch.model.rig;
      if (big) { const R0 = (rig && rig.waistR) || e.waistR || 2.05; g = PF.models.tutu(R0, R0 * 1.62); y = (rig && rig.waistY) || h * 0.36; }
      else { g = PF.models.tutu(2.05, 3.3); y = h * (e.type === 'princess' ? 0.45 : 0.31); g.scale.setScalar(Math.max(0.12, (e.waistR || r * 0.72) / 2.05)); }
      where = 'hips'; g.userData.dy = big ? -0.15 : 0;
    } else {
      g = PF.models.wearable(item, h, r); if (!g) return false; const at = g.userData.at;
      where = at === 'top' ? 'head' : at === 'eyes' ? 'face' : at === 'neck' ? 'neck' : 'back';
      y = at === 'top' ? h * 0.98 : at === 'eyes' ? h * 0.8 : at === 'neck' ? h * 0.62 : h * 0.66; z = at === 'eyes' ? r * 0.85 : at === 'back' ? -r * 0.3 : 0;
    }
    if (e.ch) PF.models.attach(e.ch, g, where, y, z); else { g.position.set(0, y, z); e.root.add(g); }
    e.wearing[item] = g;
    const s0 = g.scale.clone(); g.scale.multiplyScalar(0.01); PF.tween(0.55, (k) => g.scale.copy(s0).multiplyScalar(Math.max(0.01, U.outBack(k))));
    PF.fx.magic(e.pos.x, e.pos.y + h * 0.5, e.pos.z, 40, '#ffb3d9'); PF.sfx.play('sparkle');
    PF.emit('wear', { e, item });
    return true;
  };

  /* ================= bucle de los actores ================= */
  PF.updateActors = (dt, inp) => {
    updatePlayer(dt, inp);
    for (const e of Array.from(ents.values())) { if (!e.alive) continue; const K = PF.KINDS[e.type]; if (K && K.update) K.update(e, dt); }
    animatePlayer(dt);
    updateCamera(dt, inp);
  };
  PF.updateCameraOnly = (dt, inp) => updateCamera(dt, inp);
})();
