/* Plató · el host de la página del juego («Plataformas 3D»).
   El juego (app/platform) pide aquí lo que necesita del servidor local (server/server.mjs), que usa tus sesiones de
   Azure y de GitHub:
     voz    → /api/stt (WebSocket): MAI-Transcribe-2-Streaming, para pulsar y hablar (T) y la escucha continua (V)
     vídeo  → /api/real: MAI-Image-2.7 + MiniMax H3 Max (o LTX-2.5 Fast) de fal en Foundry, para «Hacerlo real»
   Además dibuja el panel del router (tecla I), donde se ve qué decidió Microsoft-Decision-1.1 y qué modelo respondió,
   y el panel de código en vivo de MAI-Code-2-Flash. Las órdenes (/api/ai) y las voces (/api/tts) las pide el juego. */
'use strict';
(function () {
  /* ---------- idioma: español por defecto; inglés con ?lang=en (window.PLATO_LANG, lo fija app/index.html) ---------- */
  const LANG = window.PLATO_LANG === 'en' ? 'en' : 'es';
  const L = (es, en) => (LANG === 'en' ? en : es);
  // los detalles de modelo y las etapas llegan del servidor en español
  const tm = (s) => (LANG !== 'en' ? s : String(s == null ? '' : s).replace(/sin razonamiento/g, 'no reasoning').replace(/razonamiento bajo/g, 'low reasoning').replace(/razonamiento medio/g, 'medium reasoning').replace(/alternativa/g, 'fallback').replace(/fal en Foundry/g, 'fal in Foundry'));
  const STAGE_EN = { prep: 'Preparing the take…', image: 'MAI-Image-2.7 paints the real first frame…', submit: 'Sending to fal in Foundry…', queue: 'Queued in fal…', render: 'Generating the video…', download: 'Downloading the result…', done: 'Done' };
  const stageLabel = (s) => (LANG === 'en' ? STAGE_EN[s.stage] || tm(s.label) : s.label);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (ms) => (ms == null ? '' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
  const pct = (p) => (p == null ? '' : Math.round(p * 100) + ' %');

  /* ================= panel del router ================= */
  const TASK = L({ dictation: 'Dictado', video: 'Hacerlo real' }, { dictation: 'Dictation', video: 'Make it real' });
  const PROVIDER = { foundry: 'Foundry', copilot: 'GitHub Copilot' };
  const CSS = `
#platoHud{position:fixed;top:64px;right:14px;z-index:6;width:min(360px,32vw);max-height:calc(100vh - 210px);display:flex;flex-direction:column;border-radius:12px;background:var(--ink-glass,rgba(10,13,18,.76));backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);border:1px solid var(--line,rgba(242,244,247,.14));color:var(--paper,#f2f4f7);font:400 12.5px/1.35 var(--f-ui,system-ui);box-shadow:0 10px 40px rgba(0,0,0,.35);transition:opacity .2s,transform .2s}
#platoHud.off{opacity:0;transform:translateX(12px);pointer-events:none}
#platoHud header{display:flex;align-items:baseline;gap:8px;padding:10px 12px 6px}
#platoHud header b{font:600 13px/1 var(--f-display,system-ui);letter-spacing:.14em;text-transform:uppercase}
#platoHud header span{color:var(--paper-dim,#aab);font:400 11px/1 var(--f-mono,monospace)}
#platoHud .conn{display:flex;flex-wrap:wrap;gap:4px 12px;padding:0 12px 8px;color:var(--paper-dim,#aab);font:400 10.5px/1.3 var(--f-mono,monospace);border-bottom:1px solid var(--line,rgba(242,244,247,.14))}
#platoHud .dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#777;vertical-align:1px}
#platoHud .dot.ok{background:var(--jade,#7fe3b0)} #platoHud .dot.bad{background:var(--rec,#ff4b3a)} #platoHud .dot.wait{background:var(--voice,#ffd84d)}
#platoHud ol{list-style:none;margin:0;padding:6px 8px 8px;overflow:auto;display:flex;flex-direction:column;gap:6px}
#platoHud li{padding:7px 8px 8px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05);transition:border-color .3s}
#platoHud li.run{border-color:rgba(255,216,77,.35)} #platoHud li.err{border-color:rgba(255,75,58,.45)}
#platoHud .t{display:flex;justify-content:space-between;gap:8px;color:var(--paper-dim,#aab);font:500 10px/1.2 var(--f-mono,monospace);text-transform:uppercase;letter-spacing:.08em}
#platoHud .said{margin:3px 0 5px;font-size:12.5px;color:var(--paper,#f2f4f7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#platoHud .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:400 11px/1.3 var(--f-mono,monospace);color:var(--paper-dim,#aab)}
#platoHud .chip{padding:2px 7px;border-radius:99px;font:500 10.5px/1.4 var(--f-mono,monospace);color:#0a0d12;white-space:nowrap}
#platoHud .chip.decision,#platoCode .chip.decision{background:var(--jade,#7fe3b0)} #platoHud .chip.foundry,#platoCode .chip.foundry{background:#8cc4ff} #platoHud .chip.copilot,#platoCode .chip.copilot{background:#c9a8ff} #platoHud .chip.media{background:#ffc98a}
#platoHud .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:6px;overflow:hidden} #platoHud .bar i{display:block;height:100%;background:var(--jade,#7fe3b0)}
#platoHud .shot{display:block;width:100%;border-radius:6px;margin-top:6px}
#platoHud footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:7px 12px 9px;border-top:1px solid var(--line,rgba(242,244,247,.14));color:var(--paper-dim,#aab);font:400 10.5px/1.3 var(--f-mono,monospace)}
#platoHud select{all:unset;cursor:pointer;color:var(--paper,#f2f4f7);border-bottom:1px dotted var(--paper-dim,#aab)}
#platoHud select:focus-visible{outline:2px solid var(--jade,#7fe3b0);outline-offset:2px}
#platoHud kbd,#platoCode kbd{font:500 10px/1 var(--f-mono,monospace);padding:1px 4px;border:1px solid var(--line,rgba(242,244,247,.25));border-radius:4px}
#platoCode{position:fixed;left:14px;top:64px;z-index:6;width:min(520px,38vw);max-height:min(56vh,560px);display:flex;flex-direction:column;border-radius:12px;background:rgba(6,8,12,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--line,rgba(242,244,247,.14));color:#dfe6ee;box-shadow:0 10px 40px rgba(0,0,0,.4);opacity:0;transform:translateX(-12px);pointer-events:none;transition:opacity .25s,transform .25s}
#platoCode.on{opacity:1;transform:none}
#platoCode header{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line,rgba(242,244,247,.14));font:500 12px/1.2 var(--f-ui,system-ui)}
#platoCode header b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#platoCode header span.stat{font:400 10.5px/1 var(--f-mono,monospace);color:var(--paper-dim,#aab)}
#platoCode pre{margin:0;padding:10px 12px 12px;overflow:hidden;font:400 11.5px/1.45 var(--f-mono,monospace);white-space:pre-wrap;word-break:break-all;mask-image:linear-gradient(to bottom,transparent 0,#000 28px)}
#platoCode .k{color:#c9a8ff} #platoCode .n{color:#ffc98a} #platoCode .s{color:#7fe3b0} #platoCode .c{color:#6b7787} #platoCode .f{color:#8cc4ff}
#platoCode .cursor{display:inline-block;width:7px;height:13px;background:var(--voice,#ffd84d);vertical-align:-2px;animation:pcBlink 1s steps(1) infinite} @keyframes pcBlink{50%{opacity:0}}
#platoCode.done header{color:var(--jade,#7fe3b0)} #platoCode.fail header{color:var(--rec,#ff4b3a)}
body.clean #platoHud,body.clean #platoCode,body.title #platoHud,body.title #platoCode{display:none}
`;

  const HUD = (() => {
    let root = null, list = null, conn = null, vidSel = null, hidden = false;
    const items = new Map();
    function mount() {
      if (root || !document.body) return;
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      root = document.createElement('aside'); root.id = 'platoHud'; root.setAttribute('aria-label', L('Router de modelos', 'Model router'));
      root.innerHTML = '<header><b>Router</b><span>' + L('Microsoft-Decision-1.1 decide cada paso', 'Microsoft-Decision-1.1 routes each step') + '</span></header><div class="conn"><span><i class="dot wait"></i>' + L('Conectando…', 'Connecting…') + '</span></div><ol></ol><footer><span>' + L('Vídeo:', 'Video:') + '</span><select aria-label="' + L('Modelo de vídeo', 'Video model') + '"><option value="reference">MiniMax H3 Max</option><option value="draft">LTX-2.5 Fast · ' + L('borrador', 'draft') + '</option></select><span style="flex:1"></span><span><kbd>I</kbd> ' + L('ocultar', 'hide') + '</span></footer>';
      document.body.appendChild(root); list = root.querySelector('ol'); conn = root.querySelector('.conn'); vidSel = root.querySelector('select');
      try { vidSel.value = localStorage.getItem('plato.video') || 'reference'; } catch (e) {}
      vidSel.onchange = () => { try { localStorage.setItem('plato.video', vidSel.value); } catch (e) {} };
      try { hidden = localStorage.getItem('plato.hud') === 'off'; } catch (e) {}
      root.classList.toggle('off', hidden);
    }
    function toggle() { mount(); hidden = !hidden; root.classList.toggle('off', hidden); try { localStorage.setItem('plato.hud', hidden ? 'off' : 'on'); } catch (e) {} }
    function add(key, html, cls) {
      mount(); if (!list) return null;
      const li = document.createElement('li'); li.className = cls || ''; li.innerHTML = html; list.prepend(li); items.set(key, li);
      while (list.children.length > 14) { const last = list.lastElementChild; for (const [k, v] of items) if (v === last) items.delete(k); last.remove(); }
      return li;
    }
    function decisionRow(d) {
      if (!d) return '';
      if (d.error) return '<div class="row"><span class="chip decision">Decision-1.1</span><span>' + L('sin respuesta · ruta por defecto', 'no answer · default route') + '</span></div>';
      const p = d.probability != null ? d.probability : null;
      return '<div class="row"><span class="chip decision">Decision-1.1</span><span>' + esc(d.choice || '') + (p != null ? ' · ' + pct(p) : '') + ' · ' + fmt(d.ms) + (d.ok != null ? L(' · apto ', ' · ok for demo ') + pct(d.ok) : '') + '</span></div>' + (p != null ? '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div>' : '');
    }
    let n = 0;
    function route(rec) {
      const key = 'r' + ++n; rec._key = key;
      const m = rec.model || {};
      const html = '<div class="t"><span>' + esc(TASK[rec.task] || rec.task) + '</span><span class="tm">…</span></div>' + (rec.said ? '<div class="said">' + L('«', '“') + esc(rec.said) + L('»', '”') + '</div>' : '') + decisionRow(rec.decision)
        + (rec.blocked ? '<div class="row" style="color:var(--rec)">' + L('Bloqueada: no es apta para la demo', 'Blocked: not suitable for the demo') + '</div>' : '<div class="row" style="margin-top:5px"><span>→</span><span class="chip ' + (m.provider || 'foundry') + '">' + esc(m.label || '') + '</span><span>' + esc([PROVIDER[m.provider], tm(m.detail)].filter(Boolean).join(' · ')) + '</span></div>');
      add(key, html, rec.blocked ? 'err' : 'run');
      return key;
    }
    function done(rec, d) {
      const li = rec && items.get(rec._key); if (!li) return;
      li.classList.remove('run');
      const tme = li.querySelector('.tm'); if (tme) tme.textContent = (d.ttft ? L('1.er token ', '1st token ') + fmt(d.ttft) + ' · ' : '') + 'total ' + fmt(d.ms);
    }
    function fail(rec, e) { const li = rec && items.get(rec._key); if (!li) return; li.classList.remove('run'); li.classList.add('err'); const tm = li.querySelector('.tm'); if (tm) tm.textContent = String((e && (e.message || e.code)) || 'error').slice(0, 60); }
    function note(task, said, rows, cls) { return add('n' + ++n, '<div class="t"><span>' + esc(TASK[task] || task) + '</span><span class="tm"></span></div>' + (said ? '<div class="said">' + esc(said) + '</div>' : '') + rows, cls || ''); }
    function status(s) {
      mount(); if (!conn) return;
      if (!s || s.error) { conn.innerHTML = '<span><i class="dot bad"></i>' + L('Servidor local no disponible', 'Local server unavailable') + '</span>'; return; }
      const az = s.azure || {}, cp = s.copilot || {};
      conn.innerHTML = '<span title="Microsoft Foundry"><i class="dot ' + (az.signedIn ? 'ok' : 'bad') + '"></i>Azure · ' + esc(az.signedIn ? az.user : L('sin sesión', 'not signed in')) + '</span>'
        + '<span title="GitHub Copilot"><i class="dot ' + (cp.ready ? 'ok' : cp.error ? 'bad' : 'wait') + '"></i>GitHub · ' + esc(cp.login || (cp.error ? L('no disponible', 'unavailable') : L('conectando…', 'connecting…'))) + '</span>'
        + '<span><i class="dot ok"></i>' + esc(s.account || '') + ' · ' + esc(s.location || '') + '</span>';
    }
    return { mount, toggle, route, done, fail, note, status, videoMode: () => (vidSel ? vidSel.value : 'reference'), esc };
  })();

  /* ================= panel de código en vivo ================= */
  const Code = (() => {
    let el = null, pre = null, head = null, stat = null, cur = null, hideT = 0;
    const KW = /\b(const|let|var|for|if|else|return|function|new|of|in|while|true|false|null|Math)\b/g;
    function mount() {
      if (el || !document.body) return; el = document.createElement('section'); el.id = 'platoCode';
      el.innerHTML = '<header><span class="chip"></span><b></b><span class="stat"></span></header><pre><code></code></pre>';
      document.body.appendChild(el); pre = el.querySelector('code'); head = el.querySelector('b'); stat = el.querySelector('.stat');
    }
    function hl(src) {
      return esc(src).split('\n').map((line) => {
        const ci = line.indexOf('//'); const code = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : '';
        return code.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"]*")/g, '<span class="s">$1</span>').replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>').replace(KW, '<span class="k">$1</span>').replace(/\b(b\.[a-zA-Z]+)\b/g, '<span class="f">$1</span>') + (com ? '<span class="c">' + com + '</span>' : '');
      }).join('\n');
    }
    function open(rec) {
      mount(); clearTimeout(hideT); el.className = 'on';
      const m = rec.model || {}, chip = el.querySelector('.chip'); chip.className = 'chip ' + (m.provider || 'copilot'); chip.textContent = m.label || '';
      const what = String(rec.said || '').split(':')[0];
      head.textContent = (rec.task === 'invent-fix' ? L('Arreglando «', 'Fixing “') : L('Escribiendo «', 'Writing “')) + what + L('»', '”');
      pre.innerHTML = '<span class="cursor"></span>';
      const t0 = performance.now(); let last = 0, pending = '';
      const think = () => { stat.textContent = (m.label || L('El modelo', 'The model')) + L(' está pensando · ', ' is thinking · ') + Math.round((performance.now() - t0) / 1000) + ' s'; };
      think(); const tick = setInterval(think, 1000);
      const me = {
        feed(text) { clearInterval(tick); pending = text; const t = performance.now(); if (t - last < 70) return; last = t; draw(); },
        done(d) { clearInterval(tick); pending = pending || d.text || ''; draw(true); el.className = 'on done'; stat.textContent += L(' · listo en ', ' · done in ') + fmt(d.ms); hideT = setTimeout(() => { if (cur === me) el.className = ''; }, 4500); },
        fail(e) { clearInterval(tick); el.className = 'on fail'; stat.textContent = String((e && (e.message || e.code)) || 'error').slice(0, 80); hideT = setTimeout(() => { if (cur === me) el.className = ''; }, 4000); },
      };
      function draw(final) {
        const lines = pending.split('\n'); const tail = lines.slice(-30).join('\n');
        pre.innerHTML = hl(tail) + (final ? '' : '<span class="cursor"></span>');
        stat.textContent = lines.length + L(' líneas · ', ' lines · ') + pending.length.toLocaleString(L('es-ES', 'en-US')) + L(' car. · ', ' chars · ') + fmt(performance.now() - t0);
      }
      cur = me; return me;
    }
    return { open };
  })();

  /* ================= voz: MAI-Transcribe-2-Streaming ================= */
  const PROC = 'class P extends AudioWorkletProcessor{constructor(){super();this.step=sampleRate/16000;this.pos=0;this.acc=[];}process(inp){const ch=inp[0]&&inp[0][0];if(ch){for(;this.pos<ch.length;this.pos+=this.step)this.acc.push(ch[Math.floor(this.pos)]);this.pos-=ch.length;while(this.acc.length>=640){const part=this.acc.splice(0,640),o=new Int16Array(640);let e=0;for(let i=0;i<640;i++){const v=Math.max(-1,Math.min(1,part[i]));e+=v*v;o[i]=v<0?v*32768:v*32767;}this.port.postMessage({pcm:o.buffer,rms:Math.sqrt(e/640)},[o.buffer]);}}return true;}}registerProcessor("plato-pcm",P);';
  function dictation() {
    const hs = { p: new Set(), f: new Set(), s: new Set() };
    const emit = (k, v) => hs[k].forEach((h) => { try { h(v); } catch (e) { console.warn(e); } });
    let st = 'idle', S = null;
    const setState = (state, reason) => { st = state; emit('s', reason ? { state, reason } : { state }); };
    function end(s) { if (!s) return; s.closed = true; try { s.node && s.node.disconnect(); } catch (e) {} try { s.src && s.src.disconnect(); } catch (e) {} try { s.stream && s.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { s.ac && s.ac.close(); } catch (e) {} try { s.ws && s.ws.close(); } catch (e) {} }
    async function start() {
      if (S) return;
      let ac; try { ac = new AudioContext({ sampleRate: 16000 }); } catch (e) { ac = new AudioContext(); } // antes de cualquier await: la pulsación aún cuenta como gesto
      const s = (S = { ac, acc: '', partial: '', speaking: false, quiet: 0, sent: 0, since: 0, finals: [] });
      setState('starting');
      try {
        s.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([PROC], { type: 'application/javascript' })));
      } catch (e) { end(s); S = null; setState('idle', 'error'); throw { code: e && e.name === 'NotAllowedError' ? 'not_granted' : 'unavailable', message: String((e && e.message) || e) }; }
      // en inglés se fija el idioma de MAI-Transcribe; en español se deja la detección automática (como siempre)
      s.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/stt' + (LANG === 'en' ? '?lang=en' : '')); s.ws.binaryType = 'arraybuffer';
      s.ready = new Promise((res) => { s.ws.onmessage = (m) => {
        let ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
        if (ev.t === 'ready') res(true);
        else if (ev.t === 'delta') { s.acc += ev.text; s.partial = ''; emit('p', { text: s.acc }); }
        else if (ev.t === 'partial') { s.partial = ev.text; emit('p', { text: s.acc + s.partial }); }
        else if (ev.t === 'final') { const text = (ev.text || s.acc).trim(); s.acc = ''; s.partial = ''; emit('p', { text: '' }); if (text) emit('f', { text: text + ' ' }); const w = s.finals.shift(); if (w) w(); }
        else if (ev.t === 'error') { if (S !== s || /transcription failed/i.test(ev.message || '')) return; console.warn('STT:', ev.message); HUD.note('dictation', 'MAI-Transcribe: ' + ev.message, '', 'err'); } // sin voz (p. ej. el toque de Empezar) no es un error
      }; s.ws.onclose = () => { res(false); if (S === s && !s.closed) { end(s); S = null; setState('idle', 'error'); } }; });
      s.src = ac.createMediaStreamSource(s.stream); s.node = new AudioWorkletNode(ac, 'plato-pcm'); s.src.connect(s.node);
      s.node.port.onmessage = (m) => {
        if (s.closed || !s.ws || s.ws.readyState !== 1) return;
        s.ws.send(m.data.pcm); s.sent++; s.since++;
        // Solo en escucha continua (tecla V): 0,9 s de silencio tras hablar cierran la frase. Con T pulsada, la frase se cierra al soltar.
        const live = document.getElementById('live'); if (!live || live.getAttribute('aria-pressed') !== 'true') return;
        if (m.data.rms > 0.02) { s.speaking = true; s.quiet = 0; } else if (s.speaking && ++s.quiet >= 22) { s.speaking = false; s.quiet = 0; if (s.since >= 8) { s.since = 0; s.finals.push(() => {}); s.ws.send(JSON.stringify({ type: 'commit' })); } }
      };
      const ok = await Promise.race([s.ready, sleep(6000).then(() => false)]);
      if (!ok) { end(s); S = null; setState('idle', 'error'); throw { code: 'unavailable', message: L('MAI-Transcribe no respondió', 'MAI-Transcribe didn’t answer') }; }
      setState('listening');
    }
    async function stop() {
      const s = S; if (!s) { setState('idle', 'stopped'); return; } S = null;
      try { s.node.port.onmessage = null; } catch (e) {}
      if (s.ws && s.ws.readyState === 1 && (s.since >= 4 || s.finals.length)) {
        if (s.since >= 4) { s.finals.push(() => {}); s.ws.send(JSON.stringify({ type: 'commit' })); }
        // espera a que lleguen todos los textos finales pendientes (uno por cada commit)
        const t0 = performance.now(); while (s.finals.length && performance.now() - t0 < 2500) await sleep(60);
      }
      const rest = (s.acc + s.partial).trim(); if (rest) { emit('p', { text: '' }); emit('f', { text: rest + ' ' }); }
      end(s); setState('idle', 'stopped');
    }
    return { start: (o) => start(o), stop, active: () => st !== 'idle', onPartial: (h) => (hs.p.add(h), () => hs.p.delete(h)), onFinal: (h) => (hs.f.add(h), () => hs.f.delete(h)), onState: (h) => (hs.s.add(h), () => hs.s.delete(h)) };
  }

  /* ================= hacerlo real ================= */
  // job: { blob, type, prompt, secs, signal?, onState?, mode?, style?, onJob?(id), onProgress?(estado), onFrame?(url) }
  // style: 'animated' (película de animación 3D de gran estudio, el del juego) o 'live' (imagen real); lo aplica server/video.mjs
  async function makeReal(job) {
    const say = job.onState || (() => {});
    const call = (fn, v) => { if (fn) try { fn(v); } catch (e) { console.warn(e); } };
    const blob = job.blob;
    const mode = job.mode || HUD.videoMode();
    say(L('Enviando la toma…', 'Sending the take…'));
    const t0 = performance.now();
    const meta = { prompt: job.prompt, secs: job.secs, mode }; if (job.style) meta.style = job.style;
    const r = await fetch('/api/real', { method: 'POST', signal: job.signal, headers: { 'Content-Type': (blob.type || job.type || 'video/mp4').split(';')[0], 'X-Plato-Job': encodeURIComponent(JSON.stringify(meta)) }, body: blob });
    if (!r.ok) throw new Error(L('No se pudo enviar la toma (HTTP ', 'Couldn’t send the take (HTTP ') + r.status + ')');
    const { id } = await r.json();
    call(job.onJob, id);
    const secs = job.secs ? job.secs.toFixed(1) + ' s' : '';
    const style = job.style ? '<div class="row" style="margin-top:5px"><span>' + L('estilo: ', 'style: ') + (job.style === 'animated' ? L('animación 3D de cine', '3D animated film') : L('imagen real', 'live action')) + '</span></div>' : '';
    const li = HUD.note('video', L('Toma de ' + secs + ' → metraje real', secs + ' take → real footage'), '<div class="row"><span class="chip media">MAI-Image-2.7</span><span>→</span><span class="chip media">' + (mode === 'draft' ? 'LTX-2.5 Fast' : 'MiniMax H3 Max') + '</span><span>' + L('fal en Foundry', 'fal in Foundry') + '</span></div>' + style, 'run');
    let frameShown = false, s = null;
    for (;;) {
      await sleep(2000); if (job.signal && job.signal.aborted) throw new DOMException('aborted', 'AbortError');
      s = await (await fetch('/api/real/' + id, { signal: job.signal })).json();
      const label = stageLabel(s);
      say(label + ' · ' + s.secs + ' s'); call(job.onProgress, Object.assign({}, s, { label }));
      if (li) { const t = li.querySelector('.tm'); if (t) t.textContent = label + ' · ' + s.secs + ' s'; }
      if (s.frame && !frameShown) { frameShown = true; call(job.onFrame, '/api/real/' + id + '/frame'); if (li) { const im = document.createElement('img'); im.className = 'shot'; im.alt = L('Primer fotograma real de MAI-Image-2.7', 'Real first frame by MAI-Image-2.7'); im.src = '/api/real/' + id + '/frame'; li.appendChild(im); } }
      if (s.state === 'error') { if (li) { li.classList.remove('run'); li.classList.add('err'); } throw new Error(s.error || L('Falló la generación', 'Generation failed')); }
      if (s.state === 'done') break;
    }
    const real = await (await fetch('/api/real/' + id + '/video', { signal: job.signal })).blob();
    if (li) { li.classList.remove('run'); const t = li.querySelector('.tm'); if (t) t.textContent = L('listo en ', 'done in ') + fmt(performance.now() - t0); }
    return { real: new Blob([real], { type: 'video/mp4' }), model: tm(s.model), id, secs: s.secs };
  }

  /* ================= lo que usa el juego ================= */
  window.addEventListener('load', () => HUD.mount());
  const canVoice = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebSocket && window.AudioWorkletNode);
  window.PLATO = { HUD, Code, makeReal, voice: Promise.resolve(canVoice ? dictation() : null), lang: LANG, L, tm };
})();
