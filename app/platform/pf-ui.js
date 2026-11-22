/* Plataformas 3D · interfaz: portada (con el selector de idioma), barra de órdenes (texto, T pulsar para hablar, V escucha
   continua), frase dicha y respuesta, registro, pistas, bocadillos con voz (MAI-Voice-2.1-Flash), vidas y gemas, ayuda,
   panel del router de Plató (tecla I) y sonido. */
'use strict';
(function () {
  const PF = window.PF, T = THREE, U = PF.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (ms) => (ms == null ? '' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
  const pct = (p) => (p == null ? '' : Math.round(p * 100) + ' %');
  const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const HUD = () => (window.PLATO && window.PLATO.HUD) || null;
  const UI = (PF.ui = {});

  // el guion de la demo, en el orden del nivel (también lo usan la ayuda y las pruebas)
  const SCRIPT = UI.SCRIPT = PF.L([
    ['elimina a este enemigo', 'el Gruñón corta el paso de piedra'],
    ['pon una escalera', 'el muro es demasiado alto'],
    ['pon un charco bajo el enemigo', 'Refunfuño vigila el cañón'],
    ['pon un tiburón en el charco', ''],
    ['haz que el tiburón se coma al enemigo', ''],
    ['pon un puente de madera que atraviese el charco de forma segura', 'el tiburón muerde'],
    ['añade 5 compañeros npc que me ayuden', 'antes de la arena'],
    ['que llueva', 'apaga el fuego del jefe'],
    ['haz que el jefe final lance flores en lugar de bolas de fuego', ''],
    ['ponle un tutú al jefe final', 'se le pasa el enfado y abre el rastrillo'],
    ['hazlo real', 'MAI-Image-2.7 y MiniMax H3 Max (fal en Foundry) convierten la escena en vídeo'],
    ['pon a la princesa junto al personaje del jugador', 'sin ella no se entra en la meta'],
    ['pon el logo de Foundry y Microsoft', 'para cerrar el vídeo'],
  ], [
    ['remove this enemy', 'Grumble blocks the stone pass'],
    ['put a ladder', 'the wall is too high'],
    ['put a puddle under the enemy', 'Grouch guards the canyon'],
    ['put a shark in the puddle', ''],
    ['make the shark eat the enemy', ''],
    ['put a wooden bridge across the puddle', 'the shark bites'],
    ['add 5 companion NPCs to help me', 'before the arena'],
    ['make it rain', 'puts out the boss’s fire'],
    ['make the final boss throw flowers instead of fireballs', ''],
    ['put a tutu on the final boss', 'he cheers up and opens the gate'],
    ['make it real', 'MAI-Image-2.7 and MiniMax H3 Max (fal in Foundry) turn the scene into video'],
    ['put the princess next to the player character', 'the goal only opens with her'],
    ['show the Foundry and Microsoft logos', 'to close the video'],
  ]);
  // las frases de las sugerencias, por idioma
  const S = UI.PHRASES = PF.L({
    remove: 'elimina a este enemigo', ladder: 'pon una escalera', puddle: 'pon un charco bajo el enemigo', shark: 'pon un tiburón en el charco', eat: 'haz que el tiburón se coma al enemigo',
    bridge: 'pon un puente de madera que atraviese el charco de forma segura', allies: 'añade 5 compañeros npc que me ayuden', rain: 'que llueva', flowers: 'haz que el jefe final lance flores en lugar de bolas de fuego',
    tutu: 'ponle un tutú al jefe final', princess: 'pon a la princesa junto al personaje del jugador', logos: 'pon el logo de Foundry y Microsoft', copilot: 'pon el logo de GitHub Copilot',
    sun: 'que salga el sol', sunset: 'atardecer', snow: 'que nieve', night: 'que se haga de noche', real: 'hazlo real',
  }, {
    remove: 'remove this enemy', ladder: 'put a ladder', puddle: 'put a puddle under the enemy', shark: 'put a shark in the puddle', eat: 'make the shark eat the enemy',
    bridge: 'put a wooden bridge across the puddle', allies: 'add 5 companion NPCs to help me', rain: 'make it rain', flowers: 'make the final boss throw flowers instead of fireballs',
    tutu: 'put a tutu on the final boss', princess: 'put the princess next to the player character', logos: 'show the Foundry and Microsoft logos', copilot: 'show the GitHub Copilot logo',
    sun: 'make the sun come out', sunset: 'sunset', snow: 'make it snow', night: 'make it night', real: 'make it real',
  });

  /* ================= avisos, frase y respuesta ================= */
  UI.toast = PF.toast = (msg, ms) => {
    const box = $('toasts'); if (!box) return;
    const el = document.createElement('div'); el.className = 'toast glass'; el.textContent = msg; box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, ms || 3800);
  };
  let spellT = 0, replyT = 0;
  function spell(text, partial) {
    const el = $('spellText'); if (!el) return; clearTimeout(spellT);
    el.textContent = text ? (partial ? text : PF.quote(text)) : ''; el.className = text ? 'on' + (partial ? ' partial' : '') : '';
    if (text && !partial) spellT = setTimeout(() => { el.className = ''; }, 6500);
  }
  function reply(text) { const el = $('reply'); if (!el) return; clearTimeout(replyT); el.textContent = text || ''; el.className = text ? 'on' : ''; if (text) replyT = setTimeout(() => { el.className = ''; }, 6000); }

  /* ================= registro de órdenes ================= */
  const entries = new Map();
  UI.orderStart = (rec) => {
    spell(rec.text, false); reply('');
    const log = $('log'); if (!log) return;
    const el = document.createElement('div'); el.className = 'entry glass run';
    el.innerHTML = '<span class="st">…</span><div><div class="q"></div><div class="a">' + (rec.via === 'voz' ? PF.L('voz · ', 'voice · ') : '') + PF.L('Decision-1.1 enruta…', 'Decision-1.1 is routing…') + '</div></div><span class="ms"></span>';
    el.querySelector('.q').textContent = rec.text; log.appendChild(el); entries.set(rec, el);
    while (log.children.length > 4) log.firstElementChild.remove();
  };
  UI.orderDone = (rec) => {
    reply(rec.said || '');
    const el = entries.get(rec); if (!el) return; entries.delete(rec);
    el.classList.remove('run'); el.classList.add(rec.ok ? 'ok' : 'fail');
    el.querySelector('.st').textContent = rec.ok ? '✓' : '✗';
    const tm = (m) => (window.PLATO && window.PLATO.tm ? window.PLATO.tm(m) : m);
    const who = rec.source === 'router' ? tm(rec.model || 'router') : rec.source === 'router+local' ? tm(rec.model || 'router') + PF.L(' + red local', ' + local net') : rec.source === 'local' ? PF.L('red de seguridad local', 'local safety net') : PF.L('sin cambios', 'no changes');
    el.querySelector('.a').textContent = (rec.said || '') + ' · ' + who;
    el.querySelector('.ms').textContent = fmt(rec.ms);
    setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 700); }, 14000);
  };
  function submit(text, via) {
    text = String(text || '').trim(); if (!text) return null;
    if (!PF.state.started) start();
    return PF.orders.submit(text, { via });
  }
  UI.submit = submit;

  /* ================= bocadillos y voces ================= */
  const bubs = [];
  let voiceOn = true;
  try { voiceOn = localStorage.getItem('plato.pf.voice') !== 'off'; } catch (e) {}
  PF.say = (e, text, opt) => {
    opt = opt || {}; if (!e || !text) return;
    const box = $('bubbles'); if (!box) return;
    for (const b of bubs) if (b.e === e) b.dead = true;
    const w = document.createElement('div'); w.className = 'bubw';
    const el = document.createElement('div'); el.className = 'bub' + (e.type === 'boss' ? ' boss' : '');
    el.innerHTML = '<b>' + esc(e === PF.player ? PF.NAME : e.name || e.label || '') + '</b>' + esc(text);
    w.appendChild(el); box.appendChild(w);
    bubs.push({ e, el: w, until: performance.now() + (opt.ms || U.clamp(text.length * 75, 2600, 6500)) });
    if (opt.voice && e.voice) speak(e, text);
    PF.emit('say', { e, text });
  };
  const pv = new T.Vector3();
  function updateBubbles() {
    const now = performance.now(), cam = PF.camera, w = innerWidth, h = innerHeight;
    for (let i = bubs.length - 1; i >= 0; i--) {
      const b = bubs[i], e = b.e;
      if (b.dead || now > b.until || e.alive === false) { b.el.remove(); bubs.splice(i, 1); continue; }
      const hh = e.h || (e.ch && e.ch.height) || 1.6;
      pv.set(e.pos.x, e.pos.y + hh * (e.type === 'boss' ? 1.02 : 1) + 0.35, e.pos.z).project(cam);
      if (pv.z > 1 || pv.x < -1.15 || pv.x > 1.15 || pv.y < -1.1 || pv.y > 1.25) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = 'translate(' + Math.round((pv.x * 0.5 + 0.5) * w) + 'px,' + Math.round((-pv.y * 0.5 + 0.5) * h) + 'px) translate(-50%,-100%)';
    }
  }
  // MAI-Voice-2.1-Flash a través del servidor (el token no llega a la página); Decision-1.1 elige la emoción
  const tts = { cur: null, seq: 0 };
  function stopVoice() { tts.seq++; if (tts.cur) { try { tts.cur.pause(); } catch (e) {} try { URL.revokeObjectURL(tts.cur.src); } catch (e) {} tts.cur = null; } }
  async function speak(e, text) {
    if (!voiceOn || !PF.sfx.on()) return;
    const my = ++tts.seq; if (tts.cur) { try { tts.cur.pause(); } catch (x) {} tts.cur = null; }
    const npc = Object.assign({ id: e.id, name: e.name || e.label }, e.voice || {});
    const t0 = performance.now();
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, npc, lang: PF.lang }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      let dec = {}; try { dec = JSON.parse(decodeURIComponent(r.headers.get('x-plato-decision') || '%7B%7D')); } catch (x) {}
      const voice = (r.headers.get('x-plato-voice') || '').replace(':MAI-Voice-2.1-Flash', ''), style = r.headers.get('x-plato-style');
      const H = HUD(); if (H) H.note(PF.L('Voz', 'Voice'), (npc.name ? npc.name + ': ' : '') + text, '<div class="row"><span class="chip decision">Decision-1.1</span><span>' + esc(dec.emotion || '—') + (dec.probability != null ? ' · ' + pct(dec.probability) : '') + (dec.ms != null ? ' · ' + fmt(dec.ms) : '') + '</span></div><div class="row" style="margin-top:5px"><span>→</span><span class="chip media">MAI-Voice-2.1-Flash</span><span>' + esc(voice) + (style && style !== 'none' ? ' · ' + esc(style) : '') + ' · ' + fmt(performance.now() - t0) + '</span></div>');
      PF.state.voices = (PF.state.voices || 0) + 1; PF.emit('voice', { who: npc.name, voice, style, lang: r.headers.get('x-plato-lang'), text, ms: Math.round(performance.now() - t0) });
      if (my !== tts.seq || !voiceOn || !PF.sfx.on()) return;
      const a = new Audio(URL.createObjectURL(blob)); tts.cur = a; a.onended = () => { if (tts.cur === a) { URL.revokeObjectURL(a.src); tts.cur = null; } };
      await a.play().catch(() => {});
    } catch (x) { console.warn('Voz:', x && x.message ? x.message : x); }
  }
  UI.speak = speak;

  /* ================= voz del jugador: MAI-Transcribe-2-Streaming (plato.js) ================= */
  let dict = null, ptt = false, pttStopping = false, pttBuf = '', live = false;
  function micState(cls) { const m = $('mic'); if (m) m.className = cls || ''; }
  async function pttStart() {
    if (!dict) { PF.toast(PF.L('El micrófono no está disponible: escribe la orden con Enter', 'The microphone isn’t available: type the order and press Enter')); return; }
    if (ptt || live) return;
    ptt = true; pttBuf = ''; micState('wait'); spell(PF.L('Escuchando…', 'Listening…'), true);
    try { await dict.start(); if (ptt) micState('on'); } catch (e) { ptt = false; micState(''); spell(''); PF.toast(PF.L('Micrófono: ', 'Microphone: ') + ((e && e.message) || PF.L('no disponible', 'unavailable'))); }
  }
  async function pttStop() {
    if (!ptt) return; ptt = false; pttStopping = true; micState('wait');
    try { await dict.stop(); } catch (e) {}
    pttStopping = false; micState('');
    const t = pttBuf.trim(); pttBuf = '';
    if (t) submit(t, 'voz'); else spell('');
  }
  async function toggleLive(force) {
    if (!dict) { PF.toast(PF.L('El micrófono no está disponible', 'The microphone isn’t available')); return; }
    live = force != null ? force : !live; const b = $('live'); if (b) b.setAttribute('aria-pressed', String(live));
    if (live) { try { await dict.start(); micState('on'); PF.toast(PF.L('Escucha continua: cada frase se ejecuta al terminarla', 'Continuous listening: each sentence runs when you finish it')); } catch (e) { live = false; if (b) b.setAttribute('aria-pressed', 'false'); micState(''); PF.toast(PF.L('Micrófono: ', 'Microphone: ') + ((e && e.message) || PF.L('no disponible', 'unavailable'))); } }
    else { try { await dict.stop(); } catch (e) {} micState(''); spell(''); }
  }
  function hookVoice(d) {
    dict = d; if (!d) { const m = $('mic'); if (m) m.disabled = true; const l = $('live'); if (l) l.disabled = true; return; }
    d.onPartial(({ text }) => { if (text) spell(text, true); });
    d.onFinal(({ text }) => { if (ptt || pttStopping) pttBuf += text; else if (live) submit(text, 'voz'); });
    d.onState(({ state, reason }) => { if (state === 'idle' && reason === 'error') { micState(''); if (live) { live = false; const b = $('live'); if (b) b.setAttribute('aria-pressed', 'false'); } } });
  }

  /* ================= pistas y sugerencias según el tramo ================= */
  function suggestions() {
    const P = PF.player, z = P.pos.z, out = [];
    if (PF.state.won) return [S.logos, S.copilot, S.night];
    const e1 = PF.get('enemy1'), e2 = PF.get('enemy2'), boss = PF.get('boss'), pr = PF.get('princess'), wall = PF.all('wall')[0];
    const alive = (e) => e && e.state !== 'doomed';
    const shark = PF.all('puddle').find((p) => p.shark && p.shark.alive && p.pos.z > z - 2 && p.pos.z - z < 30 && !PF.all('bridge').some((b) => Math.abs(b.pos.z - p.pos.z) < 3));
    if (alive(e1) && z < e1.pos.z + 1) out.push(S.remove);
    else if (wall && z < wall.z0 + 0.5 && P.pos.y < 3) out.push(S.ladder);
    else if (alive(e2) && z < e2.pos.z + 2) {
      const pud = PF.all('puddle').find((p) => p.contains(e2.pos.x, e2.pos.z));
      out.push(!pud ? S.puddle : !(pud.shark && pud.shark.alive) ? S.shark : S.eat);
      out.push(S.remove);
    } else if (shark) out.push(S.bridge);
    else if (boss && boss.mood !== 'happy' && z > 138) {
      if (PF.fire && PF.fire.count() > 0) out.push(S.rain);
      if (boss.projectile === 'fireballs') out.push(S.flowers);
      if (!(boss.wearing && boss.wearing.tutu)) out.push(S.tutu);
    } else if (boss && boss.mood === 'happy' && z > 138 && z < 206 && PF.real && PF.real.idle()) out.push(S.real); // el jefe baila con su tutú: el mejor plano para «hacerlo real»
    if (pr && pr.state === 'caged' && (z > 140 || out.length < 2)) out.push(S.princess);
    if (!PF.all('companion').length && z > 90) out.push(S.allies);
    for (const w of [S.rain, S.sun, S.sunset, S.snow, S.night]) { if (out.length >= 4) break; if (!out.includes(w) && !(w === S.sun && PF.env.weather === 'clear' && PF.env.target > 8 && PF.env.target < 18)) out.push(w); }
    return out.slice(0, 4);
  }
  UI.suggestions = suggestions;
  let chipKey = '', tipKey = '', tipT = 0;
  function updateChips() {
    const list = suggestions(), key = list.join('|'); if (key === chipKey) return; chipKey = key;
    const box = $('chips'); if (!box) return; box.innerHTML = '';
    for (const s of list) { const b = document.createElement('button'); b.type = 'button'; b.textContent = PF.quote(s); b.onclick = () => { submit(s, 'texto'); $('stage').focus(); }; box.appendChild(b); }
  }
  function updateTip() {
    const el = $('tip'); if (!el) return;
    const P = PF.player, z = P.pos.z, first = suggestions()[0];
    const near = (e) => e && e.alive && e.state !== 'doomed' && e.pos.z - z < 13 && e.pos.z - z > -1;
    const wall = PF.all('wall')[0], blocked = near(PF.get('enemy1')) || near(PF.get('enemy2')) || (wall && wall.z0 - z < 10 && wall.z0 - z > -1 && P.pos.y < 3) || (PF.get('boss') && PF.get('boss').mood !== 'happy' && z > 156 && z < 204);
    const key = blocked && !PF.orders.busy && PF.state.started && !PF.state.cine ? first : '';
    if (key !== tipKey) { tipKey = key; tipT = PF.time; el.className = 'glass'; if (key) { el.innerHTML = PF.L('Prueba a decir ', 'Try saying ') + '<q>' + esc(key) + '</q>'; setTimeout(() => { if (tipKey === key) el.className = 'glass on'; }, 600); } }
  }

  /* ================= vidas, gemas y tramo ================= */
  let lastHearts = -1, lastGems = -1, lastSec = '';
  function updateStats() {
    const P = PF.player;
    if (P.hearts !== lastHearts) {
      const h = $('hearts'); if (h) { h.innerHTML = ''; for (let i = 0; i < P.maxHearts; i++) { const it = document.createElement('i'); if (i >= P.hearts) it.className = 'off'; h.appendChild(it); } if (lastHearts > P.hearts) { h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit'); } h.setAttribute('aria-label', PF.L('Vidas: ', 'Lives: ') + P.hearts); }
      lastHearts = P.hearts;
    }
    if (P.gems !== lastGems) { const g = document.querySelector('#gems span'); if (g) g.textContent = String(P.gems); lastGems = P.gems; }
    const s = PF.world.sectionAt(P.pos.z), key = s.n + s.name;
    if (key !== lastSec) { lastSec = key; const el = $('section'); if (el) el.innerHTML = '<b>' + s.n + '/6</b> · ' + esc(s.name); }
  }

  /* ================= sonido, ayuda, panel ================= */
  function paintSound() { const b = $('bSound'); if (b) b.setAttribute('aria-pressed', String(PF.sfx.on())); }
  function toggleSound() { const on = PF.sfx.toggle(); if (!on) stopVoice(); paintSound(); PF.toast(on ? PF.L('Sonido y voces activados', 'Sound and voices on') : PF.L('Sonido y voces en silencio', 'Sound and voices muted')); }
  function toggleHelp(force) { const h = $('help'); if (!h) return; const on = force != null ? force : !h.classList.contains('on'); h.classList.toggle('on', on); const b = $('bHelp'); if (b) b.setAttribute('aria-pressed', String(on)); }
  function toggleHud() { const H = HUD(); if (!H) return; H.toggle(); const el = $('platoHud'), b = $('bHud'); if (b && el) b.setAttribute('aria-pressed', String(!el.classList.contains('off'))); }
  async function pollStatus() {
    const H = HUD(); if (!H) return;
    try { const s = await (await fetch('/api/status')).json(); H.status(s); PF.state.status = s; if (!s.copilot || (!s.copilot.ready && !s.copilot.error)) setTimeout(pollStatus, 3000); }
    catch (e) { H.status({ error: e.message }); setTimeout(pollStatus, 5000); }
  }

  /* ================= portada ================= */
  function start() {
    if (PF.state.started) return;
    PF.state.started = true; PF.sfx.unlock();
    document.body.classList.remove('title');
    const t = $('title'); if (t) { t.classList.add('out'); setTimeout(() => t.classList.add('off'), 900); }
    PF.input.pressed.clear(); PF.input.keys.clear();
    PF.cam.override = null; PF.cam.snap();
    const cv = $('stage'); if (cv) cv.focus();
    PF.emit('start', {});
    setTimeout(() => PF.toast(PF.L('W A S D para moverte · mantén T para hablar · Enter para escribir', 'W A S D to move · hold T to talk · Enter to type')), 900);
  }
  UI.start = start;

  /* ================= montaje ================= */
  UI.init = () => {
    document.querySelectorAll('[data-hero]').forEach((el) => { el.textContent = PF.NAME; });
    const sc = $('script'); if (sc) sc.innerHTML = SCRIPT.map(([q, why]) => '<li><q>' + esc(q) + '</q>' + (why ? ' <span style="color:var(--paper-dim)">— ' + esc(why) + '</span>' : '') + '</li>').join('');
    // idioma: «EN · ES» en la portada (recarga la página con ?lang=…; se recuerda en localStorage «pf.lang»)
    document.querySelectorAll('#langSel button[data-lang]').forEach((b) => {
      const l = b.getAttribute('data-lang'); b.setAttribute('aria-pressed', String(l === PF.lang));
      b.onclick = (e) => { e.stopPropagation(); if (l === PF.lang) return; try { localStorage.setItem('pf.lang', l); } catch (x) {} const u = new URL(location.href); u.searchParams.set('lang', l); location.replace(u.toString()); };
    });
    const ls = $('langSel'); if (ls) ls.addEventListener('keydown', (e) => e.stopPropagation());
    // «Hacerlo real»
    const br = $('bReal'); if (br) br.onclick = (e) => { e.stopPropagation(); if (PF.real) PF.real.button(); };
    const go = $('go'); if (go) go.onclick = (e) => { e.stopPropagation(); start(); };
    // barra de órdenes
    const cmd = $('cmd');
    if (cmd) cmd.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const t = cmd.value.trim(); cmd.value = ''; cmd.blur(); if (t) submit(t, 'texto'); const cv = $('stage'); if (cv) cv.focus(); }
      else if (e.key === 'Escape') { cmd.blur(); const cv = $('stage'); if (cv) cv.focus(); }
    });
    const mic = $('mic');
    if (mic) { mic.addEventListener('pointerdown', (e) => { e.preventDefault(); pttStart(); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) mic.addEventListener(ev, () => pttStop()); }
    const lv = $('live'); if (lv) lv.onclick = () => toggleLive();
    const bs = $('bSound'); if (bs) bs.onclick = toggleSound; paintSound();
    const bh = $('bHelp'); if (bh) bh.onclick = () => toggleHelp();
    const bu = $('bHud'); if (bu) bu.onclick = toggleHud;
    const el = $('platoHud'); if (bu && el) bu.setAttribute('aria-pressed', String(!el.classList.contains('off')));
    // teclado
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (!PF.state.started) { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
      switch (e.code) {
        case 'KeyT': e.preventDefault(); if (!e.repeat) pttStart(); break;
        case 'KeyV': if (!e.repeat) toggleLive(); break;
        case 'Enter': case 'NumpadEnter': case 'Slash': e.preventDefault(); if (cmd) cmd.focus(); break;
        case 'KeyH': toggleHelp(); break;
        case 'KeyI': toggleHud(); break;
        case 'KeyM': toggleSound(); break;
        case 'KeyR': if (!PF.state.won) PF.respawn(false); break;
        case 'Escape': toggleHelp(false); if (PF.real && PF.real.isOpen()) PF.real.close(); else if (PF.state.cine && PF.finale) PF.finale.exit(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyT') pttStop(); });
    window.addEventListener('blur', () => { if (ptt) pttStop(); });
    Promise.resolve(window.PLATO && window.PLATO.voice).then(hookVoice, () => hookVoice(null));
    const H = HUD(); if (H) H.mount();
    pollStatus();
    // eventos del juego
    PF.on('checkpoint', () => PF.sfx.play('ding'));
    PF.on('respawn', () => { lastHearts = -1; });
    PF.on('climbed', () => PF.say(PF.player, PF.L('¡Arriba!', 'Up we go!'), { voice: false }));
    PF.on('win', (d) => { const w = $('win'), t = $('winText'); if (t) t.textContent = PF.L('Con la princesa Lúa · ' + d.orders + ' órdenes · ', 'With Princess Lúa · ' + d.orders + (d.orders === 1 ? ' order · ' : ' orders · ')) + d.secs + ' s'; if (w) { w.classList.add('on'); setTimeout(() => w.classList.remove('on'), 7000); } });
  };
  UI.update = () => {
    updateBubbles(); updateStats();
    if (PF.state.started) { updateChips(); updateTip(); }
  };
  UI.loading = (text) => { const el = $('loading'); if (el) el.textContent = text; };
  UI.toggleLive = toggleLive; UI.pttStart = pttStart; UI.pttStop = pttStop;
})();
