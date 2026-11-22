/* Plataformas 3D · los cinco compañeros (se construyen con código cuando los pides).
   Cada uno tiene una habilidad distinta y Microsoft-Decision-1.1 decide, en una sola llamada para todos, qué hace cada
   uno según lo que tienen delante; la decisión se ve en el panel del router. */
'use strict';
(function () {
  const N = window.PF.NAME;
  const PF = window.PF, T = THREE, U = PF.U;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const ROLES = [
    { id: 'companion-strong', role: 'strong', name: 'Granito', what: 'un gólem de piedra fortísimo', en: 'Granito, a huge, gentle stone golem who is extremely strong', voice: { seed: 'granito-3', gender: 'male', cast: { en: 'en-US-Ethan' } }, hello: PF.L('Granito. Muy fuerte. Amigo de ' + N + '.', 'Granito. Very strong. ' + N + '’s friend.'), side: -2.2, back: -1.6,
      acts: { follow: 'Stay close to ' + N + '; nothing needs doing right now.', attack: 'Walk up to the grumpy guard creature that blocks the path and knock it out of the way.', shield: 'Stand between ' + N + ' and the boss and punch the fireballs away.', smash: 'Smash the stone wall that blocks the way so everyone can walk through.', cheer: 'Celebrate, because the way ahead is clear or the level is won.' } },
    { id: 'companion-flyer', role: 'flyer', name: 'Nubi', what: 'una nube con alas que vuela y hace llover', en: 'Nubi, a little flying cloud with wings who can carry ' + N + ' through the air and make it rain', voice: { seed: 'nubi-1', gender: 'female', cast: { en: 'en-US-Harper' } }, hello: PF.L('¡Nubi al rescate! Vuelo y hago llover.', 'Nubi to the rescue! I fly and I make it rain.'), side: 1.4, back: -0.6,
      acts: { follow: 'Float next to ' + N + '; nothing needs doing right now.', lift: 'Carry ' + N + ' through the air over the obstacle in front (a wall too high to jump, or water with a shark).', rain: 'Fly over the fires and rain on them to put them out.', cheer: 'Celebrate, because the way ahead is clear or the level is won.' } },
    { id: 'companion-mount', role: 'mount', name: 'Capi', what: 'una capibara tranquila que te lleva y nada', en: 'Capi, a calm capybara that ' + N + ' can ride; it swims, and sharks never bite capybaras', voice: { seed: 'capi-2', gender: 'male', cast: { en: 'en-US-Grant' } }, hello: PF.L('Capi, para servirte. Súbete, que yo nado.', 'Capi, at your service. Hop on, I can swim.'), side: -1.3, back: -2.6,
      acts: { follow: 'Walk behind ' + N + '; nothing needs doing right now.', carry: 'Let ' + N + ' ride on its back to cross water with a shark safely, or to go faster.', cheer: 'Celebrate, because the way ahead is clear or the level is won.' } },
    { id: 'companion-jumper', role: 'jumper', name: 'Brinca', what: 'una canguro que salta altísimo', en: 'Brinca, a sporty kangaroo who jumps extremely high and can launch ' + N + ' into the air', voice: { seed: 'brinca-1', gender: 'female', cast: { en: 'en-AU-Isla' } }, hello: PF.L('¡Soy Brinca! Salta sobre mí y llegarás a las nubes.', 'I’m Brinca! Jump on me and you’ll reach the clouds.'), side: 2.4, back: -2.2,
      acts: { follow: 'Hop along behind ' + N + '; nothing needs doing right now.', boost: 'Stand by the high wall so ' + N + ' can jump off her and fly over it.', kick: 'Leap at the grumpy guard creature that blocks the path and kick it out of the way.', cheer: 'Celebrate, because the way ahead is clear or the level is won.' } },
    { id: 'companion-tiny', role: 'tiny', name: 'Pipo', what: 'un ratón pequeñito y rapidísimo', en: 'Pipo, a tiny and super fast mouse who can sneak past enemies', voice: { seed: 'pipo-4', gender: 'male', cast: { en: 'en-US-Jasper' } }, hello: PF.L('¡Pipo, el más rápido del reino!', 'Pipo, the fastest in the kingdom!'), side: 0.9, back: 1.6,
      acts: { follow: 'Scamper next to ' + N + '; nothing needs doing right now.', distract: 'Tease the grumpy guard creature that blocks the path so it chases him away from its post.', scout: 'Run ahead to look for gems for ' + N + '.', cheer: 'Celebrate, because the way ahead is clear or the level is won.' } },
  ];
  const ES = PF.L({ follow: 'te acompaña', attack: 'aparta al enemigo', shield: 'te cubre del fuego', smash: 'rompe el muro', cheer: 'lo celebra', lift: 'te lleva volando', rain: 'hace llover sobre el fuego', carry: 'te lleva a lomos', boost: 'te impulsa sobre el muro', kick: 'da una patada voladora al enemigo', distract: 'distrae al enemigo', scout: 'busca gemas' },
    { follow: 'stays with you', attack: 'pushes the enemy away', shield: 'shields you from the fire', smash: 'smashes the wall', cheer: 'celebrates', lift: 'flies you over', rain: 'rains on the fire', carry: 'gives you a ride', boost: 'boosts you over the wall', kick: 'flying-kicks the enemy', distract: 'distracts the enemy', scout: 'looks for gems' });
  const LINES = PF.L({ attack: '¡Fuera de aquí!', shield: '¡Yo te cubro!', smash: '¡Abro camino!', lift: '¡Agárrate, que volamos!', rain: '¡A apagar fuegos!', carry: '¡Arriba, ' + N + '!', boost: '¡Salta sobre mí!', kick: '¡Patada voladora!', distract: '¡Eh, gruñón! ¡Atrápame!', scout: '¡Voy a echar un vistazo!', cheer: '¡Bieeen!', open: '¡Camino abierto!', giddy: '¡Arre, Capi!', found: '¡Mirad lo que he encontrado!', up: '¡Arriba!' },
    { attack: 'Out of the way!', shield: 'I’ve got you covered!', smash: 'Clearing the way!', lift: 'Hold on, we’re flying!', rain: 'Let’s put out those fires!', carry: 'Up you go, ' + N + '!', boost: 'Jump on me!', kick: 'Flying kick!', distract: 'Hey, grumpy! Catch me!', scout: 'I’ll take a look!', cheer: 'Yaaay!', open: 'The way is clear!', giddy: 'Giddy up, Capi!', found: 'Look what I found!', up: 'Up you go!' });

  PF.KINDS.companion = {
    make(e, o) {
      const R = o.spec; e.data.spec = R; e.data.role = R.role; e.name = R.name; e.label = R.name; e.voice = Object.assign({ name: R.name, role: R.en }, R.voice);
      e.ch = PF.models.character(R.id); e.root.add(e.ch.root); e.r = e.ch.radius; e.h = e.ch.height; e.act = 'follow'; e.task = null;
      e.root.scale.setScalar(0.01); PF.tween(0.5, (k) => e.root.scale.setScalar(Math.max(0.01, U.outBack(k))));
      PF.fx.poof(e.pos.x, e.pos.y + 0.6, e.pos.z, '#ffffff', 24); PF.fx.magic(e.pos.x, e.pos.y, e.pos.z, 24);
    },
    update(e, dt) { tickCompanion(e, dt); },
  };

  /* ---------- lo que hay delante de el protagonista ---------- */
  function situation() {
    const P = PF.player, ahead = (o, max) => o.pos.z > P.pos.z - 2 && o.pos.z - P.pos.z < max && Math.abs(o.pos.x - P.pos.x) < 14;
    const enemy = PF.all('enemy').filter((e) => e.state !== 'doomed' && ahead(e, 34)).sort((a, b) => a.pos.z - b.pos.z)[0] || null;
    const wall = PF.all('wall').filter((w) => ahead(w, 28) && P.pos.y < w.h - 0.5)[0] || null;
    const sharkPuddle = PF.all('puddle').filter((p) => p.shark && p.shark.alive && ahead(p, 26) && !PF.all('bridge').some((b) => Math.abs(b.pos.z - p.pos.z) < 3))[0] || null;
    const fires = PF.fire ? Array.from(PF.fire.burning).filter((c) => Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 30) : [];
    const boss = PF.get('boss'); const bossHostile = !!(boss && boss.projectile === 'fireballs' && boss.mood !== 'happy' && P.pos.z > 150 && P.pos.z < 206);
    return { enemy, wall, sharkPuddle, fires, boss, bossHostile, won: !!PF.state.won };
  }
  function feasible(spec, S, e) {
    const a = ['follow'];
    if (spec.role === 'strong') { if (S.enemy) a.push('attack'); if (S.bossHostile) a.push('shield'); if (S.wall) a.push('smash'); }
    if (spec.role === 'flyer') { if (S.wall || S.sharkPuddle) a.push('lift'); if (S.fires.length) a.push('rain'); }
    if (spec.role === 'mount') { if (S.sharkPuddle || S.fires.length) a.push('carry'); }
    if (spec.role === 'jumper') { if (S.wall) a.push('boost'); if (S.enemy) a.push('kick'); }
    if (spec.role === 'tiny') { if (S.enemy) a.push('distract'); a.push('scout'); }
    a.push('cheer');
    return a;
  }
  function describe(S) {
    const P = PF.player, list = [];
    if (S.enemy) list.push('a grumpy guard creature blocks the narrow path ' + Math.round(S.enemy.pos.z - P.pos.z) + ' m ahead (it hurts ' + N + ' if he touches it)');
    if (S.wall) list.push('a stone wall ' + S.wall.h + ' m high blocks the way ' + Math.max(0, Math.round(S.wall.pos.z - P.pos.z)) + ' m ahead (far too high to jump)');
    if (S.sharkPuddle) list.push('a puddle with a hungry shark cuts the path ' + Math.round(S.sharkPuddle.pos.z - P.pos.z) + ' m ahead');
    if (S.fires.length) list.push(S.fires.length + ' patches of grass are on fire near ' + N + '');
    if (S.bossHostile) list.push('the volcano golem king is throwing fireballs at ' + N + '');
    if (S.won) list.push('the level is won');
    if (!list.length) list.push('nothing blocks the way right now');
    return list;
  }

  /* ---------- decisiones: una llamada a Decision-1.1 para todos ---------- */
  let busy = false, nextT = 0, lastLi = null;
  async function decideAll(force) {
    const team = PF.all('companion'); if (!team.length || busy) return;
    if (!force && PF.time < nextT) return;
    nextT = PF.time + 7;
    const S = situation(), P = PF.player;
    const avail = new Map(team.map((e) => [e.id, feasible(e.data.spec, S, e)]));
    const state = { game: 'A cheerful 3D platform game. The hero ' + N + ' must reach the goal at the end of the level; his companions help him.', hero: { name: N, hearts: P.hearts, section: PF.world.sectionAt(P.pos.z).name }, ahead: describe(S), companions_busy: team.filter((e) => e.task).map((e) => e.name + ' (' + (e.task && e.task.kind) + ')') };
    const questions = {};
    for (const e of team) { if (e.task) continue; const acts = avail.get(e.id), crit = {}; for (const a of acts) crit[a] = e.data.spec.acts[a]; questions[e.data.role] = { type: 'choice', instructions: 'What should ' + e.data.spec.en + ' do now to help ' + N + '? Pick the most useful action given what is ahead.', criteria: crit }; }
    if (!Object.keys(questions).length) return;
    busy = true; const t0 = performance.now(); let j = null, err = null;
    try {
      const r = await fetch('/api/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, questions }) });
      if (!r.ok) throw new Error('HTTP ' + r.status); j = await r.json();
    } catch (x) { err = x; }
    busy = false;
    const rows = []; let n = 0;
    for (const e of PF.all('companion')) {
      const q = questions[e.data.role]; if (!q) continue;
      let choice = j && j.answers && j.answers[e.data.role] ? j.answers[e.data.role].choice : null, p = choice && j.answers[e.data.role].probabilities ? j.answers[e.data.role].probabilities[choice] : null;
      if (!choice || !q.criteria[choice]) { choice = heuristic(e, avail.get(e.id), situation()); p = null; }
      n++; start(e, choice);
      rows.push('<div class="row"><span>' + esc(e.name) + ' → ' + esc(ES[choice] || choice) + (p != null ? ' · ' + Math.round(p * 100) + ' %' : '') + '</span></div>');
    }
    PF.state.allyDecisions = (PF.state.allyDecisions || 0) + 1;
    const HUD = window.PLATO && window.PLATO.HUD; if (!HUD || !rows.length) return;
    const head = err ? '<div class="row" style="margin-bottom:4px"><span class="chip decision">Decision-1.1</span><span>' + PF.L('sin respuesta · decisión local', 'no answer · local decision') + '</span></div>' : '<div class="row" style="margin-bottom:4px"><span class="chip decision">Decision-1.1</span><span>' + n + PF.L(' decisiones en 1 llamada · ', (n === 1 ? ' decision' : ' decisions') + ' in 1 call · ') + (j && j.ms != null ? j.ms : Math.round(performance.now() - t0)) + ' ms</span></div>';
    const list = document.querySelector('#platoHud ol'), title = PF.L('Compañeros', 'Companions');
    if (lastLi && list && list.firstElementChild === lastLi) lastLi.innerHTML = '<div class="t"><span>' + title + '</span><span class="tm"></span></div>' + head + rows.join('');
    else lastLi = HUD.note(title, '', head + rows.join(''));
    PF.emit('allies', { n, ms: j && j.ms, err: err && err.message });
  }
  function heuristic(e, acts, S) {
    const pref = { strong: ['shield', 'attack', 'smash'], flyer: ['rain', 'lift'], mount: ['carry'], jumper: ['boost', 'kick'], tiny: ['distract', 'scout'] }[e.data.role] || [];
    return pref.find((a) => acts.includes(a)) || (S.won ? 'cheer' : 'follow');
  }

  /* ---------- acciones ---------- */
  function start(e, act) {
    if (e.task && e.task.kind === act) return;
    const S = situation();
    e.act = act; e.task = null;
    const say = (t) => PF.say(e, t, { voice: false });
    if ((act === 'lift' || act === 'carry') && (PF.player.carried || PF.player.ride)) act = 'follow';
    if (act === 'follow') { e.act = 'follow'; return; }
    if (act === 'cheer') { e.task = { kind: 'cheer', t: 0, dur: 3 }; say(LINES.cheer); return; }
    if ((act === 'attack' || act === 'kick' || act === 'distract') && S.enemy) { e.task = { kind: act, target: S.enemy, t: 0, phase: 'go' }; say(LINES[act]); return; }
    if (act === 'shield' && S.bossHostile) { e.task = { kind: 'shield', t: 0, dur: 14 }; say(LINES.shield); return; }
    if (act === 'smash' && S.wall) { e.task = { kind: 'smash', target: S.wall, t: 0, phase: 'go' }; say(LINES.smash); return; }
    if (act === 'lift' && (S.wall || S.sharkPuddle)) { e.task = { kind: 'lift', t: 0, phase: 'go', obstacle: S.wall || S.sharkPuddle }; say(LINES.lift); return; }
    if (act === 'rain' && S.fires.length) { e.task = { kind: 'rain', t: 0, phase: 'go', fires: S.fires }; say(LINES.rain); return; }
    if (act === 'carry') { e.task = { kind: 'carry', t: 0, phase: 'go', dur: 30 }; say(LINES.carry); return; }
    if (act === 'boost' && S.wall) { e.task = { kind: 'boost', target: S.wall, t: 0, phase: 'go', dur: 20 }; say(LINES.boost); return; }
    if (act === 'scout') { e.task = { kind: 'scout', t: 0, phase: 'go' }; say(LINES.scout); return; }
    e.act = 'follow';
  }
  function walkTo(e, x, z, sp, dt) {
    const dx = x - e.pos.x, dz = z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const s = Math.min(sp * dt, d); e.pos.x += (dx / d) * s; e.pos.z += (dz / d) * s; e.root.rotation.y = U.dampAngle(e.root.rotation.y, Math.atan2(dx, dz), 10, dt);
    const g = PF.groundAt(e.pos.x, e.pos.z, e.pos.y + 0.7); if (g > -50) e.pos.y = U.damp(e.pos.y, g, 16, dt);
    return false;
  }
  function hopTo(e, b, dur, hgt) { e.data.leap = { a: e.pos.clone(), b: b.clone(), t: 0, dur: dur || 0.7, hgt: hgt || 2 }; PF.sfx.play('boing'); }
  function knockOut(enemy, from) {
    if (!enemy || !enemy.alive || enemy.state === 'doomed') return; enemy.state = 'doomed'; for (const c of enemy.cols) PF.dropCollider(c); enemy.cols = []; PF.models.playOnce(enemy.ch, 'hit', 1.5);
    PF.state.allyHelps = (PF.state.allyHelps || 0) + 1;
    PF.sfx.play('punch'); PF.shake(0.45); PF.fx.sparks(enemy.pos.x, enemy.pos.y + 1.5, enemy.pos.z, 24);
    const a = enemy.pos.clone(), side = enemy.pos.x - from.pos.x >= 0 ? 1 : -1, b = V(a.x + side * 12, a.y + 9, a.z + 7);
    PF.tween(1.1, (k) => { enemy.pos.lerpVectors(a, b, k); enemy.pos.y = a.y + Math.sin(k * Math.PI * 0.9) * 9; enemy.root.rotation.z = k * 9 * side; }, () => { PF.fx.magic(enemy.pos.x, enemy.pos.y, enemy.pos.z, 30, '#fff3a8'); PF.kill(enemy, 'silent'); });
    PF.emit('knockout', { enemy, by: from });
  }
  PF.allies = {
    deflect(p) {
      for (const e of PF.all('companion')) {
        if (e.data.role !== 'strong' || !e.task || e.task.kind !== 'shield') continue;
        if (p.pos.distanceTo(V(e.pos.x, e.pos.y + 1.6, e.pos.z)) < 2.6) { PF.scene.remove(p.mesh); PF.fx.sparks(p.pos.x, p.pos.y, p.pos.z, 30); PF.sfx.play('punch'); e.data.punch = 0.35; PF.state.deflected = (PF.state.deflected || 0) + 1; return true; }
      }
      return false;
    },
  };
  function tickCompanion(e, dt) {
    const P = PF.player, t = e.task; let mode = 'idle', speed = 0;
    if (e.data.leap) { const r = PF.follow(e, P, 0, 0, dt, 0); mode = r.mode; speed = r.speed; }
    else if (!t) { const r = PF.follow(e, P, e.data.spec.side, e.data.spec.back, dt, e.data.role === 'tiny' ? 8 : 6); mode = r.mode; speed = r.speed; }
    else {
      t.t += dt;
      if (t.kind === 'cheer') { const r = PF.follow(e, P, e.data.spec.side, e.data.spec.back, dt, e.data.role === 'tiny' ? 8 : 6); mode = r.mode === 'idle' ? 'cheer' : r.mode; speed = r.speed; if (t.t > t.dur) e.task = null; }
      else if (t.kind === 'attack' || t.kind === 'kick') {
        const en = t.target; if (!en || !en.alive || en.state === 'doomed') { e.task = null; }
        else if (t.phase === 'go') { const zf = en.pos.z - (en.r + 1.2) * Math.sign(en.pos.z - P.pos.z || 1); if (t.kind === 'kick') { hopTo(e, V(en.pos.x, en.pos.y, zf), 0.8, 3); t.phase = 'air'; } else if (walkTo(e, en.pos.x, zf, 7, dt)) t.phase = 'hit'; mode = 'run'; speed = 7; if (t.t > 8) { e.pos.set(en.pos.x, en.pos.y, zf); t.phase = 'hit'; } }
        else if (t.phase === 'air') { if (!e.data.leap) t.phase = 'hit'; mode = 'jump'; }
        else if (t.phase === 'hit') { e.root.rotation.y = Math.atan2(en.pos.x - e.pos.x, en.pos.z - e.pos.z); e.data.punch = 0.4; knockOut(en, e); t.phase = 'done'; t.t2 = t.t; }
        else if (t.t - t.t2 > 1.2) e.task = null;
      } else if (t.kind === 'distract') {
        const en = t.target; if (!en || !en.alive || en.state === 'doomed') { e.task = null; }
        else if (t.phase === 'go') { if (walkTo(e, en.pos.x + 0.9, en.pos.z - (en.r + 0.8), 9, dt)) { t.phase = 'tease'; t.t2 = t.t; } mode = 'run'; speed = 9; }
        else if (t.phase === 'tease') { mode = 'dance'; if (t.t - t.t2 > 1.0) { t.phase = 'run'; en.state = 'chase'; en.data.lure = e; for (const c of en.cols) c.r = 0.9; hopTo(e, V(en.pos.x, en.pos.y, en.pos.z + en.r + 2), 0.5, 2.6); } }
        else if (t.phase === 'run') { if (!e.data.leap) { walkTo(e, e.pos.x + 0, e.pos.z + 30, 7.5, dt); mode = 'run'; speed = 7.5; } if ((t.t - t.t2 > 4 && !narrow(en.pos.z)) || t.t - t.t2 > 16) { en.state = 'guard'; en.home = en.pos.clone(); en.data.lure = null; for (const c of en.cols) c.r = en.r; e.task = null; hopTo(e, V(P.pos.x + 1, P.pos.y, P.pos.z - 1), 1.0, 4); } }
      } else if (t.kind === 'shield') {
        const b = PF.get('boss'); if (!b || b.mood === 'happy' || t.t > t.dur) { e.task = null; }
        else { const dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1; walkTo(e, P.pos.x + (dx / d) * 2.4, P.pos.z + (dz / d) * 2.4, 8, dt); e.root.rotation.y = Math.atan2(dx, dz); mode = e.data.punch > 0 ? 'throw' : 'idle'; }
      } else if (t.kind === 'smash') {
        const w = t.target; if (!w || !w.alive) { e.task = null; }
        else if (t.phase === 'go') { if (walkTo(e, U.clamp(P.pos.x, w.x0 + 1, w.x1 - 1), w.z0 - 1.2, 6, dt)) { t.phase = 'hit'; t.t2 = t.t; } mode = 'run'; speed = 6; if (t.t > 12) { e.pos.set(U.clamp(P.pos.x, w.x0 + 1, w.x1 - 1), 0, w.z0 - 1.2); t.phase = 'hit'; t.t2 = t.t; } }
        else if (t.phase === 'hit') { mode = 'throw'; e.data.punch = 0.4; e.root.rotation.y = 0; const k = t.t - t.t2; if (k > 0.4 && !t.h1) { t.h1 = 1; PF.sfx.play('punch'); PF.shake(0.5); PF.fx.dust(e.pos.x, 1.5, w.z0, 20); } if (k > 1.1 && !t.h2) { t.h2 = 1; PF.sfx.play('rumble'); PF.fx.smoke(e.pos.x, 2, w.z0 + 1, 30, '#bdb5d2'); PF.kill(w, 'crumble'); PF.say(e, LINES.open, { voice: false }); } if (k > 2) e.task = null; }
      } else if (t.kind === 'lift') {
        const o = t.obstacle;
        if (t.phase === 'go') { e.data.fly = true; const tx = P.pos.x, tz = P.pos.z, ty = P.pos.y + P.h + 0.6; e.pos.x = U.damp(e.pos.x, tx, 4, dt); e.pos.z = U.damp(e.pos.z, tz, 4, dt); e.pos.y = U.damp(e.pos.y, ty, 4, dt); if (e.pos.distanceTo(V(tx, ty, tz)) < 0.6 || t.t > 3) { if (P.ride) { const rd = P.ride; P.ride = null; if (rd.data) rd.data.rider = null; if (rd.task) rd.task = null; } t.phase = 'carry'; t.a = P.pos.clone(); t.b = liftTarget(o); t.t2 = t.t; P.carried = e; P.climb = null; PF.sfx.play('whoosh'); } mode = 'idle'; }
        else if (t.phase === 'carry') { const k = Math.min(1, (t.t - t.t2) / 2.2); P.pos.lerpVectors(t.a, t.b, U.smooth(k)); P.pos.y += Math.sin(k * Math.PI) * 6; P.vel.set(0, 0, 0); P.mode = 'fall'; e.pos.set(P.pos.x, P.pos.y + P.h + 0.5, P.pos.z); if (k >= 1) { P.carried = null; P.onGround = true; P.vel.set(0, 0, 0); PF.fx.dust(P.pos.x, P.pos.y, P.pos.z, 10); e.task = null; e.data.fly = false; PF.emit('lifted', { by: e }); } }
      } else if (t.kind === 'rain') {
        const live = t.fires.filter((c) => c.s === 1);
        const c0 = live[0] || null; if (!c0 || t.t > 8) { e.task = null; e.data.fly = false; }
        else { e.data.fly = true; e.pos.x = U.damp(e.pos.x, c0.x, 3, dt); e.pos.z = U.damp(e.pos.z, c0.z, 3, dt); e.pos.y = U.damp(e.pos.y, 4.2, 3, dt);
          PF.fx.emit(6, () => ({ at: [e.pos.x + U.rand(-0.7, 0.7), e.pos.y + 0.2, e.pos.z + U.rand(-0.4, 0.4)], v: [0, -9, 0], c: '#9fdcff', life: 0.45, s0: 0.12, s1: 0.08, a: 0.9 }));
          if (Math.hypot(e.pos.x - c0.x, e.pos.z - c0.z) < 1.5) { for (const c of live) if (Math.hypot(c.x - e.pos.x, c.z - e.pos.z) < 5.5) { PF.fire.extinguishCell(c); PF.state.rained = (PF.state.rained || 0) + 1; } } }
      } else if (t.kind === 'carry') {
        if (t.phase === 'go') { if (walkTo(e, P.pos.x, P.pos.z - 0.2, 8, dt)) { t.phase = 'ride'; P.ride = e; e.data.rider = P; e.data.body = { pos: e.pos, vel: V(), r: 0.6, h: 1.2, onGround: true, coyote: 0, self: e }; PF.say(P, LINES.giddy, { voice: false }); } mode = 'run'; speed = 8; if (t.t > 6) { e.pos.set(P.pos.x, P.pos.y, P.pos.z); } }
        else if (t.phase === 'ride') { if (P.ride !== e || t.t > t.dur + 30) { P.ride = P.ride === e ? null : P.ride; e.data.rider = null; e.task = null; } else { const r = ride(e, dt); mode = r.mode; speed = r.speed; } }
      } else if (t.kind === 'boost') {
        const w = t.target; if (!w || !w.alive || P.pos.y > w.h - 0.3 || t.t > t.dur) { e.task = null; }
        else { const ok = walkTo(e, U.clamp(P.pos.x + 1.4, w.x0 + 1, w.x1 - 1), w.z0 - 1.6, 8, dt); mode = ok ? 'cheer' : 'run'; speed = ok ? 0 : 8; t.ready = ok; }
      } else if (t.kind === 'scout') {
        if (t.phase === 'go') { if (walkTo(e, P.pos.x + 0.5, P.pos.z + 16, 11, dt) || t.t > 3) { t.phase = 'find'; for (let i = 0; i < 3; i++) { const z = e.pos.z - 3 - i * 3, gy = PF.groundAt(e.pos.x, z, e.pos.y + 1); if (gy > -5) PF.spawn('gem', { at: V(e.pos.x + U.rand(-1, 1), gy, z) }); } PF.say(e, LINES.found, { voice: false }); } mode = 'run'; speed = 11; }
        else if (t.phase === 'find') { e.task = null; }
      }
    }
    if (e.data.punch > 0) { e.data.punch -= dt; mode = 'throw'; }
    if (e.data.fly || e.data.role === 'flyer') { if (!e.task || !e.data.fly) { const hover = PF.player.pos.y + (e.ch.rig && e.ch.rig.hover || 2.2); e.pos.y = U.damp(e.pos.y, hover, 3, dt); } }
    PF.models.animateCharacter(e.ch, { mode, speed, k: e.data.punch > 0 ? 1 - e.data.punch / 0.4 : 0 }, dt);
  }
  const narrow = (z) => (z > 37 && z < 65) || (z > 103 && z < 151);
  function liftTarget(o) {
    const P = PF.player;
    if (o && o.type === 'wall') return V(U.clamp(P.pos.x, o.x0 + 1, o.x1 - 1), 0, o.z1 + 2.5);
    if (o && o.type === 'puddle') { const z = o.pos.z + o.rz + 1.6; return V(0, Math.max(0, PF.groundAt(0, z, 3)), z); }
    return V(P.pos.x, P.pos.y, P.pos.z + 8);
  }
  // Capi con el protagonista a lomos: le lleva la entrada del jugador y nada sin miedo al tiburón
  function ride(e, dt) {
    const P = PF.player, b = e.data.body, inp = PF.inputState || { f: 0, s: 0 };
    const cy = PF.cam.yaw, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    let mx = inp.wx != null ? inp.wx : fx * inp.f + rx * inp.s, mz = inp.wx != null ? inp.wz : fz * inp.f + rz * inp.s; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    const sp = 7.5; b.vel.x = U.damp(b.vel.x, mx * sp, 8, dt); b.vel.z = U.damp(b.vel.z, mz * sp, 8, dt); b.vel.y = Math.max(-30, b.vel.y - 30 * dt);
    const saved = PF.cyls.filter((c) => c.ent === e); saved.forEach((c) => (c.on = false));
    PF.moveBody(b, dt); saved.forEach((c) => (c.on = true));
    if (b.pos.y < -16) { b.pos.copy(P.lastSafe); b.vel.set(0, 0, 0); }
    const hs = Math.hypot(b.vel.x, b.vel.z); if (hs > 0.3) e.root.rotation.y = U.dampAngle(e.root.rotation.y, Math.atan2(b.vel.x, b.vel.z), 10, dt);
    const seat = (e.ch.rig && e.ch.rig.seatY) || 1.2; P.pos.set(e.pos.x, e.pos.y + seat - 0.35, e.pos.z); P.yaw = e.root.rotation.y; P.vel.set(0, 0, 0); P.mode = 'sit'; P.speed = 0;
    if (PF.all('puddle').some((p) => p.contains(e.pos.x, e.pos.z)) && Math.random() < dt * 10) PF.fx.splash(e.pos.x, 0.1, e.pos.z, 4);
    return { mode: hs > 0.4 ? 'walk' : 'idle', speed: hs };
  }
  PF.on('jump', () => {
    for (const e of PF.all('companion')) if (e.task && e.task.kind === 'boost' && e.task.ready && Math.hypot(PF.player.pos.x - e.pos.x, PF.player.pos.z - e.pos.z) < 1.8) { PF.player.vel.y = 21; PF.player.vel.z = 3.2; PF.sfx.play('boing'); PF.say(e, LINES.up, { voice: false }); e.task.t = e.task.dur - 1; }
  });

  /* ---------- llegar ---------- */
  function add(n) {
    n = U.clamp(Math.round(n || 5), 1, 5);
    const have = new Set(PF.all('companion').map((e) => e.data.spec.id)), P = PF.player, out = [];
    let k = 0;
    for (const R of ROLES) {
      if (out.length >= n) break; if (have.has(R.id)) continue;
      // un sitio con suelo a la altura del protagonista: en abanico detrás de él o, en un paso estrecho, en fila india
      const a = P.yaw + Math.PI + (k - 2) * 0.55, d = 2.6 + (k % 2) * 0.8; let x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
      const okAt = (xx, zz) => { const g = PF.groundAt(xx, zz, P.pos.y + 1.2); return g > -50 && Math.abs(g - P.pos.y) < 1.2 && !PF.solids.some((c) => c.on && c.tag !== 'ground' && xx > c.min[0] - 0.3 && xx < c.max[0] + 0.3 && zz > c.min[2] - 0.3 && zz < c.max[2] + 0.3 && c.max[1] > P.pos.y + 0.5 && c.min[1] < P.pos.y + 1.5); };
      if (!okAt(x, z)) { x = P.pos.x + ((k % 2) - 0.5) * 0.9; z = P.pos.z - Math.sin(P.yaw + Math.PI / 2) * 0 - Math.cos(P.yaw) * (1.8 + k * 1.1); if (!okAt(x, z)) { x = P.pos.x; z = P.pos.z - Math.cos(P.yaw) * 1.5; } }
      k++;
      const gy = PF.groundAt(x, z, P.pos.y + 1.2);
      const e = PF.spawn('companion', { id: R.id, spec: R, at: V(x, gy > -50 ? gy : P.pos.y, z) }); out.push(e);
      PF.after(0.25 + out.length * 0.9, () => PF.say(e, R.hello, { voice: out.indexOf(e) < 2 }));
    }
    if (out.length) { PF.sfx.play('fanfare'); nextT = PF.time + 2.5 + out.length * 0.6; }
    return out;
  }
  PF.allies.add = add; PF.allies.ROLES = ROLES; PF.allies.decideAll = decideAll; PF.allies.situation = situation;
  PF.updateAllies = () => { if (PF.all('companion').length && !PF.state.cine && document.visibilityState !== 'hidden') decideAll(false); };
})();
