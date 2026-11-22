// El enrutador de Plató: Microsoft-Decision-1.1 decide, en una sola llamada, qué modelo atiende cada orden del juego
// (y si es apta para una demo pública); luego se ejecuta en Foundry (GPT-6 Luna, GPT-6.2 Astra) o en GitHub Copilot
// (MAI-Code-2-Flash). Cada decisión se emite al navegador para el panel del router.
// Tareas (app/platform/pf-orders.js): «plat» (una orden hablada → operaciones JSON del juego), «plat-invent» (una pieza
// nueva escrita como código) e «invent-fix» (arreglar ese código si falla).
import * as copilot from './copilot.mjs';

const OK_FOR_DEMO = { type: 'noul', instructions: 'Is this request appropriate for a public, family-friendly demo?' };

const QUESTIONS = {
  plat: {
    instructions: 'A player of a 3D platform game said the sentence in the state to change the level by voice. Which model should turn it into game operations? Prefer fast; choose careful only when the sentence clearly needs it.',
    criteria: {
      fast: 'A direct order: add, remove or move one or a few things, make one character do something to another, change what the boss throws, dress someone up, call helpers, weather or time of day, show logos, or film the scene and make it real.',
      careful: 'Needs careful reasoning: several things arranged relative to each other, a multi-step instruction with many parts, ambiguous references, or correcting the same thing again.',
    },
  },
  'plat-invent': {
    instructions: 'A new kind of object must be written as a procedural three.js generator. Which code model should write it?',
    criteria: {
      flash: 'An ordinary object built from a handful of simple shapes: furniture, a vehicle, a plain building, a sign, a plant, an animal, a prop.',
      deep: 'An intricate showpiece: a detailed mechanism, an ornate or monumental structure, many precisely arranged parts, or moving machinery.',
    },
  },
};

// Qué modelo atiende cada opción de cada tarea.
const CHOICES = {
  plat: { fast: 'luna-none', careful: 'astra-low' },
  'plat-invent': { flash: 'flash', deep: 'astra-low' },
};

// Tareas que no necesitan decidir modelo.
const FIXED = { 'invent-fix': 'flash' };
const BY_TIER = { quick: 'luna-none', default: 'luna-low', complex: 'astra-low' };

export function createRouter(cfg, F) {
  const D = cfg.deployments;
  const MODELS = {
    'luna-none': { provider: 'foundry', deployment: D.fast, effort: 'none', label: 'GPT-6 Luna', detail: 'sin razonamiento' },
    'luna-low': { provider: 'foundry', deployment: D.fast, effort: 'low', label: 'GPT-6 Luna', detail: 'razonamiento bajo' },
    'astra-low': { provider: 'foundry', deployment: D.deep, effort: 'low', label: 'GPT-6.2 Astra', detail: 'razonamiento bajo' },
    flash: { provider: 'copilot', model: cfg.codeModel, effort: 'low', label: 'MAI-Code-2-Flash', detail: 'razonamiento bajo' },
  };
  const history = [];
  const remember = (rec) => { history.unshift(rec); history.length = Math.min(history.length, 60); };

  async function decide(task, said, signal) {
    const q = QUESTIONS[task];
    if (!q) return null;
    const t0 = performance.now();
    try {
      const timeout = AbortSignal.timeout(4000);
      const r = await F.decide({
        state: { player_said: String(said || '').slice(0, 600) },
        questions: { model: { type: 'choice', instructions: q.instructions, criteria: q.criteria }, ok_for_demo: OK_FOR_DEMO },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const a = r.answers.model;
      return { question: task, choice: a.choice, probability: a.probabilities?.[a.choice] ?? a.confidence ?? null, probabilities: a.probabilities, ok: r.answers.ok_for_demo?.noul ?? null, ms: r.ms };
    } catch (err) {
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      return { question: task, error: err.message, ms: Math.round(performance.now() - t0) };
    }
  }

  function toPrompt(input) {
    if (typeof input === 'string') return input;
    return (input || []).map((m) => (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + String(m.content)).join('\n\n');
  }
  function toResponsesInput(input) {
    if (typeof input === 'string') return input;
    return (input || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  }

  async function run(key, input, { signal, onDelta }) {
    let spec = MODELS[key];
    if (spec.provider === 'copilot') {
      const st = copilot.status();
      if (st.ready === false && st.error) { key = key === 'flash' ? 'luna-low' : 'astra-low'; spec = MODELS[key]; }
    }
    if (spec.provider === 'copilot') {
      const r = await copilot.generate({ model: spec.model, effort: spec.effort, prompt: toPrompt(input), signal, onDelta });
      return { key, spec, ...r };
    }
    const r = await F.respond({ deployment: spec.deployment, effort: spec.effort, input: toResponsesInput(input), signal, onDelta });
    return { key, spec, ...r };
  }

  // req: { input, tier, task, said }. emit(event, data) envía eventos SSE al navegador.
  async function handle(req, emit, signal) {
    const task = req.task || null;
    const t0 = performance.now();
    const rec = { at: Date.now(), task: task || req.tier || 'default', said: String(req.said || '').slice(0, 160) };

    let key = FIXED[task] || null;
    if (!key && CHOICES[task]) {
      const d = await decide(task, req.said || toPrompt(req.input).slice(-600), signal);
      rec.decision = d;
      if (d && d.ok != null && d.ok < 0.08) {
        rec.blocked = true;
        emit('route', rec);
        remember(rec);
        const e = new Error('Petición no apta para la demo'); e.code = 'refused'; throw e;
      }
      key = (d && !d.error && CHOICES[task][d.choice]) || Object.values(CHOICES[task])[0];
    }
    key = key || BY_TIER[req.tier] || 'luna-low';
    const spec = MODELS[key];
    rec.model = { key, label: spec.label, detail: spec.detail, provider: spec.provider, effort: spec.effort };
    emit('route', rec);

    const r = await run(key, req.input, { signal, onDelta: (d) => emit('delta', { d }) });
    if (r.key !== key) rec.model = { key: r.key, label: r.spec.label, detail: r.spec.detail + ' · alternativa', provider: r.spec.provider, effort: r.spec.effort };
    Object.assign(rec, { ttft: r.ttft, ms: Math.round(performance.now() - t0), warm: r.warm });
    remember(rec);
    emit('done', { text: r.text, model: r.spec.label + (r.spec.detail ? ' · ' + r.spec.detail : ''), ms: rec.ms, ttft: r.ttft, truncated: Boolean(r.truncated), usage: r.usage || null });
  }

  // Cada tipo de pregunta tarda ~1,5 s la primera vez y ~150 ms después: se calientan todas al arrancar y mientras se usa la app.
  async function warm() {
    await Promise.all(Object.keys(QUESTIONS).map((task) => decide(task, 'warm-up').catch(() => null)));
  }

  return { handle, warm, history: () => history.slice(0, 30), models: MODELS };
}
