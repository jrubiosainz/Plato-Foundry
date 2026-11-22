/* Plataformas 3D · órdenes.
   Voz (MAI-Transcribe-2-Streaming) o texto → /api/ai con la tarea «plat»: Microsoft-Decision-1.1 enruta (se ve en el
   panel) → GPT-6 Luna (o GPT-6.2 Astra) devuelve operaciones JSON sobre las entidades del juego, con un estado compacto
   (id, tipo y posición relativa a el protagonista; «este» = lo más cercano delante). El juego valida y ejecuta cada operación.
   Red de seguridad: una gramática local y determinista en español reconoce las órdenes de la demo y, si el modelo falla o
   se queda corto, completa lo que falte (y lo dice en el panel). Lo que no está en el catálogo lo escribe MAI-Code-2-Flash
   en directo («plat-invent»), se ejecuta en un Worker sin red y Decision-1.1 comprueba con una captura que se parece. */
'use strict';
(function () {
  const N = window.PF.NAME;
  const PF = window.PF, T = THREE, U = PF.U;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const norm = U.norm;
  const HUD = () => (window.PLATO && window.PLATO.HUD) || null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (ms) => (ms == null ? '' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');

  /* ================= cliente del router (/api/ai, SSE) ================= */
  async function* sse(res) {
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); let event = 'message'; const data = []; for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); } if (data.length) yield { event, data: data.join('\n') }; } }
  }
  const TASK_ES = PF.L({ plat: 'Orden de juego', 'plat-invent': 'Inventar pieza', 'invent-fix': 'Arreglar código' }, { plat: 'Game order', 'plat-invent': 'Invent a piece', 'invent-fix': 'Fix code' });
  const CODE = new Set(['plat-invent', 'invent-fix']);
  async function ask(task, input, said, opt) {
    opt = opt || {};
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), opt.timeout || 15000);
    let rec = null, shown = null, panel = null, text = '', done = null;
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ input, tier: 'quick', task, said }) });
      if (!res.ok) throw { code: res.status === 403 ? 'not_granted' : 'model_error', message: 'HTTP ' + res.status };
      for await (const ev of sse(res)) {
        let d; try { d = JSON.parse(ev.data); } catch (e) { continue; }
        if (ev.event === 'route') { rec = d; shown = Object.assign({}, d, { task: TASK_ES[d.task] || d.task }); const H = HUD(); if (H) H.route(shown); if (CODE.has(task) && window.PLATO && window.PLATO.Code) panel = window.PLATO.Code.open(Object.assign({}, d, { task: task === 'invent-fix' ? 'invent-fix' : 'invent' })); if (opt.onRoute) opt.onRoute(d); }
        else if (ev.event === 'delta') { text += d.d; if (panel) panel.feed(text); if (opt.onText) opt.onText(text); }
        else if (ev.event === 'done') done = d;
        else if (ev.event === 'error') throw { code: d.code || 'model_error', message: d.message };
      }
      if (!done) throw { code: 'model_error', message: PF.L('La respuesta se cortó', 'The answer was cut off') };
      const H = HUD(); if (H && shown) H.done(shown, done); if (panel) panel.done(done);
      return { text: done.text, route: rec, done };
    } catch (e) {
      const err = ctl.signal.aborted ? { code: 'timeout', message: PF.L('tiempo agotado', 'timed out') } : e && e.code ? e : { code: 'model_error', message: String((e && e.message) || e) };
      if (panel) panel.fail(err); const H = HUD(); if (H && shown) H.fail(shown, err);
      err.route = rec; throw err;
    } finally { clearTimeout(to); }
  }

  /* ================= estado compacto para el modelo ================= */
  const MEANING = new Set(['enemy', 'wall', 'ladder', 'puddle', 'shark', 'bridge', 'boss', 'princess', 'companion', 'spring', 'platform', 'crate', 'invented', 'rock', 'tree', 'balloon', 'campfire', 'lantern', 'heart', 'fence', 'hay']);
  function rel(e, P, cy) {
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz), fx = Math.sin(cy), fz = Math.cos(cy);
    const f = dx * fx + dz * fz, r = -(dx * -Math.cos(cy) + dz * Math.sin(cy)), ang = Math.atan2(-r, f) * 180 / Math.PI;
    const a = Math.abs(ang), side = ang < 0 ? 'right' : 'left';
    const dir = a < 25 ? 'ahead' : a < 65 ? 'ahead-' + side : a < 115 ? 'to the ' + side : a < 155 ? 'behind-' + side : 'behind';
    const up = e.pos.y - P.pos.y > 3 ? ', ' + Math.round(e.pos.y - P.pos.y) + ' m up' : '';
    return { d, f, ang, txt: (d < 1.5 ? 'right here' : Math.round(d) + ' m ' + dir) + up };
  }
  function thisOf(P, cy) {
    let best = null, bs = 1e9;
    for (const e of PF.all()) {
      if (!MEANING.has(e.type) || e.state === 'doomed' || (e.tags && e.tags.has('arena') && e.type !== 'boss')) continue;
      const r = rel(e, P, cy); if (r.d > 45 || Math.abs(r.ang) > 70) continue;
      const pri = e.type === 'enemy' ? 0 : e.type === 'boss' ? 4 : e.type === 'shark' ? 2 : e.type === 'puddle' ? 3 : e.type === 'wall' ? 5 : e.type === 'princess' ? 8 : 6;
      const sc = r.d + Math.abs(r.ang) * 0.12 + pri * 2.5; if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  function note(e) {
    if (e.type === 'enemy') return (e.inWater ? 'standing in a puddle; ' : '') + 'a grumpy guard creature; it blocks the narrow path and hurts on touch';
    if (e.type === 'wall') return e.h + ' m high stone wall across the path; too high to jump';
    if (e.type === 'puddle') return 'water ' + Math.round(e.rx * 2) + 'x' + Math.round(e.rz * 2) + ' m' + (e.shark && e.shark.alive ? ', a shark lives in it (it bites anyone who walks in)' : '');
    if (e.type === 'shark') return 'swimming in ' + (e.puddle ? e.puddle.id : 'nothing');
    if (e.type === 'boss') return 'final boss, a volcano golem king; throws ' + e.projectile + (e.wearing ? '; wearing ' + Object.keys(e.wearing).join(', ') : '') + (e.mood === 'happy' ? '; happy and dancing' : '');
    if (e.type === 'princess') return e.state === 'caged' ? 'locked in a hanging cage by the castle' : 'free, following ' + N + '';
    if (e.type === 'companion') return 'companion who helps ' + N + ' (' + e.data.role + ')';
    if (e.type === 'bridge') return e.label;
    if (e.type === 'ladder') return 'leaning on ' + (e.data.wall ? e.data.wall.id : 'nothing');
    if (e.type === 'invented') return e.label;
    return null;
  }
  PF.describe = () => {
    const P = PF.player, cy = PF.cam.yaw, th = thisOf(P, cy), rows = [];
    for (const e of PF.all()) {
      if (!MEANING.has(e.type) || e.state === 'doomed') continue;
      if (e.tags && e.tags.has('arena') && rel(e, P, cy).d > 25) continue;
      const r = rel(e, P, cy); const o = { id: e.id, type: e.type, where: r.txt }; if (e.name && e.name !== PF.LABEL[e.type]) o.name = e.name; const n = note(e); if (n) o.note = n; o._d = r.d + (r.f < 0 ? 60 : 0); rows.push(o);
    }
    rows.sort((a, b) => a._d - b._d); rows.forEach((o) => delete o._d);
    const E = PF.env, hh = Math.floor(E.target), mm = Math.round((E.target - hh) * 60);
    return { player: { id: 'player', name: '' + N + '', hearts: P.hearts, section: PF.world.sectionAt(P.pos.z).name, riding: P.ride ? P.ride.id : undefined }, this: th ? th.id : null, entities: rows.slice(0, 16), weather: E.weather, time: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') };
  };
  const PROMPT = (state, said) => 'You turn a player\'s spoken order (' + PF.L('usually Spanish', 'in English') + ') into JSON operations for a 3D platform game.\n'
    + 'Reply with ONE JSON object and nothing else: {"ops":[...],"say":"<short cheerful reply in ' + PF.L('Spanish', 'English') + ', max 10 words>"}\n'
    + 'Operations:\n'
    + '{"op":"add","kind":KIND,"rel":REL,"ref":ID,"count":N,"material":"wood|stone"}\n'
    + '{"op":"remove","id":ID}\n'
    + '{"op":"move","id":ID,"rel":REL,"ref":ID}\n'
    + '{"op":"projectile","id":ID,"value":"fireballs|flowers|bubbles|snowballs|confetti|hearts"}\n'
    + '{"op":"interact","actor":ID,"action":"eat|attack","target":ID}\n'
    + '{"op":"wear","id":ID,"item":"tutu|crown|sunglasses|hat|bow|cape|scarf"}\n'
    + '{"op":"companions","count":N}\n'
    + '{"op":"weather","value":"clear|cloudy|rain|snow|fog|storm"}\n'
    + '{"op":"time","value":"dawn|day|dusk|night"}\n'
    + '{"op":"logos","brands":["foundry","microsoft","copilot","github"]}\n'
    + '{"op":"make_real"}  film the scene in front of the player for a few seconds and turn it into real AI video\n'
    + '{"op":"invent","what":"<short english description>","label":"<' + PF.L('spanish', 'short english') + ' name>","rel":REL,"ref":ID}  only for things that are not a KIND; leave out rel and ref unless the order says where (then it appears right in front of the player)\n'
    + 'KIND: ladder, puddle, shark, bridge, spring, platform, crate, gem, heart, tree, flowers, rock, lantern, balloon, campfire, fence, enemy\n'
    + 'REL: under, in, on, beside, in_front, behind, across, against\n'
    + 'Rules: ' + PF.L('"este/ese/esto"', '"this/that/it"') + ' is the entity in "this". A ladder goes "against" the wall that blocks the way. A bridge goes "across" a puddle. Water animals go "in" a puddle. Anyone can wear any item (a tutu on the boss is fine and funny). '
    + 'To get rid of an enemy (' + PF.L('"elimina/quita/borra a este enemigo"', '"remove/delete/get rid of this enemy"') + ') use {"op":"remove","id":ID}; use interact "attack" only when the player asks the companions to attack. '
    + 'To bring someone next to the player use move with rel "beside" and ref "player". ' + PF.L('"Que salga el sol" is weather clear. "Que se haga de noche"/"atardecer"/"amanecer" are time. ', '"Make the sun come out" is weather clear. "Make it night"/"sunset"/"sunrise" are time. ')
    + PF.L('"Lance flores en lugar de bolas de fuego"', '"Throw flowers instead of fireballs"') + ' is projectile flowers. Companions/NPC helpers use the companions op. ' + PF.L('"Hazlo real", "rueda esta escena y hazla real" or "conviértelo en una película"', '"Make it real", "film this scene and make it real" or "turn this into a movie"') + ' is make_real. Use only ids that are in the state. Never remove the player.\n'
    + 'State: ' + JSON.stringify(state) + '\n'
    + 'Order: ' + JSON.stringify(said);
  function parseJSON(text) {
    const s = String(text || '').replace(/```(?:json)?/gi, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { try { return JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); } catch (x) { return null; } }
  }

  /* ================= resolver referencias y colocar cosas ================= */
  const TYPE_WORDS = { enemy: /^(enemy|enemigo|monstruo|bicho|grunon|gruñón|guard|guardia|grumble|grouch|monster|creature|imp)/i, boss: /^(boss|jefe|rey|golem|king|villain|villano|volcano|final boss)/i, princess: /^(princess|princesa|lua|lúa)/i, shark: /^(shark|tiburon|tiburón)/i, puddle: /^(puddle|charco|pond|water|agua)/i, wall: /^(wall|muro|pared|muralla)/i, ladder: /^(ladder|escalera)/i, bridge: /^(bridge|puente)/i };
  function nearestOf(type, from, pred) { let best = null, bd = 1e9; for (const e of PF.all(type)) { if (e.state === 'doomed' || (pred && !pred(e))) continue; const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z) + (e.pos.z < from.z - 3 ? 40 : 0); if (d < bd) { bd = d; best = e; } } return best; }
  function resolve(ref, ctx, want) {
    const P = PF.player; if (ref == null || ref === '') return null;
    if (typeof ref === 'object') ref = ref.id || ref.ref || '';
    const r = String(ref).trim(), n = norm(r);
    if (/^(player|jugador|protagonista|hero|heroe|me|mi|yo|myself)$/.test(n) || n === norm(N) || /personaje del jugador|player character|my character/.test(n)) return P;
    if (/^(this|that|este|esta|ese|esa|esto|eso|it)$/.test(n)) return ctx.thisEnt && ctx.thisEnt.alive ? ctx.thisEnt : null;
    const direct = PF.get(r) || PF.get(n); if (direct) return direct;
    for (const c of PF.all('companion')) if (norm(c.name) === n || c.data.role === n || c.id === n) return c;
    for (const [type, re] of Object.entries(TYPE_WORDS)) if (re.test(n)) { if (ctx.thisEnt && ctx.thisEnt.alive && ctx.thisEnt.type === type) return ctx.thisEnt; return nearestOf(type, P.pos); }
    for (const e of PF.all()) if (e.name && norm(e.name) === n) return e;
    return null;
  }
  const KIND = { ladder: 'ladder', stairs: 'ladder', escalera: 'ladder', puddle: 'puddle', pond: 'puddle', water: 'puddle', charco: 'puddle', shark: 'shark', tiburon: 'shark', bridge: 'bridge', puente: 'bridge', spring: 'spring', trampoline: 'spring', muelle: 'spring', platform: 'platform', plataforma: 'platform', crate: 'crate', box: 'crate', caja: 'crate', gem: 'gem', coin: 'gem', coins: 'gem', diamond: 'gem', gema: 'gem', moneda: 'gem', heart: 'heart', corazon: 'heart', tree: 'tree', arbol: 'tree', flowers: 'flowers', flower: 'flowers', flores: 'flowers', rock: 'rock', stone: 'rock', roca: 'rock', piedra: 'rock', lantern: 'lantern', lamp: 'lantern', farol: 'lantern', balloon: 'balloon', globo: 'balloon', campfire: 'campfire', fire: 'campfire', hoguera: 'campfire', fence: 'fence', valla: 'fence', enemy: 'enemy', enemigo: 'enemy' };
  const normKind = (k) => KIND[norm(k).replace(/s$/, '')] || KIND[norm(k)] || null;
  function groundY(x, z, above) { const g = PF.groundAt(x, z, above); return g > -50 ? g : null; }
  function front(ctx, d) { const P = PF.player, cy = PF.cam.yaw; const x = P.pos.x + Math.sin(cy) * d, z = P.pos.z + Math.cos(cy) * d; const y = groundY(x, z, P.pos.y + 2.5); return V(x, y == null ? P.pos.y : y, z); }
  function around(ref, relName, gap) {
    const P = PF.player, base = ref.pos, rr = (ref.r || 0.5) + (gap || 1.3), cy = PF.cam.yaw;
    if (relName === 'behind') return V(base.x + Math.sin(cy) * rr, base.y, base.z + Math.cos(cy) * rr);
    if (relName === 'in_front') return V(base.x - Math.sin(cy) * rr, base.y, base.z - Math.cos(cy) * rr);
    if (relName === 'on') return V(base.x, base.y + (ref.h || 1), base.z);
    if (relName === 'under' || relName === 'in') return V(base.x, base.y, base.z);
    if (relName === 'above') return V(base.x, base.y + (ref.h || 1) + 2.5, base.z);
    const side = ref === P ? 1 : (P.pos.x <= base.x ? -1 : 1), x = base.x + -Math.cos(cy) * rr * side, z = base.z + Math.sin(cy) * rr * side, y = groundY(x, z, base.y + 2);
    return V(x, y == null ? base.y : y, z);
  }
  function wallAhead(ctx) { const P = PF.player; return PF.all('wall').filter((w) => w.z1 > P.pos.z - 2 && w.z0 - P.pos.z < 70).sort((a, b) => a.z0 - b.z0)[0] || PF.all('wall')[0] || null; }
  function enemyAhead(ctx) { const P = PF.player; if (ctx.thisEnt && ctx.thisEnt.alive && ctx.thisEnt.type === 'enemy' && ctx.thisEnt.state !== 'doomed') return ctx.thisEnt; return nearestOf('enemy', P.pos, (e) => e.pos.z > P.pos.z - 4 && e.pos.z - P.pos.z < 40) || null; }
  function puddleNear(ctx, ref) { const P = PF.player; if (ref && ref.type === 'puddle') return ref; if (ref && ref.type !== 'player') { const p = PF.all('puddle').find((q) => q.contains(ref.pos.x, ref.pos.z, 1)); if (p) return p; } return nearestOf('puddle', P.pos, (p) => Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z) < 60); }
  const narrowZ = (z) => (z > 37 && z < 65) || (z > 103 && z < 151);

  /* ================= ejecutar operaciones ================= */
  const MSG = PF.L({ ladder: 'Escalera apoyada en el muro', puddle: 'Charco listo', shark: 'Un tiburón en el charco', bridge: 'Puente tendido sobre el charco', spring: 'Un muelle', platform: 'Una plataforma', crate: 'Una caja', gem: 'Gemas', heart: 'Un corazón', tree: 'Un árbol', flowers: 'Flores', rock: 'Una roca', lantern: 'Un farol', balloon: 'Un globo', campfire: 'Una hoguera', fence: 'Una valla', enemy: 'Otro Gruñón' },
    { ladder: 'Ladder leaning on the wall', puddle: 'Puddle ready', shark: 'A shark in the puddle', bridge: 'Bridge laid across the puddle', spring: 'A spring', platform: 'A platform', crate: 'A crate', gem: 'Gems', heart: 'A heart', tree: 'A tree', flowers: 'Flowers', rock: 'A rock', lantern: 'A lantern', balloon: 'A balloon', campfire: 'A campfire', fence: 'A fence', enemy: 'Another Grumble' });
  const OPN = { add: 'add', spawn: 'add', create: 'add', place: 'add', put: 'add', remove: 'remove', delete: 'remove', destroy: 'remove', kill: 'remove', eliminate: 'remove', move: 'move', teleport: 'move', bring: 'move', projectile: 'projectile', behaviour: 'projectile', behavior: 'projectile', set_projectile: 'projectile', throw: 'projectile', interact: 'interact', action: 'interact', eat: 'interact', wear: 'wear', dress: 'wear', equip: 'wear', accessory: 'wear', costume: 'wear', companions: 'companions', allies: 'companions', helpers: 'companions', add_companions: 'companions', weather: 'weather', time: 'time', time_of_day: 'time', logos: 'logos', logo: 'logos', brands: 'logos', invent: 'invent', custom: 'invent', create_new: 'invent', say: 'say', make_real: 'make_real', 'make real': 'make_real', real: 'make_real', film: 'make_real', make_movie: 'make_real', movie: 'make_real' };
  const PROJ = { fireballs: 'fireballs', fireball: 'fireballs', fire: 'fireballs', flowers: 'flowers', flower: 'flowers', flores: 'flowers', bubbles: 'bubbles', pompas: 'bubbles', snowballs: 'snowballs', snow: 'snowballs', confetti: 'confetti', confeti: 'confetti', hearts: 'hearts', corazones: 'hearts' };
  const WEAR = { tutu: 'tutu', 'tutú': 'tutu', crown: 'crown', corona: 'crown', sunglasses: 'sunglasses', glasses: 'sunglasses', gafas: 'sunglasses', hat: 'hat', sombrero: 'hat', bow: 'bow', lazo: 'bow', cape: 'cape', capa: 'cape', scarf: 'scarf', bufanda: 'scarf' };
  const WX = { clear: 'clear', sun: 'clear', sunny: 'clear', sol: 'clear', cloudy: 'cloudy', clouds: 'cloudy', rain: 'rain', rainy: 'rain', lluvia: 'rain', snow: 'snow', snowy: 'snow', nieve: 'snow', fog: 'fog', foggy: 'fog', niebla: 'fog', storm: 'storm', tormenta: 'storm' };
  const HOUR = { dawn: 6.8, sunrise: 6.8, morning: 9.5, day: 13, noon: 13, midday: 13, afternoon: 16, dusk: 19, sunset: 19, evening: 19.5, night: 22.5, midnight: 0.5 };

  const X = {
    add(op, ctx) {
      const kind = normKind(op.kind || op.type || op.what || '');
      if (!kind) { if (op.kind && WEAR[norm(op.kind)]) return X.wear({ id: op.ref || op.target || 'this', item: op.kind }, ctx); return X.invent({ what: op.kind || op.what, label: op.label || op.kind, rel: op.rel, ref: op.ref }, ctx); }
      const relName = norm(op.rel || '').replace(/ /g, '_'), ref = resolve(op.ref || op.target || op.near, ctx);
      const P = PF.player; let n = U.clamp(Math.round(+op.count || 1), 1, kind === 'gem' ? 20 : 8);
      if (kind === 'ladder') {
        const w = ref && ref.type === 'wall' ? ref : wallAhead(ctx);
        let e;
        if (w) { const x = U.clamp(P.pos.x, w.x0 + 0.9, w.x1 - 0.9), taken = PF.all('ladder').find((l) => l.data.wall === w && Math.abs(l.climb.x - x) < 1.6); const xx = taken ? U.clamp(x + 1.8, w.x0 + 0.9, w.x1 - 0.9) : x; e = PF.spawn('ladder', { x: xx, zFace: w.z0, h: w.h, yaw: 0 }); e.data.wall = w; }
        else { const f = front(ctx, 2.5); e = PF.spawn('ladder', { x: f.x, zFace: f.z + 1, h: 4, yaw: PF.cam.yaw }); }
        return { ok: true, kind, ent: e, msg: w ? MSG.ladder : PF.L('Una escalera (no hay muro cerca)', 'A ladder (no wall nearby)') };
      }
      if (kind === 'puddle') {
        const target = ref && ref !== P ? ref : (relName === 'under' || relName === 'in' || /enem/.test(norm(op.ref || '')) ? enemyAhead(ctx) : null) || (op.ref ? null : enemyAhead(ctx));
        let at, rx = 2.2, rz = 2.2;
        if (target && target !== P) { at = V(target.pos.x, 0, target.pos.z); if (target.type === 'enemy') { rx = U.clamp(target.r - 0.05, 1.2, 2.4); rz = 4.4; at.z += (Math.sign(target.pos.z - P.pos.z) || 1) * 1.0; } else if (narrowZ(target.pos.z)) { rx = 1.6; rz = 4.6; } }
        else at = front(ctx, 4);
        const gy = groundY(at.x, at.z, at.y + 1); at.y = gy == null ? 0 : gy;
        const e = PF.spawn('puddle', { at, rx, rz, y: at.y });
        if (target && target.type === 'enemy') PF.after(0.5, () => PF.say(target, PF.L('¿Agua? ¡Odio mojarme las patas!', 'Water? I hate wet feet!'), { voice: false }));
        return { ok: true, kind, ent: e, under: target ? target.id : null, msg: target && target.type === 'enemy' ? PF.L('Charco bajo el ' + (target.name || 'Gruñón'), 'Puddle under ' + (target.name || 'Grumble')) : MSG.puddle };
      }
      if (kind === 'shark') {
        let p = puddleNear(ctx, ref);
        if (!p) p = PF.spawn('puddle', { at: front(ctx, 4), rx: 2.4, rz: 2.4 });
        if (p.shark && p.shark.alive) return { ok: true, kind, ent: p.shark, msg: PF.L('Ya hay un tiburón en ese charco', 'There’s already a shark in that puddle') };
        const e = PF.spawn('shark', { puddle: p }); PF.after(0.9, () => PF.say(e, PF.L('¡Hola! ¿Hay algo de comer por aquí?', 'Hi! Anything to eat around here?'), { voice: false }));
        return { ok: true, kind, ent: e, msg: MSG.shark };
      }
      if (kind === 'bridge') {
        const p = puddleNear(ctx, ref); const mat = /stone|piedra/.test(norm(op.material || op.kind || '')) ? 'stone' : 'wood';
        let e;
        if (p) e = PF.spawn('bridge', { x: p.pos.x, z: p.pos.z, len: p.rz * 2 + 2.4, width: Math.min(2.1, p.rx * 2 - 0.4), material: mat });
        else { const f = front(ctx, 5.5); e = PF.spawn('bridge', { x: f.x, z: f.z, len: 8, width: 2.1, material: mat }); }
        return { ok: true, kind, ent: e, msg: p ? (mat === 'stone' ? PF.L('Puente de piedra sobre el charco', 'Stone bridge across the puddle') : MSG.bridge) : PF.L('Un puente', 'A bridge') };
      }
      const out = [];
      for (let i = 0; i < n; i++) {
        let at;
        if (kind === 'platform' && (!ref || ref.type === 'wall') && (ref || /wall|muro/.test(norm(op.ref || '')))) { const w = ref || wallAhead(ctx); at = V(U.clamp(P.pos.x, w.x0 + 1.5, w.x1 - 1.5), 2.6, w.z0 - 1.6); }
        else if (ref && ref !== P) at = around(ref, relName || 'beside', 1.4);
        else if (ref === P && relName && relName !== 'in_front') at = around(P, relName, 1.2);
        else at = front(ctx, 3.4 + i * 1.3);
        if (n > 1 && i > 0 && !(ref && ref !== P)) at.x += (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.1;
        if (kind === 'platform' && at.y < 0.5 && !ref) at.y += 1.8;
        if (kind === 'balloon' || kind === 'gem' || kind === 'heart') { const gy = groundY(at.x, at.z, at.y + 1.5); if (gy != null) at.y = gy; }
        out.push(PF.spawn(kind, { at, color: op.color }));
      }
      return { ok: true, kind, ent: out[0], ents: out, msg: MSG[kind] + (n > 1 ? ' ×' + n : '') };
    },
    remove(op, ctx) {
      const ids = Array.isArray(op.ids) ? op.ids : [op.id || op.target || op.ref || 'this'], done = [];
      for (const id of ids) {
        const e = resolve(id, ctx);
        if (e === PF.player) return { ok: false, msg: PF.L('A ' + N + ' no lo quito: es el protagonista', 'I won’t remove ' + N + ': he’s the hero') };
        if (!e || !e.alive) continue;
        PF.kill(e, 'poof'); done.push(e);
      }
      if (!done.length) return { ok: false, msg: PF.L('No encuentro eso', 'I can’t find that') };
      return { ok: true, kind: 'remove', ent: done[0], removed: done.map((e) => e.id), msg: PF.L('Adiós, ', 'Bye-bye, ') + done.map((e) => e.name || e.label).join(', ') };
    },
    move(op, ctx) {
      const e = resolve(op.id || op.target, ctx); if (!e) return { ok: false, msg: PF.L('No encuentro a quién mover', 'I can’t find who to move') };
      if (e === PF.player) return { ok: false, msg: PF.L('A ' + N + ' lo mueves tú con el teclado', 'You move ' + N + ' with the keyboard') };
      if (e.type === 'wall' || e.type === 'boss' && e.mood !== 'happy' && false) return { ok: false, msg: PF.L('Eso no se mueve', 'That doesn’t move') };
      const relName = norm(op.rel || 'beside').replace(/ /g, '_'), ref = resolve(op.ref || 'player', ctx) || PF.player;
      const at = around(ref, relName === 'next_to' || relName === 'near' || relName === 'with' ? 'beside' : relName, e.type === 'princess' ? 0.9 : 1.4);
      const from = e.pos.clone(); PF.fx.magic(from.x, from.y + 0.5, from.z, 30); PF.sfx.play('sparkle');
      e.pos.copy(at); const gy = groundY(at.x, at.z, at.y + 1.5); if (gy != null) e.pos.y = gy;
      for (const c of e.cols || []) { if (c.x != null) { c.x = e.pos.x; c.z = e.pos.z; } }
      if (e.home) e.home.copy(e.pos);
      PF.fx.magic(e.pos.x, e.pos.y + 0.6, e.pos.z, 40, '#fff3a8'); PF.fx.poof(e.pos.x, e.pos.y + 0.8, e.pos.z, '#ffe9fb', 18);
      if (e.type === 'princess') { const wasCaged = e.state === 'caged'; e.state = ref === PF.player ? 'follow' : 'free'; if (wasCaged && PF.world.cageDoor) { PF.world.cageDoor.visible = false; } PF.models.playOnce(e.ch, 'wave', 2.2); if (ref === PF.player) PF.after(0.3, () => PF.models.playOnce(PF.player.ch, 'wave', 2.2)); PF.after(0.4, () => PF.say(e, wasCaged ? PF.L('¡Por fin libre! ¡Gracias, ' + N + '! Vamos juntos a la meta.', 'Free at last! Thank you, ' + N + '! Let’s go to the goal together.') : PF.L('¡Aquí estoy, ' + N + '!', 'Here I am, ' + N + '!'), { voice: true })); PF.emit('princess', e); }
      return { ok: true, kind: 'move', ent: e, msg: (e.name || e.label) + PF.L(' junto a ', ' next to ') + (ref === PF.player ? '' + N + '' : ref.name || ref.label) };
    },
    projectile(op, ctx) {
      const e = resolve(op.id || op.actor || 'boss', ctx) || PF.get('boss'); const v = PROJ[norm(op.value || op.projectile || op.kind || '')];
      if (!e || e.type !== 'boss' || !v) return { ok: false, msg: PF.L('No sé qué tiene que lanzar', 'I don’t know what to throw') };
      PF.boss.setProjectile(e, v);
      return { ok: true, kind: 'projectile', ent: e, value: v, msg: v === 'flowers' ? PF.L('El Rey Volcán ahora lanza flores', 'The Volcano King now throws flowers') : PF.L('Ahora lanza ' + ({ fireballs: 'bolas de fuego', bubbles: 'pompas', snowballs: 'bolas de nieve', confetti: 'confeti', hearts: 'corazones' }[v]), 'Now he throws ' + v) };
    },
    interact(op, ctx) {
      const action = norm(op.action || op.op || ''), actor = resolve(op.actor || op.id, ctx), target = resolve(op.target || op.ref, ctx);
      if (/eat|come|comer|swallow|bite/.test(action)) {
        const sh = actor && actor.type === 'shark' ? actor : nearestOf('shark', PF.player.pos);
        let tg = target && target !== PF.player && target.type !== 'shark' ? target : null;
        if (!tg && sh) tg = nearestOf('enemy', sh.pos);
        if (!sh || !tg) return { ok: false, msg: !sh ? PF.L('No hay ningún tiburón', 'There’s no shark') : PF.L('No hay a quién comerse', 'There’s no one to eat') };
        if (tg === PF.player) return { ok: false, msg: PF.L('El tiburón es vegetariano con ' + N + '', 'The shark is vegetarian around ' + N) };
        if (Math.hypot(tg.pos.x - sh.pos.x, tg.pos.z - sh.pos.z) > 16) return { ok: false, msg: PF.L('El tiburón no llega hasta ahí', 'The shark can’t reach that far') };
        PF.KINDS.shark.eat(sh, tg); return { ok: true, kind: 'eat', ent: tg, msg: PF.L('El tiburón se zampa al ' + (tg.name || tg.label), 'The shark gobbles up ' + (tg.name || tg.label)) };
      }
      if (/attack|ataca|push|empuja|kick/.test(action) && target && target.type === 'enemy') {
        // «atacar» nunca trae compañeros (solo llegan con «añade 5 compañeros»): si ya están, Decision-1.1 decide quién va a por él;
        // si no hay ninguno, es lo mismo que quitarlo (y cuenta como «remove», para que la red de seguridad no lo repita)
        if (PF.all('companion').length) { PF.allies.decideAll(true); return { ok: true, kind: 'attack', ent: target, msg: PF.L('Los compañeros van a por él', 'The companions go after him') }; }
        if (!target.alive || target.state === 'doomed') return { ok: false, msg: PF.L('No encuentro eso', 'I can’t find that') };
        PF.kill(target, 'poof');
        return { ok: true, kind: 'remove', ent: target, removed: [target.id], msg: PF.L('Adiós, ', 'Bye-bye, ') + (target.name || target.label) };
      }
      return { ok: false, msg: PF.L('No sé hacer eso', 'I don’t know how to do that') };
    },
    wear(op, ctx) {
      const item = WEAR[norm(op.item || op.value || op.kind || '')]; const e = resolve(op.id || op.target || 'this', ctx) || (item === 'tutu' ? PF.get('boss') : null);
      if (!item || !e) return { ok: false, msg: PF.L('No sé qué ponerle', 'I don’t know what to put on') };
      PF.wear(e, item);
      return { ok: true, kind: 'wear', ent: e, item, msg: (item === 'tutu' ? PF.L('Tutú para ', 'A tutu for ') : PF.L('Complemento para ', 'An accessory for ')) + (e.type === 'boss' ? PF.L('', 'the ') : '') + (e.name || e.label) };
    },
    companions(op) { const n = U.clamp(Math.round(+op.count || 5), 1, 5); const out = PF.allies.add(n); return { ok: true, kind: 'companions', n: PF.all('companion').length, msg: out.length ? out.length + PF.L(' compañeros: ', out.length === 1 ? ' companion: ' : ' companions: ') + out.map((e) => e.name).join(', ') : PF.L('Ya están todos aquí', 'They’re all here already') }; },
    weather(op) { const w = WX[norm(op.value || op.weather || '')]; if (!w) return { ok: false, msg: PF.L('No conozco ese tiempo', 'I don’t know that weather') }; PF.setWeather(w); if (w === 'clear' && (PF.env.target < 8 || PF.env.target > 17.5)) PF.setTime(12); /* «que salga el sol»: despejado y de día */ return { ok: true, kind: 'weather', value: w, msg: PF.L({ clear: 'Sale el sol', cloudy: 'Se nubla', rain: 'Llueve: adiós incendios', snow: 'Nieva', fog: 'Niebla', storm: 'Tormenta' }, { clear: 'Here comes the sun', cloudy: 'It clouds over', rain: 'Rain: goodbye, fires', snow: 'It’s snowing', fog: 'Fog rolls in', storm: 'A storm' })[w] }; },
    time(op) { let h = op.hour != null ? +op.hour : HOUR[norm(op.value || op.time || '')]; if (h == null || !isFinite(h)) h = parseFloat(op.value); if (!isFinite(h)) return { ok: false, msg: PF.L('No entiendo la hora', 'I don’t understand the time') }; PF.setTime(h); return { ok: true, kind: 'time', value: h, msg: h >= 21 || h < 5 ? PF.L('Se hace de noche', 'Night falls') : h >= 17.5 ? PF.L('Atardece', 'The sun sets') : h < 8 ? PF.L('Amanece', 'The sun rises') : PF.L('Es de día', 'It’s daytime') }; },
    logos(op) { let b = (Array.isArray(op.brands) ? op.brands : [op.brands || op.value || '']).map((x) => norm(x)).flatMap((x) => x.split(/[\s,]+/)).map((x) => (/github/.test(x) && !/copilot/.test(x) ? 'github' : /copilot/.test(x) ? 'copilot' : /foundry|azure/.test(x) ? 'foundry' : /microsoft/.test(x) ? 'microsoft' : null)).filter(Boolean); if (!b.length) b = ['foundry', 'microsoft']; b = Array.from(new Set(b)); PF.finale.logos(b); return { ok: true, kind: 'logos', brands: b, msg: PF.L('Logos de ', 'Logos: ') + b.map((x) => ({ foundry: 'Microsoft Foundry', microsoft: 'Microsoft', copilot: 'GitHub Copilot', github: 'GitHub' }[x])).join(PF.L(' y ', ' and ')) }; },
    invent(op, ctx) { const what = String(op.what || op.label || '').slice(0, 120); if (!what) return { ok: false, msg: PF.L('No sé qué inventar', 'I don’t know what to invent') }; const job = PF.inventor.make({ what, label: op.label || what, rel: op.rel, ref: op.ref, size: op.size }, ctx); return { ok: true, kind: 'invent', pending: job, msg: PF.L('MAI-Code-2-Flash está escribiendo ', 'MAI-Code-2-Flash is writing ') + PF.quote(op.label || what) }; },
    // «hacerlo real»: un plano de cine de unos segundos alrededor de lo que hay delante → MAI-Image-2.7 → MiniMax H3 Max (fal en Foundry)
    make_real(op) {
      if (!PF.real) return { ok: false, msg: PF.L('«Hacerlo real» no está disponible', '“Make it real” isn’t available') };
      const was = PF.real.busy();
      PF.real.start({ style: op.style, by: 'order' }).catch(() => {});
      return { ok: true, kind: 'real', msg: was ? PF.L('Ya lo estoy haciendo real', 'Already making it real') : PF.L('¡Se rueda! Un plano de cine y MiniMax H3 Max lo hace real', 'Rolling! A movie shot, then MiniMax H3 Max makes it real') };
    },
    say(op, ctx) { const e = resolve(op.id || 'princess', ctx); if (e && op.text) PF.say(e, String(op.text).slice(0, 140), { voice: true }); return { ok: !!e, kind: 'say', msg: '' }; },
  };
  function exec(op, ctx) {
    const name = OPN[norm(op.op || op.type || op.action || '')];
    if (!name || !X[name]) return { ok: false, msg: PF.L('Operación desconocida: ', 'Unknown operation: ') + (op.op || '?') };
    try { const r = X[name](op, ctx) || { ok: true }; r.op = name; return r; } catch (e) { console.warn('op', op, e); return { ok: false, op: name, msg: 'Error: ' + String(e && e.message || e).slice(0, 60) }; }
  }

  /* ================= red de seguridad: gramática local en español ================= */
  const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const NOUNS = [
    [/\bescaler(a|as|illa)\b/, 'prop', 'ladder'], [/\b(charcos?|estanques?|laguna|piscina)\b/, 'prop', 'puddle'], [/\btiburon(es)?\b/, 'prop', 'shark'], [/\bpuentes?\b/, 'prop', 'bridge'],
    [/\b(muelles?|trampolin(es)?|cama elastica)\b/, 'prop', 'spring'], [/\bplataformas?\b/, 'prop', 'platform'], [/\b(cajas?|cajon(es)?)\b/, 'prop', 'crate'], [/\b(gemas?|monedas?|diamantes?|joyas?)\b/, 'prop', 'gem'],
    [/\bcorazon(es)?\b/, 'prop', 'heart'], [/\barbol(es)?\b/, 'prop', 'tree'], [/\b(flor|flores|ramos?)\b/, 'prop', 'flowers'], [/\b(rocas?|pedruscos?)\b/, 'prop', 'rock'], [/\b(farol(es)?|farolas?|linternas?|lamparas?)\b/, 'prop', 'lantern'],
    [/\bglobos?\b/, 'prop', 'balloon'], [/\b(hogueras?|fogatas?)\b/, 'prop', 'campfire'], [/\bvallas?\b/, 'prop', 'fence'],
    [/\b(enemigos?|monstruos?|bichos?|grunon(es)?|guardias?|malos?)\b/, 'ent', 'enemy'], [/\bprincesa\b/, 'ent', 'princess'], [/\b(jefe|rey|golem|boss|villano)\b/, 'ent', 'boss'], [/\b(muro|pared|muralla)\b/, 'ent', 'wall'],
    [/\b(tutus?|tutu)\b/, 'wear', 'tutu'], [/\bcorona\b/, 'wear', 'crown'], [/\bgafas\b/, 'wear', 'sunglasses'], [/\bsombrero\b/, 'wear', 'hat'], [/\blazo\b/, 'wear', 'bow'], [/\bcapa\b/, 'wear', 'cape'], [/\bbufanda\b/, 'wear', 'scarf'],
    [/\blogos?\b/, 'logos', null], [/\b(companeros?|amigos?|ayudantes?|aliados?|npcs?|colegas)\b/, 'allies', null],
  ];
  const PUT = /\b(pon|ponme|ponle|ponles|poner|anade|anadir|coloca|colocar|crea|crear|construye|construir|mete|meter|dame|quiero|aparece|aparezca|haz|hazme|hacer|saca un|trae)\b/;
  const DEL = /\b(elimina|eliminar|eliminalo|quita|quitar|quitalo|borra|borrar|borralo|destruye|destruir|desaparece|desaparecer|deshazte|echa|vete|fuera|aparta|apartalo|liquida|elimines|quites|borres)\b/;
  function nouns(t) { const out = []; for (const [re, cat, val] of NOUNS) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) out.push({ i: m.index, cat, val, w: m[0] }); } return out.sort((a, b) => a.i - b.i); }
  function brandsOf(t) { const b = []; if (/foundry|azure/.test(t)) b.push('foundry'); if (/microsoft/.test(t)) b.push('microsoft'); if (/copilot/.test(t)) b.push('copilot'); else if (/github|git hub/.test(t)) b.push('github'); return b.length ? b : ['foundry', 'microsoft']; }
  // «hacerlo real» (las dos gramáticas): basta con que haya empezado un rodaje durante la orden o que ya haya uno en marcha
  const realCheck = (ctx) => !!(PF.real && (PF.real.busy() || PF.real.lastStart() >= ctx.t0));
  const REAL_ES = /\b(haz(lo|la)? real|hacer(lo|la)? real|hazlo realidad|hazlo de verdad|(conviertelo|conviertela|convierte (esto|esta escena|la escena|todo)) en (una )?(pelicula|video real)|rueda (esta|la) escena|ruedalo|ruedala|haz (una )?pelicula (de|con) (esto|esta escena))\b/;
  function clauseIntents(t, raw) {
    const out = [], N = nouns(t), first = (cat) => N.find((n) => !cat || n.cat === cat);
    const add = (key, op, check) => out.push({ key, op, check });
    if (REAL_ES.test(t)) { add('real', { op: 'make_real' }, realCheck); return out; }
    // tiempo y hora
    if (/\b(llueva|lluvia|llover|llueve|lloviendo|chaparron)\b/.test(t)) add('weather', { op: 'weather', value: 'rain' }, () => PF.env.weather === 'rain');
    else if (/\b(tormenta|truenos|relampagos)\b/.test(t)) add('weather', { op: 'weather', value: 'storm' }, () => PF.env.weather === 'storm');
    else if (/\b(nieve|nieva|nevar|nevando|nevada)\b/.test(t)) add('weather', { op: 'weather', value: 'snow' }, () => PF.env.weather === 'snow');
    else if (/\b(niebla|neblina)\b/.test(t)) add('weather', { op: 'weather', value: 'fog' }, () => PF.env.weather === 'fog');
    else if (/\bnublado\b/.test(t)) add('weather', { op: 'weather', value: 'cloudy' }, () => PF.env.weather === 'cloudy');
    else if (/\b(sol|soleado|despejado|despeje|buen tiempo|escampe)\b/.test(t) && !/puesta de sol/.test(t)) add('weather', { op: 'weather', value: 'clear' }, () => PF.env.weather === 'clear' && PF.env.target >= 8 && PF.env.target <= 17.5);
    const hour = /\b(noche|anochezca|anochecer|anochece)\b/.test(t) ? 22.5 : /\b(atardecer|atardezca|atardece|puesta de sol|ocaso)\b/.test(t) ? 19 : /\b(amanecer|amanezca|amanece|alba)\b/.test(t) ? 6.8 : /\b(mediodia|de dia|sea de dia)\b/.test(t) ? 13 : null;
    if (hour != null) add('time', { op: 'time', hour }, () => Math.abs(PF.env.target - hour) < 0.6);
    // logos
    if (/\blogos?\b/.test(t) || (/\b(foundry|microsoft|copilot|github)\b/.test(t) && PUT.test(t))) { const b = brandsOf(t); add('logos', { op: 'logos', brands: b }, () => PF.finale.shown(b)); return out; }
    // compañeros
    const mA = t.match(/\b(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)?\s*(companeros?|amigos?|ayudantes?|aliados?|npcs?|colegas)\b/);
    if (mA && (PUT.test(t) || /\b(que me ayuden|ayuda)\b/.test(t))) { const n = Math.min(5, NUM[mA[1]] || parseInt(mA[1], 10) || 5); add('companions', { op: 'companions', count: n }, () => PF.all('companion').length >= n); return out; }
    // el tiburón se come a alguien
    if (/\btiburon/.test(t) && /\b(coma|come|comer|comerse|comase|zampe|zampa|trague|traga|devore|devora|muerda|engulla)\b/.test(t)) {
      add('eat', { op: 'interact', actor: 'shark', action: 'eat', target: 'enemy' }, (ctx) => { const sh = nearestOf('shark', PF.player.pos); const tg = ctx.eatTarget; return !!(tg && (!tg.alive || tg.state === 'doomed')); });
      return out;
    }
    // el jefe lanza otra cosa
    if (/\b(lance|lanza|lanzar|tire|tira|dispare|dispara|escupa|escupe|arroje|arroja)\b/.test(t)) {
      const insteadFire = /en (lugar|vez) de (las )?bolas de fuego/.test(t) || /en (lugar|vez) de fuego/.test(t);
      const v = /\bflor(es)?\b/.test(t) ? 'flowers' : /(pompas|burbujas)/.test(t) ? 'bubbles' : /bolas de nieve/.test(t) ? 'snowballs' : /confeti/.test(t) ? 'confetti' : /corazones/.test(t) ? 'hearts' : !insteadFire && /(bolas de fuego|fuego)/.test(t) ? 'fireballs' : null;
      if (v) { add('projectile', { op: 'projectile', id: 'boss', value: v }, () => { const b = PF.get('boss'); return !b || b.projectile === v; }); return out; }
    }
    // quitar
    if (DEL.test(t)) {
      const tgt = N.find((n) => n.cat === 'ent' || n.cat === 'prop');
      const ref = /\b(este|esta|ese|esa|esto|eso)\b/.test(t) && (!tgt || tgt.val === 'enemy') ? 'this' : tgt ? tgt.val : 'this';
      add('remove', { op: 'remove', id: ref, _type: tgt ? tgt.val : null }, (ctx) => { const e = ctx.removeTarget; return !!(e && !e.alive) || (ctx.removeTarget === null && !!ctx.removedAny); });
      return out;
    }
    // la princesa junto a el protagonista
    if (/\bprincesa\b/.test(t) && (/\b(junto|lado|cerca|conmigo|aqui|traeme|trae|traer|lleva|llevala|baja|bajala|libera|liberala|rescata|rescatala|jugador)\b/.test(t) || PUT.test(t))) {
      add('princess', { op: 'move', id: 'princess', rel: 'beside', ref: 'player' }, () => { const p = PF.get('princess'); return !!(p && p.state === 'follow' && Math.hypot(p.pos.x - PF.player.pos.x, p.pos.z - PF.player.pos.z) < 4); });
      return out;
    }
    // poner algo
    if (PUT.test(t) || /^(una?|el|la|los|las)\b/.test(t)) {
      const obj = N.find((n) => n.cat === 'prop' || n.cat === 'wear');
      if (obj && obj.cat === 'wear') {
        const tgtN = N.find((n) => n.cat === 'ent' && n.i > obj.i) || N.find((n) => n.cat === 'ent');
        const who = (/\b(jugador|protagonista|me|mi)\b/.test(t) || t.includes(' ' + norm(N) + ' ')) && !tgtN ? 'player' : tgtN ? tgtN.val : obj.val === 'tutu' ? 'boss' : 'this';
        add('wear', { op: 'wear', id: who, item: obj.val }, (ctx) => { const e = ctx.wearTarget; return !!(e && e.wearing && e.wearing[obj.val]); });
        return out;
      }
      if (obj) {
        const after = N.filter((n) => n.i > obj.i);
        const refN = after.find((n) => n.cat === 'ent' || n.cat === 'prop');
        let relName = null, ref = refN ? refN.val : null;
        if (obj.val === 'ladder') { relName = 'against'; ref = 'wall'; }
        else if (obj.val === 'bridge') { relName = 'across'; ref = 'puddle'; }
        else if (obj.val === 'shark') { relName = 'in'; ref = 'puddle'; }
        else if (/\b(bajo|debajo|abajo|a los pies)\b/.test(t)) relName = 'under';
        else if (/\b(junto|al lado|cerca)\b/.test(t)) relName = 'beside';
        else if (/\b(delante|enfrente)\b/.test(t)) relName = 'in_front';
        else if (/\b(detras)\b/.test(t)) relName = 'behind';
        else if (/\b(encima|sobre)\b/.test(t)) relName = 'on';
        if (/\b(este|esta|ese|esa)\b/.test(t) && (!ref || ref === 'enemy')) ref = 'this';
        if (ref === 'enemy' && obj.val === 'puddle') relName = 'under';
        const mNum = t.match(/\b(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+\w+/); const count = mNum ? NUM[mNum[1]] || parseInt(mNum[1], 10) || 1 : 1;
        const op = { op: 'add', kind: obj.val, rel: relName, ref, count, material: /\bpiedra\b/.test(t) ? 'stone' : 'wood' };
        add('add:' + obj.val, op, (ctx) => ctx.added.has(obj.val) || (obj.val === 'shark' && !!PF.all('shark').find((s) => s.born >= ctx.t0)));
        return out;
      }
      // nada del catálogo: se inventa (MAI-Code-2-Flash)
      const m = raw.match(/\b(?:pon(?:me|le)?|añade|anade|coloca|crea|construye|mete|dame|quiero|haz(?:me)?)\s+(?:un|una|unos|unas|el|la|los|las|otro|otra)?\s*([^,.;!?]{2,60})/i);
      if (m && !out.length) { const label = m[1].replace(/\b(junto|al lado|delante|detr[aá]s|encima|sobre|cerca|aqu[ií])\b.*$/i, '').trim(); if (label && label.split(/\s+/).length <= 7) add('invent', { op: 'invent', what: label, label, rel: /junto|al lado|cerca/.test(t) ? 'beside' : null, ref: /junto|al lado|cerca/.test(t) ? 'player' : null }, (ctx) => ctx.invented); }
    }
    return out;
  }
  function parseEs(t0, raw) {
    const parts = t0.split(/\s(?:y|e|luego|despues|tambien|ademas)\s+(?=(?:pon|ponle|ponme|haz|que|quita|elimina|anade|coloca|crea|construye|mete|trae|lleva|borra|dale|dame|y)\b)/);
    const out = []; for (const p of parts) out.push(...clauseIntents(' ' + p + ' ', raw)); return out;
  }

  /* ================= red de seguridad: gramática local en inglés (modo ?lang=en) ================= */
  const NUM_EN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const NOUNS_EN = [
    [/\b(ladders?|stairs|staircase|stepladder)\b/, 'prop', 'ladder'], [/\b(puddles?|ponds?|pools?|water)\b/, 'prop', 'puddle'], [/\bsharks?\b/, 'prop', 'shark'], [/\bbridges?\b/, 'prop', 'bridge'],
    [/\b(springs?|trampolines?|bounce pads?)\b/, 'prop', 'spring'], [/\bplatforms?\b/, 'prop', 'platform'], [/\b(crates?|box|boxes)\b/, 'prop', 'crate'], [/\b(gems?|coins?|diamonds?|jewels?)\b/, 'prop', 'gem'],
    [/\bhearts?\b/, 'prop', 'heart'], [/\btrees?\b/, 'prop', 'tree'], [/\b(flowers?|bouquets?)\b/, 'prop', 'flowers'], [/\b(rocks?|boulders?)\b/, 'prop', 'rock'], [/\b(lanterns?|lamps?|street ?lights?)\b/, 'prop', 'lantern'],
    [/\bballoons?\b/, 'prop', 'balloon'], [/\b(campfires?|bonfires?)\b/, 'prop', 'campfire'], [/\bfences?\b/, 'prop', 'fence'],
    [/\b(enemy|enemies|monsters?|guards?|grumble|grouch|baddies|baddy|bad guys?|creatures?|imps?)\b/, 'ent', 'enemy'], [/\bprincess\b/, 'ent', 'princess'], [/\b(boss|king|golem|villain)\b/, 'ent', 'boss'], [/\bwall\b/, 'ent', 'wall'],
    [/\btutus?\b/, 'wear', 'tutu'], [/\bcrown\b/, 'wear', 'crown'], [/\b(sunglasses|glasses|shades)\b/, 'wear', 'sunglasses'], [/\bhat\b/, 'wear', 'hat'], [/\bbow\b/, 'wear', 'bow'], [/\bcape\b/, 'wear', 'cape'], [/\bscarf\b/, 'wear', 'scarf'],
    [/\blogos?\b/, 'logos', null], [/\b(companions?|friends?|helpers?|allies|ally|npcs?|buddies|buddy|sidekicks?)\b/, 'allies', null],
  ];
  const PUT_EN = /\b(put|puts|place|add|create|build|make|spawn|give me|bring|drop|set up|i want|i need|we need|summon|conjure|lets add|let s add|get me|throw in|plant)\b/;
  const DEL_EN = /\b(remove|delete|destroy|eliminate|kill|get rid of|take away|erase|banish|zap|defeat|knock out|vanish|disappear|go away)\b/;
  const REAL_EN = /\b(make (it|this|that|the scene|this scene|everything) (real|realistic|come to life)|make it look real|turn (it|this|that|the scene|this scene|everything) into (a |an )?(movie|film|real video|real footage)|film (this|it|the scene|this scene)|shoot (this|the) scene|roll (the )?camera|make a (movie|film) (of|out of) (this|it|the scene))\b/;
  function nounsEn(t) { const out = []; for (const [re, cat, val] of NOUNS_EN) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(t))) out.push({ i: m.index, cat, val, w: m[0] }); } return out.sort((a, b) => a.i - b.i); }
  function clauseIntentsEn(t, raw) {
    const out = [], NN = nounsEn(t);
    const add = (key, op, check) => out.push({ key, op, check });
    if (REAL_EN.test(t)) { add('real', { op: 'make_real' }, realCheck); return out; }
    // weather and time of day
    if (/\b(stop|stops) (the )?(rain|raining|snow|snowing)\b/.test(t)) add('weather', { op: 'weather', value: 'clear' }, () => PF.env.weather === 'clear');
    else if (/\b(rain|raining|rains|rainy|downpour|showers?)\b/.test(t)) add('weather', { op: 'weather', value: 'rain' }, () => PF.env.weather === 'rain');
    else if (/\b(storm|stormy|thunder|thunderstorm|lightning)\b/.test(t)) add('weather', { op: 'weather', value: 'storm' }, () => PF.env.weather === 'storm');
    else if (/\b(snow|snowing|snows|snowy|snowfall)\b/.test(t)) add('weather', { op: 'weather', value: 'snow' }, () => PF.env.weather === 'snow');
    else if (/\b(fog|foggy|mist|misty)\b/.test(t)) add('weather', { op: 'weather', value: 'fog' }, () => PF.env.weather === 'fog');
    else if (/\b(cloudy|overcast)\b/.test(t)) add('weather', { op: 'weather', value: 'cloudy' }, () => PF.env.weather === 'cloudy');
    else if (/\b(sun|sunny|sunshine|clear sky|clear skies|clear up|clears up|good weather|nice weather)\b/.test(t) && !/\b(sunset|sundown|sunrise)\b/.test(t)) add('weather', { op: 'weather', value: 'clear' }, () => PF.env.weather === 'clear' && PF.env.target >= 8 && PF.env.target <= 17.5);
    const hour = /\b(night|nighttime|night time|midnight|nightfall)\b/.test(t) ? 22.5 : /\b(sunset|sundown|dusk|evening|golden hour)\b/.test(t) ? 19 : /\b(sunrise|dawn|daybreak|morning)\b/.test(t) ? 6.8 : /\b(midday|noon|daytime|day time|make it day)\b/.test(t) ? 13 : null;
    if (hour != null) add('time', { op: 'time', hour }, () => Math.abs(PF.env.target - hour) < 0.6);
    // logos
    if (/\blogos?\b/.test(t) || (/\b(foundry|microsoft|copilot|github|git hub)\b/.test(t) && (PUT_EN.test(t) || /\bshow\b/.test(t)))) { const b = brandsOf(t); add('logos', { op: 'logos', brands: b }, () => PF.finale.shown(b)); return out; }
    // companions
    const mA = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(companions?|friends?|helpers?|allies|ally|npcs?|buddies|buddy|sidekicks?)\b/);
    if (mA && (PUT_EN.test(t) || /\b(help me|to help|helping me)\b/.test(t))) { const n = Math.min(5, NUM_EN[mA[1]] || parseInt(mA[1], 10) || 5); add('companions', { op: 'companions', count: n }, () => PF.all('companion').length >= n); return out; }
    // the shark eats someone
    if (/\bsharks?\b/.test(t) && /\b(eat|eats|eating|devour|devours|swallow|swallows|gobble|gobbles|chomp|chomps|munch|munches|bite|bites)\b/.test(t) && !/\bbridges?\b/.test(t)) {
      add('eat', { op: 'interact', actor: 'shark', action: 'eat', target: 'enemy' }, (ctx) => { const tg = ctx.eatTarget; return !!(tg && (!tg.alive || tg.state === 'doomed')); });
      return out;
    }
    // the boss throws something else
    if (/\b(throw|throws|throwing|shoot|shoots|shooting|launch|launches|toss|tosses|hurl|hurls|spit|spits|lob|lobs)\b/.test(t)) {
      const insteadFire = /\b(instead of|rather than|not)\b.*\b(fire ?balls?|fire)\b/.test(t);
      const v = /\bflowers?\b/.test(t) ? 'flowers' : /\bbubbles?\b/.test(t) ? 'bubbles' : /\b(snowballs?|snow balls?)\b/.test(t) ? 'snowballs' : /\bconfetti\b/.test(t) ? 'confetti' : /\bhearts?\b/.test(t) ? 'hearts' : !insteadFire && /\b(fire ?balls?|fire)\b/.test(t) ? 'fireballs' : null;
      if (v) { add('projectile', { op: 'projectile', id: 'boss', value: v }, () => { const b = PF.get('boss'); return !b || b.projectile === v; }); return out; }
    }
    // remove
    if (DEL_EN.test(t)) {
      const tgt = NN.find((n) => n.cat === 'ent' || n.cat === 'prop');
      const ref = /\b(this|that|it)\b/.test(t) && (!tgt || tgt.val === 'enemy') ? 'this' : tgt ? tgt.val : 'this';
      add('remove', { op: 'remove', id: ref, _type: tgt ? tgt.val : null }, (ctx) => { const e = ctx.removeTarget; return !!(e && !e.alive) || (ctx.removeTarget === null && !!ctx.removedAny); });
      return out;
    }
    // the princess next to the hero
    if (/\bprincess\b/.test(t) && !NN.some((n) => n.cat === 'wear') && (/\b(next to|beside|by|near|close to|with me|here|bring|free|rescue|release|let out|player|me)\b/.test(t) || PUT_EN.test(t))) {
      add('princess', { op: 'move', id: 'princess', rel: 'beside', ref: 'player' }, () => { const p = PF.get('princess'); return !!(p && p.state === 'follow' && Math.hypot(p.pos.x - PF.player.pos.x, p.pos.z - PF.player.pos.z) < 4); });
      return out;
    }
    // put something
    if (PUT_EN.test(t) || /^ ?(a|an|the|some)\b/.test(t)) {
      const obj = NN.find((n) => n.cat === 'prop' || n.cat === 'wear');
      if (obj && obj.cat === 'wear') {
        const tgtN = NN.find((n) => n.cat === 'ent' && n.i > obj.i) || NN.find((n) => n.cat === 'ent');
        const who = (/\b(player|me|myself|my character|hero)\b/.test(t) || t.includes(' ' + norm(PF.NAME) + ' ')) && !tgtN ? 'player' : tgtN ? tgtN.val : obj.val === 'tutu' ? 'boss' : 'this';
        add('wear', { op: 'wear', id: who, item: obj.val }, (ctx) => { const e = ctx.wearTarget; return !!(e && e.wearing && e.wearing[obj.val]); });
        return out;
      }
      if (obj) {
        const after = NN.filter((n) => n.i > obj.i);
        const refN = after.find((n) => n.cat === 'ent' || n.cat === 'prop');
        let relName = null, ref = refN ? refN.val : null;
        if (obj.val === 'ladder') { relName = 'against'; ref = 'wall'; }
        else if (obj.val === 'bridge') { relName = 'across'; ref = 'puddle'; }
        else if (obj.val === 'shark') { relName = 'in'; ref = 'puddle'; }
        else if (/\b(under|underneath|below|beneath)\b/.test(t)) relName = 'under';
        else if (/\b(next to|beside|near|close to|by)\b/.test(t)) relName = 'beside';
        else if (/\b(in front of|ahead of)\b/.test(t)) relName = 'in_front';
        else if (/\bbehind\b/.test(t)) relName = 'behind';
        else if (/\b(on top of|onto|on)\b/.test(t)) relName = 'on';
        if (/\b(this|that)\b/.test(t) && (!ref || ref === 'enemy')) ref = 'this';
        if (ref === 'enemy' && obj.val === 'puddle') relName = 'under';
        const mNum = t.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+\w+/); const count = mNum ? NUM_EN[mNum[1]] || parseInt(mNum[1], 10) || 1 : 1;
        const op = { op: 'add', kind: obj.val, rel: relName, ref, count, material: /\bstone\b/.test(t) ? 'stone' : 'wood' };
        add('add:' + obj.val, op, (ctx) => ctx.added.has(obj.val) || (obj.val === 'shark' && !!PF.all('shark').find((sh) => sh.born >= ctx.t0)));
        return out;
      }
      // nothing from the catalogue: MAI-Code-2-Flash invents it
      const m = raw.match(/\b(?:put|place|add|create|build|make|spawn|give me|bring|summon|conjure)\s+(?:me\s+)?(?:a|an|the|some|another)?\s*([^,.;!?]{2,60})/i);
      if (m && !out.length) { const label = m[1].replace(/\b(next to|beside|in front of|behind|on top of|near|right here|here|over there|there)\b.*$/i, '').trim(); if (label && label.split(/\s+/).length <= 7) add('invent', { op: 'invent', what: label, label, rel: /next to|beside|near/i.test(t) ? 'beside' : null, ref: /next to|beside|near/i.test(t) ? 'player' : null }, (ctx) => ctx.invented); }
    }
    return out;
  }
  function parseEn(t0, raw) {
    const parts = t0.split(/\s(?:and|then|also|plus|and then)\s+(?=(?:put|add|place|make|remove|delete|show|bring|give|let|turn|film|create|build|get|throw|have|set)\b)/);
    const out = []; for (const p of parts) out.push(...clauseIntentsEn(' ' + p + ' ', raw)); return out;
  }
  // en inglés manda la gramática inglesa; si no entiende nada, se prueba la española (por si alguien habla en español)
  function parseLocal(raw) {
    const t0 = norm(raw); if (!t0) return [];
    let out = PF.EN ? parseEn(t0, raw) : parseEs(t0, raw);
    if (!out.length && PF.EN) out = parseEs(t0, raw);
    const seen = new Set(); return out.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  }
  PF.parseLocal = parseLocal;

  /* ================= una orden, de principio a fin ================= */
  const O = (PF.orders = { log: [], busy: 0 });
  let queue = Promise.resolve();
  O.submit = (text, opt) => { const p = queue.then(() => run(String(text || '').trim(), opt || {})); queue = p.catch(() => {}); return p; };
  async function run(text, opt) {
    if (!text) return null;
    const t0 = performance.now(), P = PF.player, cy = PF.cam.yaw;
    const ctx = { t0: PF.time, thisEnt: thisOf(P, cy), added: new Set(), invented: false };
    const rec = { text, source: null, ms: 0, ok: false, ops: [], results: [], safety: [], route: null, model: null, ttft: null, decisionMs: null, said: null, at: Date.now(), via: opt.via || 'text' };
    O.busy++; PF.emit('order:start', rec); PF.ui && PF.ui.orderStart(rec);
    const intents = parseLocal(text);
    // preparar comprobaciones que necesitan saber el objetivo antes de ejecutar
    for (const i of intents) {
      if (i.key === 'eat') { const sh = nearestOf('shark', P.pos); ctx.eatTarget = (ctx.thisEnt && ctx.thisEnt.type === 'enemy' ? ctx.thisEnt : null) || (sh ? nearestOf('enemy', sh.pos) : enemyAhead(ctx)); i.op.target = ctx.eatTarget ? ctx.eatTarget.id : 'enemy'; if (sh) i.op.actor = sh.id; }
      if (i.key === 'remove') { const e = resolve(i.op.id, ctx) || (i.op._type ? nearestOf(i.op._type, P.pos) : null); ctx.removeTarget = e && e !== P ? e : null; if (ctx.removeTarget) i.op.id = ctx.removeTarget.id; }
      if (i.key === 'wear') { ctx.wearTarget = resolve(i.op.id, ctx) || PF.get('boss'); if (ctx.wearTarget) i.op.id = ctx.wearTarget === P ? 'player' : ctx.wearTarget.id; }
    }
    let model = null, err = null;
    const state = PF.describe();
    try {
      // O.offline simula que el modelo no responde (prueba de la red de seguridad local)
      if (O.offline) throw { code: 'offline', message: PF.L('modelo no disponible (simulado)', 'model unavailable (simulated)') };
      const r = await ask('plat', PROMPT(state, text), text, { timeout: opt.timeout || 9000 });
      rec.route = r.route; rec.model = r.done && r.done.model; rec.ttft = r.done && r.done.ttft; rec.modelMs = r.done && r.done.ms; rec.decisionMs = r.route && r.route.decision ? r.route.decision.ms : null;
      model = parseJSON(r.text); if (!model || !Array.isArray(model.ops)) throw { code: 'bad_json', message: PF.L('El modelo no devolvió operaciones', 'The model returned no operations') };
    } catch (e) { err = e; if (e && e.route) rec.route = e.route; }
    const run1 = (op, by) => { const res = exec(op, ctx); res.by = by; rec.results.push(res); if (res.ok && res.kind) { ctx.added.add(res.kind); if (res.kind === 'invent') ctx.invented = true; if (res.kind === 'remove') ctx.removedAny = true; } return res; };
    if (model) { rec.ops = model.ops.slice(0, 8); for (const op of rec.ops) run1(op, 'router'); rec.said = model.say ? String(model.say).slice(0, 120) : null; }
    // red de seguridad: lo que la frase pedía y no ha pasado
    for (const i of intents) {
      let ok = false; try { ok = i.check(ctx); } catch (x) { ok = false; }
      if (ok) continue;
      if (i.key === 'invent' && model && rec.results.some((r) => r.ok)) continue;
      const res = run1(i.op, 'local'); if (res.ok) rec.safety.push(i.key);
    }
    const okAny = rec.results.some((r) => r.ok);
    rec.ok = okAny; rec.source = !model ? (okAny ? 'local' : 'none') : rec.safety.length ? 'router+local' : 'router';
    rec.ms = Math.round(performance.now() - t0); rec.error = err ? err.message || err.code : null;
    // si la red local tuvo que completar la orden, la respuesta cuenta lo que de verdad ha pasado
    if (rec.safety.length) rec.said = rec.results.filter((r) => r.ok && r.msg && r.by === 'local').map((r) => r.msg).join('. ') || rec.said;
    if (!rec.said) rec.said = rec.results.filter((r) => r.ok && r.msg).map((r) => r.msg).join('. ') || (rec.results.find((r) => r.msg) || {}).msg || (err ? PF.L('No he podido hacerlo', 'I couldn’t do it') : PF.L('No sé hacer eso todavía', 'I can’t do that yet'));
    if (rec.safety.length || !model) {
      const H = HUD(); if (H) H.note(PF.L('Red de seguridad', 'Safety net'), PF.quote(text.slice(0, 80)), '<div class="row"><span class="chip foundry">local</span><span>' + (model ? PF.L('completé: ', 'completed: ') : PF.L('el modelo no respondió (', 'the model didn’t answer (') + esc(rec.error || '') + '); ') + esc(rec.safety.join(', ') || (okAny ? PF.L('hecho en local', 'done locally') : PF.L('nada que hacer', 'nothing to do'))) + '</span></div>', okAny ? '' : 'err');
    }
    O.log.push(rec); O.busy--; PF.emit('order:done', rec); PF.ui && PF.ui.orderDone(rec);
    PF.state.orders = (PF.state.orders || 0) + 1;
    return rec;
  }
  O.ask = ask; O.exec = (op) => exec(op, { thisEnt: thisOf(PF.player, PF.cam.yaw), added: new Set(), t0: PF.time }); O.prompt = PROMPT;

  /* ================= inventar: MAI-Code-2-Flash → Worker sin red → piezas declarativas ================= */
  const WORKER = "'use strict';\n"
    + "try{var NO=['fetch','XMLHttpRequest','WebSocket','importScripts','EventSource','indexedDB','caches','BroadcastChannel','Worker','SharedWorker','WebTransport','RTCPeerConnection','Request','navigator'];for(var o=self;o;o=Object.getPrototypeOf(o)){NO.forEach(function(k){try{if(Object.prototype.hasOwnProperty.call(o,k))Object.defineProperty(o,k,{value:undefined,writable:false,configurable:false});}catch(e){}});}NO.forEach(function(k){try{self[k]=undefined;}catch(e){}});}catch(e){}\n"
    + "var MAX=900,count=0,TOO_MANY=" + JSON.stringify(PF.L('demasiadas piezas', 'too many parts')) + ",NONE=" + JSON.stringify(PF.L('el código no creó ninguna pieza', 'the code created no parts')) + ";function n(v,d){v=+v;return isFinite(v)?v:d;}\n"
    + "function col(c){if(typeof c==='number')return '#'+('000000'+(c>>>0).toString(16)).slice(-6);c=String(c||'');if(/^#?[0-9a-f]{6}$/i.test(c))return c[0]==='#'?c:'#'+c;if(/^#[0-9a-f]{3}$/i.test(c))return '#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];return c.slice(0,20)||'#cccccc';}\n"
    + "function O(o){o=o||{};var r={};['rx','ry','rz','sx','sy','sz'].forEach(function(k){if(o[k]!=null)r[k]=n(o[k],k[0]==='s'?1:0);});if(o.emissive)r.e=col(o.emissive);if(o.opacity!=null)r.op=n(o.opacity,1);return r;}\n"
    + "var root={k:'g',tf:{},ch:[]},cur=root;function part(k,a,c,x,y,z,o){if(++count>MAX)throw new Error(TOO_MANY);cur.ch.push({k:k,a:a,c:col(c),t:[n(x,0),n(y,0),n(z,0)],o:O(o)});}\n"
    + "var s=1234567;function rand(){s=(s*1103515245+12345)&2147483647;return s/2147483647;}\n"
    + "var b={box:function(w,h,d,c,x,y,z,o){part('box',[n(w,1),n(h,1),n(d,1)],c,x,y,z,o);},sphere:function(r,c,x,y,z,o){part('sph',[n(r,0.5)],c,x,y,z,o);},cyl:function(rt,rb,h,c,x,y,z,o){part('cyl',[n(rt,0.5),n(rb,0.5),n(h,1)],c,x,y,z,o);},cone:function(r,h,c,x,y,z,o){part('cone',[n(r,0.5),n(h,1)],c,x,y,z,o);},torus:function(R,r,c,x,y,z,o){part('tor',[n(R,1),n(r,0.2)],c,x,y,z,o);},capsule:function(r,h,c,x,y,z,o){part('cap',[n(r,0.3),n(h,1)],c,x,y,z,o);},\n"
    + "group:function(tf,fn){if(typeof tf==='function'){fn=tf;tf={};}tf=tf||{};var g={k:'g',tf:{x:n(tf.x,0),y:n(tf.y,0),z:n(tf.z,0),rx:n(tf.rx,0),ry:n(tf.ry,0),rz:n(tf.rz,0),s:n(tf.scale,1)},ch:[]};if(++count>MAX)throw new Error(TOO_MANY);cur.ch.push(g);var p=cur;cur=g;try{if(typeof fn==='function')fn();}finally{cur=p;}return g;},rand:rand};\n"
    + "b.cube=b.box;b.ball=b.sphere;b.cylinder=b.cyl;b.ring=b.torus;\n"
    + "self.onmessage=function(e){try{var f=new Function('b','rand',e.data.code+'\\n;if(typeof build===\"function\"&&!arguments[2])build(b,rand);');f(b,rand,0);if(!count)throw new Error(NONE);self.postMessage({ok:true,root:root,count:count});}catch(err){self.postMessage({ok:false,err:String(err&&err.message||err)});}};";
  function runSandbox(code, ms) {
    return new Promise((res, rej) => {
      let url, w, to;
      const fin = (f, v) => { clearTimeout(to); try { w && w.terminate(); } catch (e) {} if (url) URL.revokeObjectURL(url); f(v); };
      try { url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })); w = new Worker(url); } catch (e) { return rej(new Error(PF.L('Este navegador no puede crear un Worker: el código del modelo no se ejecuta en la página', 'This browser can’t create a Worker: the model’s code never runs in the page'))); }
      to = setTimeout(() => fin(rej, new Error(PF.L('tiempo agotado', 'timed out'))), ms || 3000);
      w.onmessage = (e) => (e.data.ok ? fin(res, e.data) : fin(rej, new Error(e.data.err)));
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fin(rej, new Error((e && e.message) || PF.L('error de sintaxis', 'syntax error'))); };
      w.postMessage({ code });
    });
  }
  // piezas → una malla con color por vértice (y otra para lo que brilla)
  function realize(root) {
    const plain = [], glow = [], M = new T.Matrix4();
    const walk = (node, parent) => {
      for (const p of node.ch) {
        if (p.k === 'g') { const tf = p.tf || {}; const m = parent.clone().multiply(PF.mtx(tf.x, tf.y, tf.z, tf.rx, tf.ry, tf.rz, tf.s || 1)); walk(p, m); continue; }
        const a = p.a || [], o = p.o || {}; let geo;
        if (p.k === 'box') geo = PF.models.roundedBox(Math.abs(a[0]) || 0.1, Math.abs(a[1]) || 0.1, Math.abs(a[2]) || 0.1, Math.min(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])) * 0.12, 2);
        else if (p.k === 'sph') geo = new T.SphereGeometry(Math.abs(a[0]) || 0.1, 18, 12);
        else if (p.k === 'cyl') geo = new T.CylinderGeometry(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]) || 0.1, 16);
        else if (p.k === 'cone') geo = new T.ConeGeometry(Math.abs(a[0]) || 0.1, Math.abs(a[1]) || 0.1, 16);
        else if (p.k === 'tor') geo = new T.TorusGeometry(Math.abs(a[0]) || 0.3, Math.abs(a[1]) || 0.05, 10, 24);
        else if (p.k === 'cap') geo = PF.G.capsule(Math.abs(a[0]) || 0.2, Math.max(0.01, (Math.abs(a[1]) || 1) - 2 * (Math.abs(a[0]) || 0.2)), 14);
        if (!geo) continue;
        const m = parent.clone().multiply(PF.mtx(p.t[0], p.t[1], p.t[2], o.rx, o.ry, o.rz, o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy, o.sz == null ? 1 : o.sz));
        let c; try { c = PF.col(p.c); } catch (e) { c = PF.col('#cccccc'); }
        const lum = o.e ? (() => { const q = new T.Color(o.e); return 0.2126 * q.r + 0.7152 * q.g + 0.0722 * q.b; })() : 0;
        (o.e && lum > 0.3 ? glow : plain).push({ geo, m, c });
      }
    };
    walk(root, M.identity());
    const g = PF.grp();
    if (plain.length) { const mesh = new T.Mesh(PF.merge(plain), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
    if (glow.length) { const mesh = new T.Mesh(PF.merge(glow), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.55 })); mesh.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;'); }; g.add(mesh); }
    return g;
  }
  PF.KINDS.invented = {
    make(e, o) { e.label = o.label || PF.LABEL.invented; e.name = o.label; e.r = 1; e.h = 2; e.data.what = o.what; },
    update(e, dt) { if (e.data.bob && PF.time - e.data.bob > 3) e.root.rotation.y += dt * 0.25; }, // primero de frente; luego gira despacio para lucirse
  };
  const INVENT_PROMPT = (what, label, size) => 'Write JavaScript that builds a 3D toy-like model of: "' + what + '" (' + PF.L('Spanish name', 'name') + ': "' + label + '") for a colourful, family-friendly 3D platform game.\n'
    + 'It is about ' + size + ' m tall, stands on the ground (y = 0 is the ground) and faces +z (its front looks towards +z).\n'
    + 'Your code is the body of function build(b, rand). Use only these calls (sizes in metres, colours as "#rrggbb" strings in double quotes, and x, y, z are the CENTRE of each shape):\n'
    + '  b.box(w, h, d, color, x, y, z, opts)\n  b.sphere(r, color, x, y, z, opts)            // opts.sx, sy, sz stretch it\n  b.cyl(rTop, rBottom, h, color, x, y, z, opts)\n  b.cone(r, h, color, x, y, z, opts)\n  b.torus(R, tube, color, x, y, z, opts)\n  b.capsule(r, h, color, x, y, z, opts)          // h = total height\n'
    + '  b.group({ x, y, z, rx, ry, rz, scale }, () => { /* more calls, relative to the group */ })\n'
    + 'opts may hold rx, ry, rz (radians), sx, sy, sz, and emissive: "#rrggbb" only for parts that really give off light (a lamp, fire, glowing eyes), never to tint a colour. rand() returns a number in [0, 1).\n'
    + 'Make it charming and easy to read from far away: 20 to 80 parts, chunky rounded shapes, bold saturated bright colours (avoid very dark colours), and big friendly eyes if it is a creature.\n'
    + 'Reply with the code only: no markdown fences, no explanation, no function header.';
  const stripCode = (s) => { let c = String(s || '').replace(/^[\s\S]*?```(?:javascript|js)?\s*\n/i, (m) => (/```/.test(m) ? '' : m)).replace(/```[\s\S]*$/, ''); c = c.replace(/^\s*(?:export\s+)?function\s+build\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/, '$1'); return c.trim(); };
  async function makeInvention(job, ctx) {
    const P = PF.player, ref = resolve(job.ref, ctx), size = U.clamp(+job.size || 2.2, 0.6, 6);
    const at = ref && ref !== P ? around(ref, norm(job.rel || 'beside'), 1.6) : front(ctx, 4.5);
    const e = PF.spawn('invented', { at, label: job.label, what: job.what });
    e.root.rotation.y = Math.atan2(P.pos.x - at.x, P.pos.z - at.z); // el modelo mira a +Z: de cara al protagonista
    // marcador mientras escribe el código
    const ghost = new T.Mesh(new T.BoxGeometry(size * 0.6, size, size * 0.6), new T.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.12, wireframe: true })); ghost.position.y = size / 2; e.root.add(ghost);
    const sparkleT = setInterval(() => { if (e.alive) PF.fx.magic(e.pos.x, e.pos.y + 0.2, e.pos.z, 4, '#ffd84d'); }, 300);
    PF.say(e, PF.L('Escribiendo ', 'Writing ') + PF.quote(job.label) + '…', { voice: false, ms: 4000 });
    const t0 = performance.now(); let code = '', parts = null, lastErr = null;
    try {
      const r = await ask('plat-invent', INVENT_PROMPT(job.what, job.label, size), job.label + ': ' + job.what, { timeout: 120000 });
      code = stripCode(r.text);
      try { parts = await runSandbox(code, 3000); } catch (x) { lastErr = x; }
      if (!parts) {
        const fix = await ask('invent-fix', 'This code for build(b, rand) failed with the error: ' + String(lastErr && lastErr.message) + '\nFix it. Same rules as before: only b.box, b.sphere, b.cyl, b.cone, b.torus, b.capsule and b.group; reply with the code only.\n\n' + code, job.label + PF.L(': arreglar', ': fix'), { timeout: 90000 });
        code = stripCode(fix.text); parts = await runSandbox(code, 3000);
      }
    } catch (x) { lastErr = x; }
    clearInterval(sparkleT); e.root.remove(ghost);
    if (!parts || !e.alive) { PF.say(e, PF.L('No he podido construirlo', 'I couldn’t build it'), { voice: false }); PF.after(2, () => PF.kill(e, 'poof')); PF.emit('invent:done', { ok: false, label: job.label, error: lastErr && (lastErr.message || lastErr.code) }); return { ok: false, error: lastErr }; }
    const g = realize(parts.root); const box = new T.Box3().setFromObject(g), sz = box.getSize(V()); const k = size / Math.max(0.2, sz.y);
    g.scale.setScalar(k); const b2 = new T.Box3().setFromObject(g); g.position.y -= b2.min.y; e.root.add(g); e.h = size; e.r = Math.max(sz.x, sz.z) * k / 2;
    e.cols.push(PF.addCyl(e.pos.x, e.pos.z, Math.min(e.r, 1.6), e.pos.y, e.pos.y + size, 'invented', e));
    e.root.scale.setScalar(0.01); PF.tween(0.7, (q) => e.root.scale.setScalar(Math.max(0.01, U.outBack(q))));
    PF.fx.poof(e.pos.x, e.pos.y + size / 2, e.pos.z, '#fff3a8', 30); PF.sfx.play('sparkle'); e.data.bob = PF.time || 0.001;
    const rec = { ok: true, label: job.label, parts: parts.count, ms: Math.round(performance.now() - t0), ent: e.id };
    PF.emit('invent:done', rec);
    PF.after(0.9, () => qa(e, job, rec));
    return rec;
  }
  // control visual: una captura del invento y Decision-1.1 dice si se parece a lo pedido
  async function qa(e, job, rec) {
    if (!e.alive) return;
    const W = 640, H = 400, cam = new T.PerspectiveCamera(40, W / H, 0.1, 200);
    const c = V(e.pos.x, e.pos.y + e.h * 0.5, e.pos.z), d = Math.max(e.h, e.r * 2) * 1.9 + 1;
    cam.position.set(c.x - Math.sin(PF.cam.yaw) * d * 0.9 + 1.2, c.y + d * 0.35, c.z - Math.cos(PF.cam.yaw) * d * 0.9); cam.lookAt(c);
    // la captura se pinta en una esquina del propio lienzo y se lee al momento: con un WebGLRenderTarget three.js
    // compilaría otra variante de cada shader de la escena (un tirón de segundos); así se ve igual que en pantalla
    const r = PF.renderer, gl = r.getContext(), pr = r.getPixelRatio(), size = r.getSize(new T.Vector2()), px = new Uint8Array(W * H * 4);
    r.setScissorTest(true); r.setScissor(0, 0, W / pr, H / pr); r.setViewport(0, 0, W / pr, H / pr);
    r.render(PF.scene, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y); r.render(PF.scene, PF.camera);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0); const url = cv.toDataURL('image/jpeg', 0.85);
    try {
      const t0 = performance.now();
      const res = await fetch('/api/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'A player of a 3D platform game asked for a new thing: "' + job.label + '" (' + job.what + '). This is a close-up of what was built: [shot]', questions: { looks_right: { type: 'noul', instructions: 'Does the picture show a 3D model that looks like what the player asked for?' } }, assets: { '[shot]': { type: 'image', format: 'jpeg', data_base64: url.split(',')[1] } } }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json(); const p = j.answers.looks_right.noul; rec.qa = p;
      const H2 = HUD(); if (H2) H2.note(PF.L('Control visual', 'Visual check'), PF.quote(job.label), '<div class="row"><span class="chip decision">Decision-1.1</span><span>' + (p >= 0.5 ? PF.L('✓ se parece', '✓ looks right') : PF.L('✗ no se parece', '✗ doesn’t look right')) + ' · ' + Math.round(p * 100) + ' % · ' + fmt(j.ms || performance.now() - t0) + '</span></div><div class="bar"><i style="width:' + Math.round(p * 100) + '%;background:' + (p >= 0.5 ? 'var(--jade)' : 'var(--rec)') + '"></i></div><img class="shot" alt="' + PF.L('Lo que vio Decision-1.1', 'What Decision-1.1 saw') + '" src="' + url + '">', p >= 0.5 ? '' : 'err');
      PF.emit('invent:qa', { label: job.label, p });
    } catch (x) { console.warn('QA:', x); }
  }
  PF.inventor = { make: (job, ctx) => makeInvention(job, ctx), sandbox: runSandbox, realize, stripCode };
})();
