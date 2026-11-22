/* Plataformas 3D · modelos.
   Cada personaje y cada pieza tiene un generador procedural (código, carga al instante). Los del nivel inicial (hero,
   princess, boss, enemy y el escenario) pueden sustituirse por un GLB declarado en assets/platform/manifest.json; si el
   fichero falta o tarda, se queda el procedural. Lo que aparece por una orden (escalera, charco, tiburón, puente, tutú,
   flores, compañeros, logos…) siempre se construye con código. */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U;
  const V2 = (x, y) => new T.Vector2(x, y);

  /* ---------- geometrías ---------- */
  function roundedBox(w, h, d, r, n) {
    n = n || 6; r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new T.BoxGeometry(w, h, d, n, n, n), P = g.attributes.position, N = g.attributes.normal, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); c.set(U.clamp(v.x, -hw, hw), U.clamp(v.y, -hh, hh), U.clamp(v.z, -hd, hd));
      const dir = v.sub(c); if (dir.lengthSq() < 1e-9) continue; dir.normalize(); N.setXYZ(i, dir.x, dir.y, dir.z); dir.multiplyScalar(r).add(c); P.setXYZ(i, dir.x, dir.y, dir.z);
    }
    return g;
  }
  const G = {
    sph: (r, w, h) => new T.SphereGeometry(r, w || 28, h || 18),
    hemi: (r, w) => new T.SphereGeometry(r, w || 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    box: (w, h, d) => new T.BoxGeometry(w, h, d),
    rbox: roundedBox,
    cyl: (rt, rb, h, s) => new T.CylinderGeometry(rt, rb, h, s || 20),
    cone: (r, h, s) => new T.ConeGeometry(r, h, s || 20),
    tor: (R, r, arc, s) => new T.TorusGeometry(R, r, 12, s || 36, arc || Math.PI * 2),
    ico: (r, d) => new T.IcosahedronGeometry(r, d || 0),
    lathe: (pts, seg) => new T.LatheGeometry(pts.map((p) => V2(p[0], p[1])), seg || 32),
    capsule: (r, len, seg) => { const pts = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push([Math.cos(a) * r, len + Math.sin(a) * r]); } pts[0][0] = 0.0001; pts[pts.length - 1][0] = 0.0001; const g = G.lathe(pts, seg || 20); g.translate(0, -len / 2, 0); return g; },
    egg: (r, h, k) => { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = -Math.PI / 2 + t * Math.PI; const rr = Math.cos(a) * r * (1 - (k || 0.15) * Math.sin(a)); pts.push([Math.max(0.0001, rr), (Math.sin(a) + 1) / 2 * h]); } return G.lathe(pts, 28); },
  };
  PF.G = G;
  function mk(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new T.Mesh(geo, typeof mat === 'string' ? PF.mat(mat) : mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  const grp = (x, y, z) => { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); return g; };
  PF.mk = mk; PF.grp = grp;

  // ojos de dibujo animado: blanco, pupila y brillo; devuelve el grupo (para parpadear)
  function eye(r, x, y, z, iris, look) {
    const g = grp(x, y, z);
    g.add(mk(G.sph(r, 20, 14), PF.mat('#ffffff', { rough: 0.25 }), 0, 0, 0, 0, 0, 0, 1, 1.25, 0.75));
    g.add(mk(G.sph(r * 0.6, 16, 12), PF.mat(iris || '#2a1d17', { rough: 0.2 }), (look || 0) * r * 0.2, -r * 0.05, r * 0.55, 0, 0, 0, 1, 1.2, 0.6));
    g.add(mk(G.sph(r * 0.2, 10, 8), PF.mat('#ffffff', { emissive: '#ffffff', glow: 0.6 }), r * 0.18, r * 0.25, r * 0.88));
    return g;
  }
  function smile(R, r, color) { return new T.Mesh(G.tor(R, r, Math.PI * 0.9, 20), PF.mat(color || '#5a2a22', { rough: 0.5 })); }

  /* ---------- héroe (nombre y colores en PF.HERO, pf-core.js): chibi de ~2,5 cabezas, calvo y con barba ---------- */
  const shade = (hex, k) => '#' + new T.Color(hex).multiplyScalar(k).getHexString();
  function hero() {
    const H = PF.HERO, root = grp(), body = grp(0, 0, 0), rig = { root, body, eyes: [], kind: 'biped' };
    root.add(body);
    const SKIN = PF.mat(H.skin, { rough: 0.42 }), JEANS = PF.mat(H.jeans, { rough: 0.86 }), CUFF = PF.mat(shade(H.jeans, 1.18), { rough: 0.86 });
    const SHOE = PF.mat(H.shoes, { rough: 0.45 }), SOLE = PF.mat(H.soles, { rough: 0.6 }), LACE = PF.mat(H.laces, { rough: 0.5 });
    const TEE = PF.mat(H.tee, { rough: 0.82 }), HOOD = H.hoodieStyle ? PF.mat(H.hoodie, { rough: 0.9, side: true }) : null, RIB = H.hoodieStyle ? PF.mat(shade(H.hoodie, 0.8), { rough: 0.95 }) : null;
    const BEARD = PF.mat(H.beard, { rough: 0.96, side: true });
    // piernas (pivote en la cadera): vaqueros con el bajo vuelto y zapatillas negras con suela y cordones blancos
    for (const s of [1, -1]) {
      const leg = grp(0.115 * s, 0.46, 0);
      leg.add(mk(G.cyl(0.105, 0.1, 0.3, 16), JEANS, 0, -0.13, 0));
      leg.add(mk(G.cyl(0.113, 0.113, 0.06, 16), CUFF, 0, -0.27, 0));
      const shoe = grp(0, -0.36, 0.035);
      shoe.add(mk(G.rbox(0.2, 0.065, 0.33, 0.03), SOLE, 0, -0.068, 0.012));
      shoe.add(mk(G.rbox(0.185, 0.105, 0.3, 0.05), SHOE, 0, -0.002, 0));
      shoe.add(mk(G.rbox(0.19, 0.05, 0.1, 0.024), SOLE, 0, -0.018, 0.115));
      for (let i = 0; i < 3; i++) shoe.add(mk(G.rbox(0.105, 0.016, 0.024, 0.008), LACE, 0, 0.05 - i * 0.006, 0.035 - i * 0.045, -0.3));
      leg.add(shoe);
      body.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg;
    }
    const torso = grp(0, 0.46, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.cyl(0.235, 0.24, 0.12, 24), JEANS, 0, 0.01, 0));
    // camiseta burdeos por fuera del pantalón (sin cinturón)
    const TP = [[0.0001, -0.035], [0.263, -0.035], [0.272, -0.005], [0.263, 0.1], [0.256, 0.2], [0.241, 0.29], [0.2, 0.36], [0.13, 0.405], [0.0001, 0.416]];
    torso.add(mk(G.lathe(TP, 36), TEE, 0, 0, 0));
    if (H.hoodieStyle) {
      // sudadera con capucha: abierta (dos mitades que se abren al correr) o cerrada
      const HP = [[0.282, -0.07], [0.293, -0.035], [0.286, 0.08], [0.279, 0.2], [0.264, 0.29], [0.222, 0.366], [0.152, 0.418], [0.112, 0.432]];
      const RP = [[0.284, -0.085], [0.298, -0.085], [0.302, -0.03], [0.288, -0.03]];
      const gap = H.hoodieStyle === 'open' ? 0.46 : 0;
      const half = (a0, len) => {
        const g = grp(); g.add(mk(new T.LatheGeometry(HP.map((p) => V2(p[0], p[1])), 16, a0, len), HOOD, 0, 0, 0)); g.add(mk(new T.LatheGeometry(RP.map((p) => V2(p[0], p[1])), 16, a0, len), RIB, 0, 0, 0));
        if (gap) { const edge = a0 < Math.PI ? a0 : a0 + len, pts = HP.slice(0, 7).map(([r, y]) => new T.Vector3(Math.sin(edge) * (r + 0.006), y, Math.cos(edge) * (r + 0.006))); g.add(mk(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 14, 0.008, 5), '#b8bcc6', 0, 0, 0)); }
        torso.add(g); return g;
      };
      if (gap) { rig.hoodL = half(gap, Math.PI - gap); rig.hoodR = half(Math.PI, Math.PI - gap); }
      else { half(0, Math.PI * 2); torso.add(mk(G.rbox(0.3, 0.13, 0.05, 0.03), RIB, 0, 0.06, 0.27)); }
      // capucha bajada sobre los hombros y cordones blancos
      torso.add(mk(G.tor(0.15, 0.062, Math.PI * 2, 28), HOOD, 0, 0.418, -0.025, Math.PI / 2, 0, 0, 1.05, 1.18, 1));
      torso.add(mk(G.sph(0.17, 18, 12), HOOD, 0, 0.35, -0.215, 0.35, 0, 0, 1.3, 0.8, 0.55));
      for (const s of [1, -1]) { torso.add(mk(G.cyl(0.008, 0.008, 0.2, 6), H.cords, 0.07 * s, 0.31, 0.262, 0.1, 0, 0)); torso.add(mk(G.cyl(0.012, 0.012, 0.032, 6), H.cords, 0.07 * s, 0.2, 0.272, 0.1, 0, 0)); }
    }
    // brazos: mangas de la sudadera (o de la camiseta) y manos redondas
    for (const s of [1, -1]) {
      const arm = grp(0.29 * s, 0.33, 0);
      const SLEEVE = HOOD || TEE;
      arm.add(mk(G.sph(0.092, 16, 12), SLEEVE, 0, 0, 0));
      if (HOOD) { arm.add(mk(G.cyl(0.086, 0.078, 0.25, 14), SLEEVE, 0, -0.13, 0)); arm.add(mk(G.cyl(0.08, 0.08, 0.05, 14), RIB, 0, -0.27, 0)); }
      else { arm.add(mk(G.cyl(0.094, 0.088, 0.1, 14), TEE, 0, -0.05, 0)); arm.add(mk(G.cyl(0.066, 0.062, 0.2, 12), SKIN, 0, -0.18, 0)); }
      arm.add(mk(G.sph(0.08, 16, 12), SKIN, 0, -0.34, 0.01, 0, 0, 0, 1, 1.05, 0.9));
      arm.add(mk(G.sph(0.034, 10, 8), SKIN, -0.045 * s, -0.31, 0.05));
      torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    // cabeza: grande, redonda, calva y brillante
    const head = grp(0, 0.42, 0); torso.add(head); rig.head = head;
    head.add(mk(G.cyl(0.07, 0.08, 0.08, 14), SKIN, 0, 0.02, 0));
    head.add(mk(G.sph(0.32, 40, 28), SKIN, 0, 0.3, 0, 0, 0, 0, 1, 0.97, 0.96));
    for (const s of [1, -1]) {
      head.add(mk(G.sph(0.065, 14, 10), SKIN, 0.315 * s, 0.29, 0.01, 0, 0, 0, 0.55, 0.95, 0.75));
      const e = eye(0.074, 0.112 * s, 0.335, 0.262, H.iris); head.add(e); rig.eyes.push(e);
      const brow = mk(G.tor(0.075, 0.021, Math.PI * 0.72, 12), PF.mat(H.brows, { rough: 0.9 }), 0.112 * s, 0.37, 0.282, -0.32, 0, Math.PI * 0.14); head.add(brow);
      head.add(mk(G.sph(0.05, 12, 10), PF.mat(H.blush, { rough: 0.9 }), 0.19 * s, 0.255, 0.255, 0, 0, 0, 1, 0.55, 0.35));
    }
    head.add(mk(G.sph(0.05, 16, 12), PF.mat(H.nose, { rough: 0.5 }), 0, 0.27, 0.318, 0, 0, 0, 1.1, 0.9, 1));
    // barba castaña poblada: mandíbula, patillas, bigote y mechones abajo
    head.add(mk(new T.SphereGeometry(0.335, 36, 18, Math.PI / 2 - 1.9, 3.8, Math.PI * 0.555, Math.PI * 0.445), BEARD, 0, 0.3, 0, 0, 0, 0, 1.02, 1.3, 1.12));
    for (const s of [1, -1]) {
      head.add(mk(G.rbox(0.075, 0.17, 0.1, 0.03), BEARD, 0.296 * s, 0.295, 0.075, 0, 0.45 * s, 0));
      head.add(mk(G.sph(0.07, 16, 12), BEARD, 0.056 * s, 0.205, 0.346, 0.1, 0.35 * s, 0.22 * s, 1.25, 0.55, 0.75));
    }
    for (let i = 0; i < 5; i++) { const k = Math.abs(i - 2); head.add(mk(G.sph(0.085, 14, 10), BEARD, (i - 2) * 0.075, -0.06 + k * 0.035, 0.27 - k * 0.045)); }
    // sonrisa grande dentro de la barba
    const mouth = grp(0, 0.152, 0.357); mouth.rotation.x = -0.32; head.add(mouth); rig.mouth = mouth;
    const ms = new T.Shape(); ms.moveTo(-0.078, 0.012); ms.quadraticCurveTo(0, 0.028, 0.078, 0.012); ms.quadraticCurveTo(0.064, -0.074, 0, -0.076); ms.quadraticCurveTo(-0.064, -0.074, -0.078, 0.012);
    mouth.add(mk(new T.ShapeGeometry(ms, 12), PF.mat('#5e1e23', { rough: 0.6 }), 0, 0, 0));
    mouth.add(mk(G.rbox(0.118, 0.024, 0.012, 0.008), PF.mat('#ffffff', { rough: 0.3 }), 0, 0.002, 0.004));
    mouth.add(mk(G.sph(0.03, 12, 8), PF.mat('#e0626c', { rough: 0.6 }), 0, -0.052, 0.002, 0, 0, 0, 1.4, 0.6, 0.3));
    // complementos «geek» opcionales (PF.HERO.glasses / PF.HERO.headphones)
    if (H.glasses) { const GL = PF.mat('#121316', { rough: 0.3, metal: 0.3 }); for (const s of [1, -1]) { const f = grp(0.112 * s, 0.335, 0.33); for (const [w, h2, x, y] of [[0.17, 0.025, 0, 0.06], [0.17, 0.025, 0, -0.06], [0.025, 0.14, 0.075, 0], [0.025, 0.14, -0.075, 0]]) f.add(mk(G.box(w, h2, 0.03), GL, x, y, 0)); head.add(f); } head.add(mk(G.box(0.06, 0.02, 0.025), GL, 0, 0.35, 0.34)); }
    if (H.headphones) { const HP2 = PF.mat('#17181c', { rough: 0.35 }); torso.add(mk(G.tor(0.17, 0.025, Math.PI * 1.25, 20), HP2, 0, 0.44, 0.0, Math.PI / 2, 0, Math.PI * 0.62)); for (const s of [1, -1]) torso.add(mk(G.cyl(0.075, 0.075, 0.06, 18), HP2, 0.13 * s, 0.43, 0.11, 0, 0, Math.PI / 2)); }
    rig.bodyY = 0;
    return { root, rig, height: 1.5, radius: 0.36 };
  }

  /* ---------- princesa Lúa: pelo rizado en dos moños, tiara plateada con gema azul, vestido menta y crema con estrellas, capa lila ---------- */
  function star(r) { const sh = new T.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); } sh.closePath(); const g = new T.ExtrudeGeometry(sh, { depth: r * 0.3, bevelEnabled: false }); g.translate(0, 0, -r * 0.15); return g; }
  function princess() {
    const SK = '#8d5a3b', MINT = '#8fdcc0', CREAM = '#fff2d6', LILAC = '#b69cf0', HAIRC = '#3b2417';
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'dress' }; root.add(body);
    body.add(mk(G.lathe([[0.0001, 0], [0.44, 0], [0.42, 0.08], [0.36, 0.3], [0.27, 0.55], [0.18, 0.74], [0.0001, 0.76]], 40), MINT, 0, 0, 0));
    body.add(mk(G.tor(0.43, 0.04, 0, 40), CREAM, 0, 0.045, 0, Math.PI / 2));
    body.add(mk(G.tor(0.33, 0.025, 0, 40), CREAM, 0, 0.38, 0, Math.PI / 2));
    const STAR = PF.mat('#ffd84d', { emissive: '#ffcf3a', glow: 0.35, rough: 0.4 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2, y = i % 2 ? 0.16 : 0.27, rr = i % 2 ? 0.39 : 0.33; body.add(mk(star(0.045), STAR, Math.sin(a) * rr, y, Math.cos(a) * rr, -0.25, a, 0)); }
    const torso = grp(0, 0.74, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.lathe([[0.0001, 0], [0.18, 0], [0.2, 0.12], [0.18, 0.24], [0.12, 0.3], [0.0001, 0.31]], 28), MINT, 0, 0, 0));
    torso.add(mk(G.tor(0.18, 0.03, 0, 28), CREAM, 0, 0.02, 0, Math.PI / 2));
    const cape = mk(new T.CylinderGeometry(0.26, 0.42, 0.95, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), PF.mat(LILAC, { side: true, rough: 0.6 }), 0, -0.2, -0.02); torso.add(cape); rig.cape = cape;
    for (const s of [1, -1]) {
      const arm = grp(0.2 * s, 0.25, 0); arm.add(mk(G.sph(0.09, 14, 10), CREAM, 0, 0, 0)); arm.add(mk(G.cyl(0.05, 0.045, 0.3), SK, 0, -0.17, 0)); arm.add(mk(G.sph(0.06, 12, 10), SK, 0, -0.34, 0.01));
      torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    const head = grp(0, 0.31, 0); torso.add(head); rig.head = head;
    head.add(mk(G.cyl(0.05, 0.06, 0.1), SK, 0, 0.02, 0));
    head.add(mk(G.sph(0.3, 32, 24), SK, 0, 0.28, 0, 0, 0, 0, 1, 0.98, 0.95));
    for (const s of [1, -1]) { const e = eye(0.07, 0.105 * s, 0.31, 0.24, '#3a2414'); head.add(e); rig.eyes.push(e); head.add(mk(G.box(0.03, 0.05, 0.01), '#1b0f0b', 0.16 * s, 0.38, 0.25, 0, 0, 0.5 * s)); head.add(mk(G.sph(0.05, 12, 10), PF.mat('#d9707a', { rough: 0.9 }), 0.18 * s, 0.2, 0.22, 0, 0, 0, 1, 0.6, 0.4)); }
    const sm = smile(0.055, 0.014, '#7a2333'); sm.position.set(0, 0.16, 0.275); sm.rotation.set(0.2, 0, Math.PI * 1.05); head.add(sm);
    // pelo rizado con dos moños
    const HAIR = PF.mat(HAIRC, { rough: 0.7 });
    head.add(mk(new T.SphereGeometry(0.315, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.56), HAIR, 0, 0.3, -0.02, -0.3, 0, 0, 1.02, 1, 1.03));
    for (const s of [1, -1]) { const bun = grp(0.21 * s, 0.6, -0.05); bun.add(mk(G.sph(0.13, 18, 14), HAIR, 0, 0, 0)); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; bun.add(mk(G.sph(0.055, 10, 8), HAIR, Math.cos(a) * 0.11, Math.sin(a) * 0.11 * 0.8, 0.04)); } head.add(bun); }
    for (let i = 0; i < 11; i++) { const a = -2.1 + i * 0.42; head.add(mk(G.sph(0.07, 12, 10), HAIR, Math.sin(a) * 0.3, 0.2 + Math.abs(Math.cos(a)) * 0.06, Math.cos(a) * 0.3 - 0.04)); }
    // tiara plateada con una gema azul
    const SILVER = PF.mat('#e3e8f2', { metal: 0.85, rough: 0.25 });
    head.add(mk(G.tor(0.17, 0.018, 0, 28), SILVER, 0, 0.55, 0.05, Math.PI / 2 - 0.3));
    head.add(mk(G.cone(0.045, 0.12, 4), SILVER, 0, 0.63, 0.19, -0.3, Math.PI / 4, 0));
    head.add(mk(new T.OctahedronGeometry(0.045, 0), PF.mat('#3d7bff', { emissive: '#2d5cff', glow: 0.9, rough: 0.15 }), 0, 0.6, 0.215, 0, 0, 0, 1, 1.25, 0.6));
    rig.bodyY = 0;
    return { root, rig, height: 1.66, radius: 0.42 };
  }

  /* ---------- enemigo: duendecillo de brasa (guijarro de lava con cuernos y barriga incandescente) ---------- */
  function enemy() {
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'imp' }; root.add(body);
    const L = lavaMaps();
    const ROCK = new T.MeshStandardMaterial({ color: PF.col('#4f4a52'), map: L.map, emissive: PF.col('#ff5a14'), emissiveMap: L.emissiveMap, emissiveIntensity: 1.4, roughness: 0.9, flatShading: true });
    const DARK = PF.mat('#2f2b30', { rough: 0.95, flat: true }), GLOW = PF.mat('#ffb347', { emissive: '#ff7a1a', glow: 2.2, rough: 0.5 });
    rig.lava = ROCK;
    for (const s of [1, -1]) { const leg = grp(0.12 * s, 0.2, 0); leg.add(mk(G.cyl(0.07, 0.06, 0.16, 8), DARK, 0, -0.08, 0)); leg.add(mk(G.rbox(0.14, 0.07, 0.18, 0.03), DARK, 0, -0.165, 0.03)); body.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg; }
    const torso = grp(0, 0.2, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.ico(0.3, 2), ROCK, 0, 0.26, 0, 0.3, 0.5, 0, 1, 1.05, 0.95));
    torso.add(mk(G.sph(0.17, 16, 12), GLOW, 0, 0.17, 0.2, 0, 0, 0, 1, 0.9, 0.5));
    for (const s of [1, -1]) {
      const e = mk(G.sph(0.055, 12, 10), PF.mat('#ffe27a', { emissive: '#ffc23a', glow: 2.4 }), 0.1 * s, 0.36, 0.25, 0, 0, 0, 1, 1.2, 0.6); torso.add(e); rig.eyes.push(e);
      torso.add(mk(G.rbox(0.12, 0.035, 0.05, 0.015), DARK, 0.1 * s, 0.43, 0.25, -0.2, 0, 0.35 * s));
      torso.add(mk(G.cone(0.06, 0.2, 8), DARK, 0.17 * s, 0.53, 0, 0, 0, -0.5 * s));
      const arm = grp(0.29 * s, 0.3, 0); arm.add(mk(G.cyl(0.045, 0.04, 0.14, 8), DARK, 0, -0.07, 0)); arm.add(mk(G.ico(0.06, 0), DARK, 0, -0.15, 0.02)); torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    const grin = new T.Shape(); grin.moveTo(-0.08, 0.01); grin.quadraticCurveTo(0, -0.07, 0.08, 0.01); grin.quadraticCurveTo(0, -0.025, -0.08, 0.01);
    torso.add(mk(new T.ShapeGeometry(grin, 10), GLOW, 0, 0.29, 0.285, -0.2, 0, 0));
    rig.bodyY = 0;
    return { root, rig, height: 0.8, radius: 0.35 };
  }

  /* ---------- jefe final: el Rey Volcán, un gólem redondo y gruñón de basalto con grietas de lava y corona dorada ---------- */
  let lavaTex = null;
  function lavaMaps() {
    if (lavaTex) return lavaTex;
    const S = 512, mk2 = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    const cc = mk2(), ce = mk2(), g = cc.getContext('2d'), e = ce.getContext('2d'), r = U.rng(77);
    g.fillStyle = '#3a3840'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { const v = 40 + r() * 40; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',0.5)'; const x = r() * S, y = r() * S, w = 6 + r() * 40; g.fillRect(x, y, w, w * 0.6); }
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    for (let i = 0; i < 34; i++) {
      let x = r() * S, y = r() * S; const pts = [[x, y]]; for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; pts.push([x, y]); }
      for (const [ctx, col, w, blur] of [[e, '#ff6a10', 7, 14], [e, '#ffd27a', 2.2, 4], [g, '#1a0a05', 5, 0]]) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.shadowColor = col; ctx.shadowBlur = blur;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.beginPath(); pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy))); ctx.stroke(); }
        ctx.restore();
      }
    }
    const tc = new T.CanvasTexture(cc), te = new T.CanvasTexture(ce); tc.encoding = te.encoding = T.sRGBEncoding; tc.wrapS = tc.wrapT = te.wrapS = te.wrapT = T.RepeatWrapping;
    lavaTex = { map: tc, emissiveMap: te }; return lavaTex;
  }
  function boss() {
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'golem', brows: [] }; root.add(body);
    const L = lavaMaps();
    const ROCK = new T.MeshStandardMaterial({ color: PF.col('#55535e'), map: L.map, emissive: PF.col('#ff5a14'), emissiveMap: L.emissiveMap, emissiveIntensity: 1.6, roughness: 0.92, flatShading: true });
    const ROCK2 = new T.MeshStandardMaterial({ color: PF.col('#43414a'), roughness: 0.95, flatShading: true });
    rig.lava = ROCK;
    // piernas cortas y rechonchas, con dedos
    for (const s of [1, -1]) {
      const leg = grp(1.0 * s, 1.15, 0); leg.add(mk(G.ico(0.74, 1), ROCK, 0, -0.42, 0, 0, 0, 0, 1, 1.1, 1));
      const foot = grp(0, -0.95, 0.15); foot.add(mk(G.rbox(1.3, 0.46, 1.4, 0.18), ROCK2, 0, 0, 0)); for (let i = 0; i < 3; i++) foot.add(mk(G.ico(0.24, 0), ROCK2, (i - 1) * 0.4, -0.04, 0.7)); leg.add(foot);
      body.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg;
    }
    // el cuerpo es una gran bola de basalto (cabeza y tronco en uno)
    const torso = grp(0, 1.15, 0); body.add(torso); rig.torso = torso;
    const BR = 2.25, CY = 2.05;
    torso.add(mk(G.ico(BR, 2), ROCK, 0, CY, 0, 0.2, 0.4, 0, 1, 0.97, 0.95));
    torso.add(mk(G.sph(0.95, 20, 14), PF.mat('#ff8a2a', { emissive: '#ff6a10', glow: 2.2, rough: 0.6, flat: true }), 0, CY - 1.0, 1.72, 0, 0, 0, 1.15, 0.85, 0.42));
    rig.waistY = 1.15 + CY - 1.05; rig.waistR = 1.98;
    // cara: cejas de piedra, ojos de lava y boca (enfadada o, si se le pasa, sonriente)
    const face = grp(0, CY, 0); torso.add(face); rig.head = face;
    const EYE = PF.mat('#ffd36b', { emissive: '#ffb020', glow: 2.6, rough: 0.3 });
    for (const s of [1, -1]) {
      face.add(mk(G.sph(0.34, 16, 12), PF.mat('#1d1416', { rough: 1 }), 0.55 * s, 0.42, 1.95, 0, 0, 0, 1.2, 0.85, 0.45));
      const e = mk(G.sph(0.24, 16, 12), EYE, 0.55 * s, 0.42, 2.06, 0, 0, 0, 1.2, 0.8, 0.5); face.add(e); rig.eyes.push(e);
      const br = mk(G.rbox(1.05, 0.32, 0.42, 0.08), ROCK2, 0.56 * s, 0.86, 1.95, -0.15, -0.12 * s, 0.32 * s); face.add(br); rig.brows.push({ m: br, s });
    }
    const mouthAngry = grp(0, -0.32, 2.15), mouthHappy = grp(0, -0.3, 2.15); face.add(mouthAngry); face.add(mouthHappy); mouthHappy.visible = false;
    const LIP = new T.Shape(); LIP.moveTo(-0.72, -0.22); LIP.quadraticCurveTo(0, 0.5, 0.72, -0.22); LIP.lineTo(-0.72, -0.22);
    mouthAngry.add(mk(new T.ShapeGeometry(LIP, 16), PF.mat('#ff7a2a', { emissive: '#ff5a14', glow: 2.0 }), 0, 0, 0.02));
    for (let i = 0; i < 5; i++) mouthAngry.add(mk(G.rbox(0.2, 0.17, 0.1, 0.04), '#e9c77c', (i - 2) * 0.23, 0.11 - Math.abs(i - 2) * 0.09, 0.05));
    mouthAngry.add(mk(G.rbox(1.6, 0.2, 0.3, 0.08), ROCK2, 0, -0.32, 0.02));
    const SM = new T.Shape(); SM.moveTo(-0.8, 0.18); SM.lineTo(0.8, 0.18); SM.quadraticCurveTo(0, -0.75, -0.8, 0.18);
    mouthHappy.add(mk(new T.ShapeGeometry(SM, 16), PF.mat('#ff7fb6', { emissive: '#ff4f9a', glow: 1.6 }), 0, 0, 0.02));
    for (let i = 0; i < 5; i++) mouthHappy.add(mk(G.rbox(0.2, 0.14, 0.1, 0.04), '#fff2d6', (i - 2) * 0.25, 0.1, 0.05));
    rig.mouthAngry = mouthAngry; rig.mouthHappy = mouthHappy;
    // brazos gruesos con puños enormes
    for (const s of [1, -1]) {
      const arm = grp(2.05 * s, CY + 0.35, 0);
      arm.add(mk(G.ico(0.78, 1), ROCK, 0.3 * s, -0.35, 0)); arm.add(mk(G.ico(0.62, 1), ROCK2, 0.5 * s, -1.05, 0.1, 0, 0, 0, 0.95, 1.2, 0.95)); arm.add(mk(G.ico(0.98, 1), ROCK, 0.6 * s, -1.9, 0.28));
      torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    // corona dorada ladeada con gemas rojas
    const GOLD = PF.mat('#f2c24a', { metal: 0.85, rough: 0.28 }), GEM = PF.mat('#c8102e', { rough: 0.15, metal: 0.2, emissive: '#5a0010', glow: 0.6 });
    const crown = grp(0.3, CY + BR * 0.93, -0.05); crown.rotation.set(-0.08, 0.2, 0.2); torso.add(crown); rig.crown = crown;
    crown.add(mk(new T.CylinderGeometry(0.78, 0.7, 0.42, 30, 1, true), PF.mat('#f2c24a', { metal: 0.85, rough: 0.28, side: true }), 0, 0, 0));
    crown.add(mk(G.tor(0.74, 0.05, 0, 30), GOLD, 0, -0.2, 0, Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2; crown.add(mk(G.cone(0.2, 0.55, 4), GOLD, Math.sin(a) * 0.72, 0.48, Math.cos(a) * 0.72, 0, a + Math.PI / 4, 0, 1, 1, 0.45));
      crown.add(mk(new T.OctahedronGeometry(0.11, 0), GEM, Math.sin(a) * 0.76, 0.02, Math.cos(a) * 0.76, 0, a, 0, 1, 1.3, 0.6));
    }
    rig.bodyY = 0;
    return { root, rig, height: 6.3, radius: 2.4 };
  }
  // el tutú: dos capas de tul rosa con volantes y un lazo
  function tutu(R0, R1) {
    const g = grp();
    for (const [rin, rout, y, col, waves, amp] of [[R0, R1, 0, '#ff8fc8', 18, 0.16], [R0, R1 * 0.86, 0.16, '#ffc2e2', 14, 0.12]]) {
      const seg = 96, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, wv = Math.sin(a * waves) * amp; pos.push(Math.cos(a) * rin, y + 0.05, Math.sin(a) * rin, Math.cos(a) * rout, y - 0.25 + wv, Math.sin(a) * rout); }
      for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      g.add(mk(geo, PF.mat(col, { side: true, rough: 0.8, opacity: 0.94, depthWrite: true })));
    }
    g.add(mk(G.tor(R0 * 1.01, 0.08, 0, 48), '#ff6fb5', 0, 0.08, 0, Math.PI / 2));
    const bow = grp(0, 0.1, -R0 - 0.05); bow.add(mk(G.sph(0.22, 14, 10), '#ff6fb5', 0.25, 0, 0, 0, 0, 0, 1.2, 0.8, 0.5)); bow.add(mk(G.sph(0.22, 14, 10), '#ff6fb5', -0.25, 0, 0, 0, 0, 0, 1.2, 0.8, 0.5)); bow.add(mk(G.sph(0.12, 12, 10), '#ff4fa3', 0, 0, 0)); g.add(bow);
    return g;
  }

  /* ---------- tiburón (se construye con código cuando lo pides) ---------- */
  function shark() {
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'shark' }; root.add(body);
    const prof = [[0.0001, -1.25], [0.12, -1.1], [0.28, -0.7], [0.42, -0.2], [0.46, 0.2], [0.4, 0.6], [0.26, 0.95], [0.1, 1.2], [0.0001, 1.28]];
    const geo = G.lathe(prof, 32); geo.rotateX(Math.PI / 2);
    const P = geo.attributes.position, col = [], top = PF.col('#5d7f9e'), belly = PF.col('#f3f6f8');
    for (let i = 0; i < P.count; i++) { const k = U.smooth((P.getY(i) + 0.12) / 0.3); col.push(belly.r + (top.r - belly.r) * k, belly.g + (top.g - belly.g) * k, belly.b + (top.b - belly.b) * k); }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const SKIN = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
    body.add(mk(geo, SKIN, 0, 0, 0, 0, 0, 0, 1, 0.85, 1));
    const fin = (pts, depth) => { const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }); g.translate(0, 0, -depth / 2); return g; };
    const FIN = PF.mat('#56789a', { rough: 0.45 });
    rig.fin = mk(fin([[-0.32, 0], [0.12, 0], [0.02, 0.55], [-0.08, 0.6]], 0.07), FIN, 0, 0.3, -0.05, 0, Math.PI / 2, 0); body.add(rig.fin);
    const tail = grp(0, 0, -1.15); tail.add(mk(fin([[0, 0], [-0.15, 0.55], [0.05, 0.5], [0.18, 0.05], [0.05, -0.4], [-0.12, -0.38]], 0.06), FIN, 0, 0, -0.08, 0, Math.PI / 2, 0)); body.add(tail); rig.tail = tail;
    for (const s of [1, -1]) { body.add(mk(fin([[0, 0], [0.42, -0.22], [0.3, -0.02]], 0.05), FIN, 0.36 * s, -0.12, 0.25, 0, s > 0 ? 0 : Math.PI, -0.2)); const e = eye(0.07, 0.27 * s, 0.14, 0.78, '#111'); body.add(e); rig.eyes.push(e); }
    const jaw = grp(0, -0.12, 0.6); body.add(jaw); rig.jaw = jaw;
    jaw.add(mk(G.rbox(0.62, 0.14, 0.58, 0.07), '#eef2f4', 0, -0.06, 0.12));
    const TEETH = PF.mat('#ffffff', { rough: 0.2 });
    for (let i = 0; i < 9; i++) { const a = -1.2 + i * 0.3; jaw.add(mk(G.cone(0.04, 0.1, 6), TEETH, Math.sin(a) * 0.26, 0.04, 0.12 + Math.cos(a) * 0.26)); body.add(mk(G.cone(0.04, 0.1, 6), TEETH, Math.sin(a) * 0.27, -0.12, 0.72 + Math.cos(a) * 0.26 - 0.26, Math.PI)); }
    return { root, rig, height: 1.0, radius: 1.2 };
  }

  /* ---------- compañeros (código) ---------- */
  function jumper() { // Brinca: canguro saltarina
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'hopper' }; root.add(body);
    const FUR = PF.mat('#e09a58', { rough: 0.8 }), CREAM = PF.mat('#f7dcb4', { rough: 0.8 });
    const torso = grp(0, 0.55, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.egg(0.32, 0.85, 0.2), FUR, 0, 0, 0, 0.18)); torso.add(mk(G.egg(0.22, 0.6, 0.2), CREAM, 0, 0.08, 0.12, 0.18, 0, 0, 1, 1, 0.8));
    const tail = mk(G.cone(0.14, 0.9, 14), FUR, 0, 0.12, -0.55, -1.25); torso.add(tail); rig.tail = tail;
    for (const s of [1, -1]) {
      const leg = grp(0.2 * s, 0.1, 0); leg.add(mk(G.sph(0.2, 16, 12), FUR, 0, 0, 0, 0, 0, 0, 0.9, 1.2, 1.2)); leg.add(mk(G.rbox(0.16, 0.12, 0.5, 0.06), '#ffffff', 0, -0.5, 0.12)); leg.add(mk(G.cyl(0.05, 0.05, 0.36, 10), FUR, 0, -0.3, 0)); leg.add(mk(G.tor(0.05, 0.02, 0, 12), '#8c96a3', 0, -0.62, 0.12, Math.PI / 2)); torso.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg;
      const arm = grp(0.22 * s, 0.6, 0.18); arm.add(mk(G.cyl(0.05, 0.04, 0.26, 10), FUR, 0, -0.12, 0)); arm.add(mk(G.sph(0.06, 10, 8), FUR, 0, -0.26, 0)); torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    const head = grp(0, 0.82, 0.12); torso.add(head); rig.head = head;
    head.add(mk(G.sph(0.24, 24, 18), FUR, 0, 0.12, 0)); head.add(mk(G.sph(0.14, 18, 12), CREAM, 0, 0.04, 0.2, 0, 0, 0, 1, 0.8, 1)); head.add(mk(G.sph(0.045, 10, 8), '#3a2418', 0, 0.09, 0.33));
    for (const s of [1, -1]) { head.add(mk(G.cone(0.08, 0.42, 12), FUR, 0.12 * s, 0.48, -0.05, -0.15, 0, -0.25 * s, 1, 1, 0.45)); const e = eye(0.055, 0.09 * s, 0.18, 0.2); head.add(e); rig.eyes.push(e); }
    head.add(mk(G.tor(0.235, 0.035, 0, 28), '#22b5a8', 0, 0.24, 0, Math.PI / 2 - 0.15));
    rig.bodyY = 0;
    return { root, rig, height: 1.8, radius: 0.4 };
  }
  function mount() { // Capi: capibara tranquila que te lleva
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'quad' }; root.add(body);
    const FUR = PF.mat('#a06f43', { rough: 0.9 });
    const trunk = mk(G.capsule(0.46, 0.75, 24), FUR, 0, 0.66, -0.05, Math.PI / 2); body.add(trunk); rig.trunk = trunk;
    const head = grp(0, 0.82, 0.62); body.add(head); rig.head = head;
    head.add(mk(G.rbox(0.5, 0.48, 0.6, 0.2), FUR, 0, 0.02, 0.18)); head.add(mk(G.rbox(0.42, 0.3, 0.2, 0.1), '#7e5532', 0, -0.06, 0.45));
    head.add(mk(G.rbox(0.2, 0.06, 0.04, 0.02), '#2a1a10', 0, 0.0, 0.56));
    for (const s of [1, -1]) { head.add(mk(G.sph(0.07, 10, 8), '#7e5532', 0.2 * s, 0.3, 0.0)); const e = eye(0.055, 0.17 * s, 0.12, 0.38, '#24160d'); e.scale.y = 0.55; head.add(e); rig.eyes.push(e); }
    head.add(mk(G.sph(0.13, 18, 14), '#ffd23f', 0, 0.36, 0.12)); head.add(mk(G.sph(0.06, 10, 8), '#5fbf3a', 0.06, 0.48, 0.12, 0, 0, 0, 1.4, 0.4, 0.8));
    body.add(mk(G.rbox(0.72, 0.12, 0.62, 0.06), '#f2e6c9', 0, 1.1, -0.05)); body.add(mk(G.rbox(0.56, 0.16, 0.5, 0.08), '#d8453b', 0, 1.18, -0.05));
    rig.legs = [];
    for (const [x, z] of [[0.26, 0.42], [-0.26, 0.42], [0.26, -0.5], [-0.26, -0.5]]) { const l = grp(x, 0.42, z); l.add(mk(G.cyl(0.11, 0.1, 0.42, 12), FUR, 0, -0.21, 0)); body.add(l); rig.legs.push(l); }
    rig.bodyY = 0; rig.seatY = 1.25;
    return { root, rig, height: 1.3, radius: 0.6 };
  }
  function tiny() { // Pipo: ratón pequeñito y rapidísimo
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'biped' }; root.add(body);
    const FUR = PF.mat('#a8b1bc', { rough: 0.8 });
    for (const s of [1, -1]) { const leg = grp(0.07 * s, 0.18, 0); leg.add(mk(G.cyl(0.03, 0.03, 0.12, 8), FUR, 0, -0.06, 0)); leg.add(mk(G.rbox(0.09, 0.07, 0.17, 0.03), '#ff9f1c', 0, -0.14, 0.03)); body.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg; }
    const torso = grp(0, 0.17, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.egg(0.13, 0.3, 0.2), FUR, 0, 0, 0)); torso.add(mk(G.tor(0.08, 0.035, 0, 18), '#3b82f6', 0, 0.27, 0, Math.PI / 2));
    const sc = grp(-0.04, 0.27, -0.08); sc.add(mk(G.rbox(0.06, 0.16, 0.03, 0.012), '#3b82f6', 0, -0.06, 0)); torso.add(sc); rig.scarf = sc;
    const tailPts = [new T.Vector3(0, 0.05, -0.1), new T.Vector3(0, 0.02, -0.3), new T.Vector3(0, 0.12, -0.45), new T.Vector3(0, 0.25, -0.48)];
    const tl = mk(new T.TubeGeometry(new T.CatmullRomCurve3(tailPts), 16, 0.012, 6), '#e8a2b4'); torso.add(tl); rig.tail = tl;
    for (const s of [1, -1]) { const arm = grp(0.1 * s, 0.2, 0.02); arm.add(mk(G.cyl(0.022, 0.02, 0.1, 8), FUR, 0, -0.05, 0)); torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm; }
    const head = grp(0, 0.29, 0); torso.add(head); rig.head = head;
    head.add(mk(G.sph(0.14, 22, 16), FUR, 0, 0.11, 0)); head.add(mk(G.sph(0.05, 12, 10), FUR, 0, 0.08, 0.13, 0, 0, 0, 1, 0.9, 1.2)); head.add(mk(G.sph(0.022, 10, 8), '#ff8fa3', 0, 0.09, 0.19));
    for (const s of [1, -1]) {
      head.add(mk(G.cyl(0.11, 0.11, 0.025, 22), FUR, 0.12 * s, 0.27, -0.02, Math.PI / 2, 0, 0.3 * s)); head.add(mk(G.cyl(0.075, 0.075, 0.03, 20), '#ffb6c8', 0.122 * s, 0.27, 0.0, Math.PI / 2, 0, 0.3 * s));
      const e = eye(0.035, 0.055 * s, 0.14, 0.11); head.add(e); rig.eyes.push(e);
      for (const k of [-1, 1]) head.add(mk(G.cyl(0.003, 0.003, 0.14, 4), '#4b5563', 0.07 * s, 0.08 + k * 0.012, 0.15, 0, 0, Math.PI / 2 + 0.15 * k));
    }
    rig.bodyY = 0;
    return { root, rig, height: 0.62, radius: 0.18 };
  }
  function flyer() { // Nubi: nube con alas que vuela y hace llover
    const root = grp(), body = grp(0, 0, 0), rig = { root, body, eyes: [], kind: 'cloud' }; root.add(body);
    const CL = PF.mat('#ffffff', { rough: 0.95, emissive: '#e9f2ff', glow: 0.25 });
    for (const [x, y, z, r] of [[0, 0.55, 0, 0.42], [0.36, 0.48, -0.02, 0.3], [-0.36, 0.48, -0.02, 0.3], [0.18, 0.78, -0.05, 0.28], [-0.2, 0.74, -0.05, 0.26], [0.55, 0.42, -0.05, 0.2], [-0.55, 0.42, -0.05, 0.2], [0, 0.4, -0.2, 0.32]]) body.add(mk(G.sph(r, 22, 16), CL, x, y, z));
    for (const s of [1, -1]) { const e = eye(0.06, 0.13 * s, 0.6, 0.36, '#2a3550'); body.add(e); rig.eyes.push(e); body.add(mk(G.sph(0.06, 12, 10), PF.mat('#ff9fb8', { rough: 0.9 }), 0.25 * s, 0.5, 0.33, 0, 0, 0, 1, 0.6, 0.4)); }
    const sm = smile(0.06, 0.014, '#3a3550'); sm.position.set(0, 0.47, 0.4); sm.rotation.set(0.2, 0, Math.PI * 1.05); body.add(sm);
    rig.wings = [];
    for (const s of [1, -1]) { const w = grp(0.5 * s, 0.62, -0.15); for (let i = 0; i < 3; i++) w.add(mk(G.sph(0.13, 12, 10), PF.mat('#eef4ff', { rough: 0.9 }), 0.12 * s + i * 0.1 * s, 0.08 - i * 0.06, -0.02 * i, 0, 0, 0, 1.4, 0.45, 0.6)); body.add(w); rig.wings.push(w); }
    rig.bodyY = 0; rig.hover = 2.3;
    return { root, rig, height: 1.0, radius: 0.6 };
  }
  function strong() { // Roca: gólem amable y muy fuerte
    const root = grp(), body = grp(), rig = { root, body, eyes: [], kind: 'biped' }; root.add(body);
    const ST = PF.mat('#8c95a1', { rough: 0.92, flat: true }), ST2 = PF.mat('#77808c', { rough: 0.95, flat: true }), MOSS = PF.mat('#67b84a', { rough: 1 });
    for (const s of [1, -1]) { const leg = grp(0.33 * s, 0.62, 0); leg.add(mk(G.ico(0.3, 1), ST2, 0, -0.3, 0, 0, 0, 0, 1, 1.1, 1)); leg.add(mk(G.rbox(0.44, 0.22, 0.56, 0.08), ST, 0, -0.55, 0.06)); body.add(leg); rig[s > 0 ? 'legL' : 'legR'] = leg; }
    const torso = grp(0, 0.62, 0); body.add(torso); rig.torso = torso;
    torso.add(mk(G.ico(0.68, 1), ST, 0, 0.55, 0, 0.2, 0.3, 0, 1.1, 1.0, 0.85));
    torso.add(mk(G.sph(0.26, 14, 10), MOSS, 0.34, 0.95, 0.38, 0, 0, 0, 1, 0.45, 0.7)); torso.add(mk(G.sph(0.2, 14, 10), MOSS, -0.4, 0.5, 0.42, 0, 0, 0, 1, 0.45, 0.7));
    for (const s of [1, -1]) {
      const arm = grp(0.78 * s, 0.92, 0); arm.add(mk(G.ico(0.3, 1), ST2, 0, 0, 0)); arm.add(mk(G.ico(0.24, 1), ST, 0.05 * s, -0.42, 0.04)); arm.add(mk(G.ico(0.38, 1), ST2, 0.08 * s, -0.86, 0.1, 0, 0, 0, 1.1, 0.95, 1.1));
      torso.add(arm); rig[s > 0 ? 'armL' : 'armR'] = arm;
    }
    const head = grp(0, 1.25, 0.06); torso.add(head); rig.head = head;
    head.add(mk(G.ico(0.38, 1), ST, 0, 0.28, 0, 0.3, 0.6, 0));
    for (const s of [1, -1]) { const e = eye(0.06, 0.13 * s, 0.32, 0.31, '#1e2a3a'); head.add(e); rig.eyes.push(e); }
    const sm = smile(0.08, 0.018, '#3a3f4a'); sm.position.set(0, 0.16, 0.33); sm.rotation.set(0.25, 0, Math.PI * 1.05); head.add(sm);
    head.add(mk(G.sph(0.14, 12, 10), MOSS, 0, 0.6, -0.02, 0, 0, 0, 1.4, 0.4, 1.2));
    const fl = grp(0.06, 0.66, 0.02); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; fl.add(mk(G.sph(0.07, 10, 8), '#ff7eb6', Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08, 0, 0, 0, 1, 0.4, 1)); } fl.add(mk(G.sph(0.045, 10, 8), '#ffd84d', 0, 0.08, 0)); fl.add(mk(G.cyl(0.01, 0.01, 0.12, 6), '#3f8f2f', 0, 0, 0)); head.add(fl);
    rig.bodyY = 0;
    return { root, rig, height: 2.3, radius: 0.75 };
  }

  /* ---------- piezas de juego (código) ---------- */
  function ladder(len) {
    const root = grp(), WOOD = PF.mat('#b97a45', { rough: 0.7, map: 'wood' }), RUNG = PF.mat('#d39a5c', { rough: 0.6 });
    for (const s of [1, -1]) root.add(mk(G.rbox(0.09, len, 0.1, 0.03), WOOD, 0.48 * s, len / 2, 0));
    const rungs = []; for (let y = 0.32; y < len - 0.1; y += 0.34) { const r = mk(G.cyl(0.035, 0.035, 0.92, 10), RUNG, 0, y, 0, 0, 0, Math.PI / 2); root.add(r); rungs.push(r); }
    return { root, rungs };
  }
  function bridge(len, width, material) {
    const root = grp(), stone = material === 'stone', planks = [];
    const P1 = stone ? PF.mat('#b7b2c4', { rough: 0.85, map: 'stone' }) : PF.mat('#c58b52', { rough: 0.75, map: 'wood' }), P2 = stone ? PF.mat('#a19cb1', { rough: 0.9 }) : PF.mat('#a86f3d', { rough: 0.8 });
    const n = Math.round(len / 0.36);
    for (let i = 0; i < n; i++) { const z = -len / 2 + (i + 0.5) * (len / n); const p = mk(G.rbox(width, 0.12, len / n - 0.04, 0.03), i % 3 ? P1 : P2, 0, 0, z, 0, (U.R() - 0.5) * 0.04, (U.R() - 0.5) * 0.03); root.add(p); planks.push(p); }
    const posts = [];
    for (const s of [1, -1]) for (let z = -len / 2; z <= len / 2 + 0.01; z += len / 4) { const p = mk(G.cyl(0.06, 0.07, 1.0, 10), P2, (width / 2 + 0.02) * s, 0.45, z); root.add(p); posts.push(p); }
    const rails = []; for (const s of [1, -1]) { const r = mk(G.rbox(0.07, 0.07, len, 0.03), P1, (width / 2 + 0.02) * s, 0.9, 0); root.add(r); rails.push(r); }
    return { root, planks, posts, rails };
  }
  const flowerGeos = [];
  function flowerGeo(v) {
    if (flowerGeos[v]) return flowerGeos[v];
    const petal = ['#ff7eb6', '#ffffff', '#ffd84d', '#b48cff', '#ff9c5a', '#7cc8ff'][v % 6], center = v % 6 === 2 ? '#ff8a3a' : '#ffd84d';
    const parts = [{ geo: G.cyl(0.018, 0.022, 0.34, 6), c: '#3f9b3a', m: PF.mtx(0, 0.17, 0) }, { geo: G.sph(0.06, 8, 6), c: '#4fb043', m: PF.mtx(0.06, 0.12, 0, 0, 0, -0.6, 1.4, 0.35, 0.8) }];
    const n = 5 + (v % 2); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; parts.push({ geo: G.sph(0.06, 10, 8), c: petal, m: PF.mtx(Math.cos(a) * 0.07, 0.35, Math.sin(a) * 0.07, 0, -a, 0.3, 1.3, 0.35, 0.8) }); }
    parts.push({ geo: G.sph(0.04, 10, 8), c: center, m: PF.mtx(0, 0.37, 0, 0, 0, 0, 1, 0.6, 1) });
    flowerGeos[v] = PF.merge(parts); return flowerGeos[v];
  }
  function tree(seed, h) {
    const r = U.rng(seed || 1); h = h || 4 + r() * 2;
    const parts = [{ geo: G.cyl(0.18, 0.28, h * 0.5, 10), c: '#8a5a36', m: PF.mtx(0, h * 0.25, 0) }];
    const greens = ['#4fbf4a', '#5fd05a', '#3fae4a', '#6ad46a'];
    for (let i = 0; i < 4; i++) { const a = r() * 6.28, rr = i ? 0.6 + r() * 0.3 : 0; parts.push({ geo: G.ico(h * (i ? 0.2 : 0.27) + r() * 0.2, 1), c: greens[Math.floor(r() * 4)], m: PF.mtx(Math.cos(a) * rr, h * (0.62 + (i ? r() * 0.2 : 0.08)), Math.sin(a) * rr, r(), r(), r(), 1, 0.9, 1) }); }
    return PF.merge(parts);
  }
  function gem() { const g = mk(new T.OctahedronGeometry(0.28, 0), PF.mat('#41c7ff', { rough: 0.15, metal: 0.3, emissive: '#1a8fff', glow: 0.55, flat: true }), 0, 0, 0, 0, 0, 0, 0.8, 1.15, 0.8); return g; }
  function heart() { const s = new T.Shape(); s.moveTo(0, -0.35); s.bezierCurveTo(-0.45, 0.0, -0.4, 0.38, 0, 0.18); s.bezierCurveTo(0.4, 0.38, 0.45, 0.0, 0, -0.35); const g = new T.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 16 }); g.translate(0, 0, -0.07); return mk(g, PF.mat('#ff4d6d', { rough: 0.3, emissive: '#ff1f4d', glow: 0.35 })); }
  function spring() { const root = grp(); root.add(mk(G.cyl(0.55, 0.6, 0.12, 24), '#3a4250', 0, 0.06, 0)); const coil = grp(0, 0.12, 0); for (let i = 0; i < 5; i++) coil.add(mk(G.tor(0.34, 0.045, 0, 24), PF.mat('#c9d2dd', { metal: 0.8, rough: 0.25 }), 0, 0.09 + i * 0.12, 0, Math.PI / 2)); root.add(coil); const pad = mk(G.cyl(0.55, 0.55, 0.14, 24), '#ff5a5a', 0, 0.78, 0); root.add(pad); return { root, coil, pad }; }
  function crate() { const root = grp(), W = PF.mat('#c98d52', { map: 'wood', rough: 0.8 }); root.add(mk(G.rbox(1.1, 1.1, 1.1, 0.05), W, 0, 0.55, 0)); for (const z of [0.56, -0.56]) root.add(mk(G.box(1.12, 0.14, 0.04), '#8a5a2e', 0, 0.55, z, 0, 0, 0.78)); return root; }
  function rock(seed) { const r = U.rng(seed || 3); return mk(G.ico(0.7 + r() * 0.4, 1), PF.mat('#a39fb3', { flat: true, rough: 0.95 }), 0, 0.45, 0, r(), r(), r(), 1.2, 0.8, 1); }
  function lantern() { const root = grp(); root.add(mk(G.cyl(0.07, 0.09, 2.2, 10), '#3a3f4a', 0, 1.1, 0)); root.add(mk(G.rbox(0.36, 0.42, 0.36, 0.06), PF.mat('#ffe7a3', { emissive: '#ffbf4d', glow: 1.6 }), 0, 2.4, 0)); root.add(mk(G.cone(0.3, 0.22, 4), '#3a3f4a', 0, 2.72, 0, 0, Math.PI / 4)); return root; }
  function balloon(color) { const root = grp(); root.add(mk(G.sph(0.45, 24, 18), PF.mat(color || '#ff5a7a', { rough: 0.25 }), 0, 2.6, 0, 0, 0, 0, 1, 1.15, 1)); root.add(mk(G.cyl(0.006, 0.006, 2.1, 4), '#ffffff', 0, 1.1, 0)); return root; }
  function campfire() { const root = grp(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; root.add(mk(G.cyl(0.08, 0.1, 0.9, 8), '#7a4a2a', Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25, 0.9, -a, 0)); } for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; root.add(mk(G.ico(0.14, 0), '#8a8f99', Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55)); } return root; }
  function fence(len) { const root = grp(), W = PF.mat('#d9a066', { rough: 0.8 }); const n = Math.max(2, Math.round(len / 1.2) + 1); for (let i = 0; i < n; i++) root.add(mk(G.rbox(0.14, 1.0, 0.14, 0.04), W, -len / 2 + (i * len) / (n - 1), 0.5, 0)); for (const y of [0.35, 0.75]) root.add(mk(G.rbox(len, 0.1, 0.06, 0.03), W, 0, y, 0)); return root; }
  function platform(w, d) { const root = grp(); root.add(mk(G.rbox(w, 0.5, d, 0.12), PF.mat('#b9824f', { map: 'dirt' }), 0, -0.25, 0)); root.add(mk(G.rbox(w + 0.06, 0.16, d + 0.06, 0.07), PF.mat('#5fcf55', { map: 'grass' }), 0, -0.04, 0)); return root; }
  // complementos que se pueden poner a cualquier personaje (la altura y el radio los adaptan)
  function wearable(item, h, r) {
    const g = grp();
    if (item === 'crown') { const GOLD = PF.mat('#f6c945', { metal: 0.85, rough: 0.25 }); g.add(mk(G.cyl(r * 0.45, r * 0.4, h * 0.1, 24), GOLD, 0, 0, 0)); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mk(G.cone(r * 0.1, h * 0.12, 10), GOLD, Math.sin(a) * r * 0.42, h * 0.1, Math.cos(a) * r * 0.42)); } g.userData.at = 'top'; }
    else if (item === 'sunglasses') { for (const s of [1, -1]) g.add(mk(G.rbox(r * 0.32, r * 0.18, 0.04, 0.03), PF.mat('#111318', { rough: 0.1, metal: 0.5 }), r * 0.2 * s, 0, 0)); g.add(mk(G.box(r * 0.2, 0.03, 0.03), '#111318', 0, 0.02, 0)); g.userData.at = 'eyes'; }
    else if (item === 'hat') { g.add(mk(G.cyl(r * 0.6, r * 0.6, 0.04, 28), '#2b2f3a', 0, 0, 0)); g.add(mk(G.cyl(r * 0.38, r * 0.4, h * 0.16, 24), '#2b2f3a', 0, h * 0.08, 0)); g.add(mk(G.cyl(r * 0.405, r * 0.405, h * 0.04, 24), '#e0453a', 0, h * 0.03, 0)); g.userData.at = 'top'; }
    else if (item === 'bow') { g.add(mk(G.sph(r * 0.16, 12, 10), '#ff4fa3', r * 0.17, 0, 0, 0, 0, 0, 1.2, 0.8, 0.5)); g.add(mk(G.sph(r * 0.16, 12, 10), '#ff4fa3', -r * 0.17, 0, 0, 0, 0, 0, 1.2, 0.8, 0.5)); g.add(mk(G.sph(r * 0.08, 10, 8), '#ff2f8a', 0, 0, 0)); g.userData.at = 'top'; }
    else if (item === 'cape') { g.add(mk(new T.CylinderGeometry(r * 0.5, r * 0.9, h * 0.5, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), PF.mat('#7c3aed', { side: true, rough: 0.6 }), 0, -h * 0.25, 0)); g.userData.at = 'back'; }
    else if (item === 'scarf') { g.add(mk(G.tor(r * 0.42, r * 0.12, 0, 24), '#e0453a', 0, 0, 0, Math.PI / 2)); g.userData.at = 'neck'; }
    else return null;
    return g;
  }

  /* ---------- animación procedural (sirve para todos los esqueletos de código) ---------- */
  function animate(m, st, dt) {
    const r = m.rig; if (!r) return;
    const t = (r.t = (r.t || 0) + dt), sp = st.speed || 0, mode = st.mode || 'idle';
    const rate = mode === 'run' ? 12 : mode === 'walk' ? 8.5 : mode === 'climb' ? 7 : mode === 'swim' ? 5 : 0;
    r.ph = (r.ph || 0) + dt * rate * U.clamp(sp / (mode === 'run' ? 8 : 4.5), 0.55, 1.5);
    const ph = r.ph, k = 1 - Math.exp(-14 * dt);
    const set = (o, x, y, z) => { if (!o) return; o.rotation.x += (x - o.rotation.x) * k; if (y != null) o.rotation.y += (y - o.rotation.y) * k; if (z != null) o.rotation.z += (z - o.rotation.z) * k; };
    // parpadeo
    r.blink = (r.blink || 2 + Math.random() * 3) - dt; const closed = r.blink < 0.12; if (r.blink < 0) r.blink = 2.5 + Math.random() * 3;
    for (const e of r.eyes) e.scale.y = closed && r.kind !== 'golem' ? 0.12 : (e.userData.sy || (e.userData.sy = e.scale.y));
    let bob = 0, lean = 0;
    if (r.kind === 'biped' || r.kind === 'dress' || r.kind === 'golem') {
      let lA = 0, aA = 0, aZ = 0.12, aX2 = null;
      if (mode === 'walk' || mode === 'run') { const amp = mode === 'run' ? 0.95 : 0.6; lA = Math.sin(ph) * amp; aA = -lA * 0.9; bob = Math.abs(Math.cos(ph)) * (mode === 'run' ? 0.07 : 0.035); lean = mode === 'run' ? 0.16 : 0.05; }
      else if (mode === 'jump') { lA = 0.5; aA = -2.3; aZ = 0.45; }
      else if (mode === 'fall') { lA = -0.25; aA = -0.6; aZ = 1.0; }
      else if (mode === 'climb') { lA = Math.sin(ph) * 0.55; aX2 = -2.6; aA = Math.sin(ph) * 0.35; lean = -0.05; }
      else if (mode === 'cheer') { aX2 = -2.9; aZ = 0.35 + Math.sin(t * 9) * 0.15; bob = Math.abs(Math.sin(t * 6)) * 0.12; }
      else if (mode === 'dance') { lA = Math.sin(t * 6) * 0.35; aX2 = -2.4 + Math.sin(t * 6) * 0.5; aZ = 0.6; bob = Math.abs(Math.sin(t * 6)) * 0.06; }
      else if (mode === 'throw') { aX2 = null; }
      else if (mode === 'sit') { lA = -1.4; aA = -0.4; }
      else { aA = Math.sin(t * 1.8) * 0.05; bob = Math.sin(t * 2.2) * 0.012; }
      set(r.legL, -lA); set(r.legR, lA);
      if (aX2 != null) { set(r.armL, aX2 + (mode === 'climb' ? aA : 0), 0, aZ); set(r.armR, aX2 - (mode === 'climb' ? aA : 0), 0, -aZ); }
      else if (mode === 'throw') { set(r.armR, -2.6 + Math.sin(st.k * Math.PI) * 2.4, 0, -0.3); set(r.armL, 0.2, 0, 0.4); }
      else { set(r.armL, aA, 0, aZ); set(r.armR, -aA, 0, -aZ); }
      if (r.kind === 'dress' && r.body) { r.body.rotation.z = Math.sin(ph) * (mode === 'walk' || mode === 'run' ? 0.05 : 0.01); }
      if (r.scarf) r.scarf.rotation.x = 0.3 + Math.sin(t * 7) * 0.15 + Math.min(sp, 8) * 0.06;
      if (r.cape) r.cape.rotation.x = Math.min(sp, 8) * 0.03 + Math.sin(t * 3) * 0.02;
      if (r.hoodL) { const f = Math.min(sp, 9) * 0.03 + (mode === 'jump' || mode === 'fall' ? 0.14 : 0) + Math.sin(t * 9) * Math.min(sp, 9) * 0.004; r.hoodL.rotation.y += (f - r.hoodL.rotation.y) * k; r.hoodR.rotation.y += (-f - r.hoodR.rotation.y) * k; }
    } else if (r.kind === 'imp') {
      const mv = mode === 'walk' || mode === 'run', stomp = st.angry || mode === 'angry';
      const hop = mv ? Math.abs(Math.sin(ph)) : stomp ? Math.max(0, Math.sin(t * 7)) : 0; bob = hop * (mv ? 0.06 : 0.03) + Math.sin(t * 3) * 0.008;
      set(r.legL, mv ? Math.sin(ph) * 0.6 : stomp ? -Math.max(0, Math.sin(t * 7)) * 0.7 : 0); set(r.legR, mv ? -Math.sin(ph) * 0.6 : stomp ? -Math.max(0, Math.sin(t * 7 + Math.PI)) * 0.7 : 0);
      set(r.armL, stomp ? -1.2 + Math.sin(t * 7) * 0.4 : Math.sin(t * 2) * 0.1, 0, 0.3); set(r.armR, stomp ? -1.2 - Math.sin(t * 7) * 0.4 : -Math.sin(t * 2) * 0.1, 0, -0.3);
      if (r.lava) r.lava.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.3 + (stomp ? 0.4 : 0);
    } else if (r.kind === 'blob') {
      bob = Math.abs(Math.sin(ph)) * 0.08 + Math.sin(t * 2) * 0.03; r.body.scale.y = 1 + Math.sin(t * 2.2) * 0.025 + (st.angry ? Math.abs(Math.sin(t * 10)) * 0.05 : 0); r.body.scale.x = r.body.scale.z = 1 - (r.body.scale.y - 1) * 0.5;
    } else if (r.kind === 'hopper') {
      const hop = mode === 'walk' || mode === 'run' ? Math.abs(Math.sin(ph * 0.75)) : 0; bob = hop * 0.45 + (mode === 'jump' ? 0.2 : 0); lean = 0.12 + hop * 0.1;
      set(r.legL, -hop * 0.6 + 0.1); set(r.legR, -hop * 0.6 + 0.1); if (r.tail) r.tail.rotation.x = -1.25 + hop * 0.3;
      set(r.armL, mode === 'cheer' ? -2.6 : -0.4 + Math.sin(t * 2) * 0.05, 0, 0.1); set(r.armR, mode === 'cheer' ? -2.6 : -0.4, 0, -0.1);
    } else if (r.kind === 'quad') {
      const mv = mode === 'walk' || mode === 'run'; r.legs.forEach((l, i) => { l.rotation.x = mv ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
      bob = mv ? Math.abs(Math.sin(ph)) * 0.04 : Math.sin(t * 1.5) * 0.01; if (r.head) r.head.rotation.x = Math.sin(t * 0.8) * 0.04;
    } else if (r.kind === 'cloud') {
      bob = Math.sin(t * 2.4) * 0.12; r.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(t * 14) * 0.5); });
      r.body.rotation.z = Math.sin(t * 1.3) * 0.06;
    } else if (r.kind === 'shark') {
      if (r.tail) r.tail.rotation.y = Math.sin(t * 8) * 0.35; if (r.jaw) r.jaw.rotation.x = st.bite ? -0.7 * st.bite : Math.max(0, Math.sin(t * 1.3)) * 0.06;
    }
    if (r.kind === 'golem' && r.lava) r.lava.emissiveIntensity = (st.calm ? 0.7 : 1.4) + Math.sin(t * 3) * 0.35;
    if (r.kind === 'golem' && r.mouthAngry) { const happy = !!st.happy; r.mouthAngry.visible = !happy; r.mouthHappy.visible = happy; for (const b of r.brows) b.m.rotation.z += ((happy ? -0.18 : 0.32) * b.s - b.m.rotation.z) * k; }
    if (r.body) { r.body.position.y = (r.bodyY || 0) + bob; if (r.kind !== 'cloud' && r.kind !== 'shark') r.body.rotation.x = U.damp(r.body.rotation.x, lean, 10, dt); }
    if (r.head && mode === 'idle' && r.kind !== 'quad') r.head.rotation.y = Math.sin(t * 0.7) * 0.18;
  }

  /* ---------- manifiesto y GLB (solo para el reparto inicial) ----------
     assets/platform/manifest.json: { "assets": { "<id>": { "file": "models/x.glb" | null, "height": metros, "rotateY": rad,
     "animations": { "idle": "<clip>", "walk": …, "run", "jump", "fall", "climb", "cheer", "dance", "throw" }, "origin", "license" } } }
     Cada id arranca con su modelo de código; si el manifiesto trae un fichero, se carga en segundo plano y lo sustituye.
     Si el GLB no trae animaciones, se anima por código (rebote, inclinación, estirar y encoger, giros). */
  const BUILD = { hero, princess, enemy, boss, shark, 'companion-jumper': jumper, 'companion-mount': mount, 'companion-tiny': tiny, 'companion-flyer': flyer, 'companion-strong': strong };
  let manifest = { assets: {} };
  const glbCache = new Map();
  const glbState = {}; // id → 'procedural' | 'loading' | 'glb' | 'error: …'
  async function loadManifest(ms) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 2500);
      const r = await fetch('assets/platform/manifest.json', { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
      if (r.ok) manifest = await r.json();
    } catch (e) { console.warn('manifest:', e && e.message ? e.message : e); }
    manifest.assets = manifest.assets || {};
    // ?glb=0 en la URL: solo modelos de código (para probar los respaldos o si un GLB da problemas en directo)
    if (/[?&]glb=0\b/.test(location.search)) for (const k of Object.keys(manifest.assets)) manifest.assets[k] = Object.assign({}, manifest.assets[k], { file: null });
    // ?glb=id:fichero[:altura],… prueba un GLB sin tocar el manifiesto (por ejemplo, ?glb=hero:models/hero-v2.glb:1.5)
    const over = (new URLSearchParams(location.search).get('glb') || '').split(',').map((x) => x.split(':')).filter((x) => x.length >= 2 && BUILD[x[0]] && /^[\w./-]+\.glb$/i.test(x[1]) && !/\.\./.test(x[1]));
    for (const [id, file, h] of over) manifest.assets[id] = Object.assign({}, manifest.assets[id], { file, sourceHeight: undefined, animations: undefined, height: +h || (manifest.assets[id] && manifest.assets[id].height) });
    for (const id of Object.keys(BUILD)) glbState[id] = manifest.assets[id] && manifest.assets[id].file ? 'loading' : 'procedural';
    return manifest;
  }
  function loadGLB(file, ms) {
    if (glbCache.has(file)) return glbCache.get(file);
    const p = new Promise((res, rej) => {
      if (!T.GLTFLoader) return rej(new Error('sin GLTFLoader'));
      const to = setTimeout(() => rej(new Error('tiempo agotado')), ms || 30000);
      new T.GLTFLoader().load('assets/platform/' + file, (g) => { clearTimeout(to); res(g); }, undefined, (e) => { clearTimeout(to); rej(e); });
    });
    glbCache.set(file, p); return p;
  }
  // empieza a descargar los GLB del manifiesto mientras se ve la portada (no bloquea la carga del nivel)
  function preload() { for (const spec of Object.values(manifest.assets)) if (spec && spec.file) loadGLB(spec.file).catch(() => {}); }
  const CLIP_WORDS = { idle: ['idle', 'breath', 'stand'], walk: ['walk'], run: ['run', 'sprint'], jump: ['jump'], fall: ['fall', 'jump'], climb: ['climb'], cheer: ['cheer', 'celebrat', 'victory'], dance: ['dance'], throw: ['throw', 'taunt', 'attack', 'punch'], angry: ['stomp', 'angry'], wave: ['wave'], victory: ['victory', 'celebrat'], heart: ['heart'], hit: ['hit'] };
  const ONCE = new Set(['jump', 'fall', 'hit', 'wave', 'victory', 'heart']);
  function character(id) {
    const make = BUILD[id]; if (!make) throw new Error('modelo desconocido: ' + id);
    const proc = make(), holder = grp(); holder.add(proc.root);
    const spec = manifest.assets && manifest.assets[id];
    // el modelo de código se escala a la altura del juego (la misma que tendrá el GLB)
    if (spec && spec.height && Math.abs(spec.height - proc.height) > 1e-3) { const k = spec.height / proc.height; proc.root.scale.multiplyScalar(k); proc.height = spec.height; proc.radius *= k; for (const key of ['waistY', 'waistR', 'seatY', 'hover']) if (proc.rig && proc.rig[key] != null) proc.rig[key] *= k; proc.k = k; }
    const ch = { id, root: holder, model: proc, rig: proc.rig, height: proc.height, radius: proc.radius, glb: null, glbInner: null, mixer: null, actions: {}, cur: null, curState: null, once: null, bones: {}, mats: [], spec: null, extras: [], t: 0, ph: 0, sq: 1 };
    if (spec && spec.file) {
      loadGLB(spec.file).then((g) => {
        const sc = T.SkeletonUtils ? T.SkeletonUtils.clone(g.scene) : g.scene.clone(true);
        if (spec.rotateY) sc.rotation.y = spec.rotateY;
        const h = spec.height || proc.height;
        if (spec.sourceHeight) sc.scale.multiplyScalar(h / spec.sourceHeight); // GLB con esqueleto: la caja de la malla no vale, se escala por su altura natural
        else {
          sc.updateMatrixWorld(true);
          const box = new T.Box3().setFromObject(sc), size = box.getSize(new T.Vector3()); sc.scale.multiplyScalar(h / Math.max(0.01, size.y)); sc.updateMatrixWorld(true);
          const b2 = new T.Box3().setFromObject(sc), c = b2.getCenter(new T.Vector3()); sc.position.set(-c.x, -b2.min.y, -c.z);
        }
        sc.traverse((o) => {
          if (o.isBone) ch.bones[o.name] = o;
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.anisotropy = 4; ch.mats.push(m); } }
        });
        if (spec.glow) for (const m of ch.mats) { m.emissive = PF.col(spec.glow); m.emissiveMap = m.map || null; m.emissiveIntensity = spec.glowIntensity || 0.5; m.needsUpdate = true; }
        const wrap = grp(), inner = grp(); inner.add(sc); wrap.add(inner); holder.remove(proc.root); holder.add(wrap);
        ch.glb = wrap; ch.glbInner = inner; ch.rig = null; ch.height = h; ch.spec = spec;
        for (const x of ch.extras) reattach(ch, x);
        if (g.animations && g.animations.length) {
          ch.mixer = new T.AnimationMixer(sc);
          const names = spec.animations || {}, low = (a) => String(a.name || '').toLowerCase();
          for (const st of Object.keys(CLIP_WORDS)) {
            const want = names[st];
            const clip = (want && (g.animations.find((a) => a.name === want) || g.animations.find((a) => low(a) === String(want).toLowerCase()))) || (names[st] === undefined && g.animations.find((a) => CLIP_WORDS[st].some((w) => low(a).includes(w))));
            if (clip) ch.actions[st] = ch.mixer.clipAction(clip);
          }
          if (!ch.actions.idle) ch.actions.idle = ch.mixer.clipAction(g.animations[0]);
          ch.actions.idle.play(); ch.cur = ch.actions.idle; ch.curState = 'idle';
        }
        glbState[id] = 'glb'; if (PF.emit) PF.emit('glb', { id, file: spec.file, animated: !!ch.mixer, clips: (g.animations || []).map((a) => a.name) });
        console.info('GLB cargado:', id, spec.file, ch.mixer ? 'con ' + g.animations.length + ' animaciones' : 'animado por código');
      }).catch((e) => { glbState[id] = 'error: ' + (e && e.message ? e.message : e); console.warn('GLB de ' + id + ' no disponible (se queda el procedural):', e && e.message ? e.message : e); });
    }
    return ch;
  }
  // complementos (tutú, corona…): en un GLB con esqueleto van pegados al hueso que toca, con su tamaño en metros
  const BONE_FOR = { hips: ['Hips'], head: ['head_end', 'Head'], face: ['headfront', 'Head'], neck: ['neck', 'Neck', 'Spine'], back: ['Spine01', 'Spine'] };
  function boneFor(ch, where) { for (const n of BONE_FOR[where] || []) if (ch.bones[n]) return ch.bones[n]; return null; }
  function reattach(ch, obj) {
    const where = obj.userData.bone, bone = where && boneFor(ch, where);
    if (!bone) { obj.position.set(0, obj.userData.y || 0, obj.userData.z || 0); ch.glb.add(obj); return; }
    ch.glb.updateWorldMatrix(true, true);
    let y = obj.userData.y || 0;
    if (where === 'hips') { const bp = new T.Vector3(); bone.getWorldPosition(bp); ch.glb.worldToLocal(bp); y = bp.y + (obj.userData.dy || 0); }
    // misma posición respecto a los pies que en el modelo de código, compensando la escala y el giro del hueso
    const want = new T.Matrix4().compose(new T.Vector3(0, y, obj.userData.z || 0), new T.Quaternion(), obj.userData.s0 || obj.scale.clone());
    const world = ch.glb.matrixWorld.clone().multiply(want), local = bone.matrixWorld.clone().invert().multiply(world);
    local.decompose(obj.position, obj.quaternion, obj.scale); bone.add(obj);
  }
  function attach(ch, obj, where, y, z) {
    obj.userData.bone = where; obj.userData.y = y; obj.userData.z = z || 0; obj.userData.s0 = obj.scale.clone(); obj.position.set(0, y, z || 0);
    ch.extras.push(obj);
    if (ch.glb) reattach(ch, obj); else ch.root.add(obj);
  }
  // una animación suelta (saludar, recibir un golpe, celebrar): manda sobre el estado durante su duración
  function playOnce(ch, state, sec) {
    if (!ch || !ch.mixer || !ch.actions[state]) { if (ch) ch.onceCode = { state, until: PF.time + (sec || 1.2) }; return false; }
    const a = ch.actions[state], dur = sec || a.getClip().duration;
    ch.once = { state, until: PF.time + dur };
    fadeTo(ch, a, 0.15, true, 0);
    return true;
  }
  function fadeTo(ch, a, dur, once, from) {
    const prev = ch.cur; if (prev === a) return;
    a.enabled = true; a.setEffectiveTimeScale(1); a.setEffectiveWeight(1);
    if (once) { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; } else { a.setLoop(T.LoopRepeat, Infinity); a.clampWhenFinished = false; }
    a.reset(); if (from) a.time = from; a.play();
    if (prev) a.crossFadeFrom(prev, dur, false);
    ch.cur = a;
  }
  // GLB sin esqueleto (o sin el clip que toca): rebote, inclinación, estirar y encoger y giros por código
  function animateStatic(ch, st, dt) {
    const w = ch.glbInner; if (!w) return;
    ch.t += dt; const t = ch.t, mode = st.mode || 'idle', sp = st.speed || 0, h = ch.height || 1.6;
    const rate = mode === 'run' ? 11 : mode === 'walk' ? 8 : mode === 'climb' ? 7 : 0;
    ch.ph += dt * rate * U.clamp(sp / (mode === 'run' ? 8 : 4.5), 0.55, 1.5);
    let bob = 0, pitch = 0, roll = 0, yaw = 0, sq = 1;
    if (mode === 'walk' || mode === 'run') { const run = mode === 'run'; bob = Math.abs(Math.sin(ch.ph)) * (run ? 0.07 : 0.045) * h; roll = Math.sin(ch.ph) * (run ? 0.08 : 0.055); pitch = run ? 0.13 : 0.05; sq = 1 + Math.cos(ch.ph * 2) * (run ? 0.045 : 0.03); }
    else if (mode === 'jump') { sq = 1.1; pitch = -0.06; }
    else if (mode === 'fall') { sq = 0.95; pitch = 0.05; }
    else if (mode === 'climb') { bob = Math.abs(Math.sin(ch.ph)) * 0.03 * h; roll = Math.sin(ch.ph) * 0.07; }
    else if (mode === 'cheer') { bob = Math.abs(Math.sin(t * 7)) * 0.08 * h; sq = 1 + Math.sin(t * 14) * 0.05; }
    else if (mode === 'dance') { bob = Math.abs(Math.sin(t * 6)) * 0.05 * h; roll = Math.sin(t * 3) * 0.15; yaw = Math.sin(t * 1.5) * 0.6; sq = 1 + Math.sin(t * 12) * 0.04; }
    else if (mode === 'throw') { const k = Math.sin((st.k || 0) * Math.PI); pitch = -k * 0.22; sq = 1 + k * 0.06; }
    else if (mode === 'sit') sq = 0.93;
    else if (mode !== 'still') { sq = 1 + Math.sin(t * 2.2) * 0.018; roll = Math.sin(t * 0.9) * 0.02; }
    const k = 1 - Math.exp(-12 * dt);
    ch.sq += (sq - ch.sq) * k; w.position.y += (bob - w.position.y) * k;
    w.rotation.x += (pitch - w.rotation.x) * k; w.rotation.z += (roll - w.rotation.z) * k; w.rotation.y += (yaw - w.rotation.y) * k;
    const sxz = 1 / Math.sqrt(ch.sq); w.scale.set(sxz, ch.sq, sxz);
  }
  function animateCharacter(ch, st, dt) {
    if (ch.mixer) {
      let state = st.mode || 'idle';
      // una animación suelta manda mientras dura, salvo que el personaje eche a andar o a saltar (el golpe sí manda siempre)
      if (ch.once && PF.time < ch.once.until && (ch.once.state === 'hit' || !/^(walk|run|jump|fall|climb)$/.test(state))) state = ch.once.state; else ch.once = null;
      const alias = { sit: 'idle', fall: ch.actions.fall ? 'fall' : 'jump', climb: ch.actions.climb ? 'climb' : 'walk', cheer: ch.actions.cheer ? 'cheer' : 'idle', dance: ch.actions.dance ? 'dance' : ch.actions.cheer ? 'cheer' : 'idle', throw: ch.actions.throw ? 'throw' : 'idle', angry: ch.actions.angry ? 'angry' : 'idle', run: ch.actions.run ? 'run' : 'walk' };
      const key = ch.actions[state] ? state : alias[state] && ch.actions[alias[state]] ? alias[state] : 'idle';
      const a = ch.actions[key];
      if (a && a !== ch.cur) { const off = (ch.spec && ch.spec.clipFrom && ch.spec.clipFrom[state]) || 0; fadeTo(ch, a, ch.once ? 0.12 : 0.18, ONCE.has(state) && !(ch.spec && ch.spec.loop && ch.spec.loop[state]), off); }
      ch.curState = state;
      const sp = ch.spec || {}, cur = ch.cur;
      if (cur) cur.timeScale = state === 'walk' ? U.clamp((st.speed || 0) / (sp.walkSpeed || 2.4), 0.7, 1.8) : state === 'run' ? U.clamp((st.speed || 0) / (sp.runSpeed || 6.5), 0.75, 1.6) : state === 'climb' ? 0.8 : (sp.speed && sp.speed[state]) || 1;
      ch.mixer.update(dt);
      animateStatic(ch, ch.actions[state] || state === 'climb' ? { mode: 'still' } : st, dt);
      if (ch.spec && ch.spec.glow && ch.mats.length) { const want = st.calm ? PF.col('#ff5fa8') : PF.col(ch.spec.glow); for (const m of ch.mats) { m.emissive.lerp(want, 1 - Math.exp(-3 * dt)); m.emissiveIntensity = (ch.spec.glowIntensity || 0.5) * (0.8 + Math.sin(PF.time * 3) * 0.2); } }
    } else if (ch.glb) animateStatic(ch, ch.onceCode && PF.time < ch.onceCode.until ? { mode: ch.onceCode.state === 'hit' ? 'fall' : 'cheer' } : st, dt);
    else animate(ch.model, st, dt);
  }
  // escenario del nivel inicial: si hay GLB, se ajusta a la caja que ocupa la pieza procedural
  function sceneryGLB(id, target, fit) {
    const spec = manifest.assets && manifest.assets[id]; if (!spec || !spec.file || !target) return;
    loadGLB(spec.file).then((g) => {
      const sc = g.scene.clone(true), box = new T.Box3().setFromObject(sc), size = box.getSize(new T.Vector3());
      if (fit && fit.size) { sc.scale.set(fit.size[0] / size.x, fit.size[1] / size.y, fit.size[2] / size.z); }
      else { const k = (spec.height || (fit && fit.height) || size.y) / size.y; sc.scale.setScalar(k); }
      const b2 = new T.Box3().setFromObject(sc), c = b2.getCenter(new T.Vector3()); sc.position.set(-c.x, -b2.min.y, -c.z);
      sc.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      for (const ch of target.children.slice()) ch.visible = false; target.add(sc);
    }).catch((e) => console.warn('GLB de ' + id + ' no disponible:', e && e.message ? e.message : e));
  }

  PF.models = { BUILD, character, animate, animateCharacter, animateStatic, playOnce, attach, loadManifest, preload, glbState, sceneryGLB, manifest: () => manifest, tutu, ladder, bridge, flowerGeo, tree, gem, heart, spring, crate, rock, lantern, balloon, campfire, fence, platform, wearable, lavaMaps, eye, smile, roundedBox };
})();
