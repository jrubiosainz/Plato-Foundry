// Voces de los personajes del juego con MAI-Voice-2.1-Flash. Cada personaje tiene siempre la misma voz (según su semilla
// y su sexo, o la fijada en npc.cast) y Microsoft-Decision-1.1 elige, en una sola llamada, el idioma de la frase y la
// emoción con la que se dice.
import { createHash } from 'node:crypto';

const FLASH = 'MAI-Voice-2.1-Flash';
const CAST = {
  es: {
    // voces con estilos emocionales; Harper (es-MX) solo tiene estilos de locución y queda como narradora
    female: ['es-ES-Marta', 'es-MX-Valeria'],
    male: ['es-MX-Alejo', 'es-MX-Grant'],
    narrator: 'es-MX-Harper',
  },
  en: {
    female: ['en-US-Olivia', 'en-US-Harper', 'en-US-Iris', 'en-GB-Emily'],
    male: ['en-US-Ethan', 'en-US-Jasper', 'en-US-Grant', 'en-GB-Harry'],
    narrator: 'en-US-Sage',
  },
};

const EMOTIONS = {
  neutral: 'Plain, matter-of-fact speech with no particular feeling.',
  happy: 'Warm, friendly and pleased.',
  excited: 'Thrilled and energetic, can hardly wait.',
  surprised: 'Astonished or amazed by something unexpected.',
  curious: 'Intrigued, asking or wondering about something.',
  confused: 'Puzzled or unsure what is going on.',
  sad: 'Sad, disappointed or wistful.',
  angry: 'Annoyed, irritated or angry.',
  fearful: 'Scared, nervous or worried.',
  secretive: 'Telling a secret, speaking quietly so others will not hear.',
  gentle: 'Soft, calm and caring.',
  serious: 'Firm, determined or serious.',
};

// Emoción -> estilos posibles, en orden de preferencia; se usa el primero que admita la voz.
const STYLE_FOR = {
  happy: ['happy', 'friendlycheerful', 'joyful'],
  excited: ['excited', 'adventurous', 'joyful'],
  surprised: ['surprised', 'excited', 'curious'],
  curious: ['curious', 'hopeful', 'confused'],
  confused: ['confused', 'curious'],
  sad: ['sad', 'saddisappointed', 'regretful'],
  angry: ['angry', 'serious', 'determined'],
  fearful: ['fearful', 'confused'],
  secretive: ['whispering', 'softvoice', 'reflective'],
  gentle: ['softvoice', 'caringempathy', 'encouraging'],
  serious: ['determined', 'serious'],
  neutral: [],
};

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function createVoice(cfg, F) {
  let styles = null; // ShortName -> [estilos]
  async function styleMap() {
    if (styles) return styles;
    styles = new Map();
    for (const v of await F.voices()) if (String(v.ShortName).endsWith(':' + FLASH)) styles.set(v.ShortName, v.StyleList || []);
    return styles;
  }

  // npc.cast = { en: 'en-GB-Harry' } fija la voz de un personaje en un idioma (el reparto inglés del juego);
  // solo se usa si es una voz de MAI-Voice-2.1-Flash del recurso. Si no, la voz sale de la semilla, como siempre.
  function cast(lang, npc, known) {
    const pool = CAST[lang] || CAST.es;
    if (!npc) return `${pool.narrator}:${FLASH}`;
    const fixed = npc.cast && typeof npc.cast[lang] === 'string' ? `${npc.cast[lang]}:${FLASH}` : null;
    if (fixed && known && known.has(fixed)) return fixed;
    const list = npc.gender === 'male' ? pool.male : npc.gender === 'female' ? pool.female : [...pool.female, ...pool.male];
    const h = createHash('sha1').update(String(npc.seed ?? npc.id ?? npc.name ?? '')).digest()[0];
    return `${list[h % list.length]}:${FLASH}`;
  }

  const cache = new Map();

  async function decideLine(line, npc, lang, signal) {
    const questions = { emotion: { type: 'choice', instructions: 'With which feeling does the speaker say this line out loud?', criteria: EMOTIONS } };
    if (!lang) questions.lang = { type: 'choice', instructions: 'Which language is the line written in?', criteria: { es: 'Spanish.', en: 'English, or any other language.' } };
    const timeout = AbortSignal.timeout(3000);
    return F.decide({ state: { speaker: npc ? `${npc.name || 'a character'}, ${npc.role || 'a character in a family 3D platform game'}` : 'the narrator of a film', line }, questions, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  }

  // { text, npc: {id, seed, name, role, gender, age}, lang? } -> { audio, voice, style, emotion, lang, decision }
  async function speak({ text, npc, lang: forced, signal }) {
    const line = String(text || '').trim().slice(0, 400);
    if (!line) throw new Error('Texto vacío');
    let decision = null, lang = forced || null, emotion = 'neutral';
    try {
      const r = await decideLine(line, npc, lang, signal);
      emotion = r.answers.emotion.choice;
      if (!lang) lang = r.answers.lang.choice;
      decision = { ms: r.ms, emotion, probability: r.answers.emotion.probabilities?.[emotion] ?? null, lang };
    } catch (err) {
      if (signal?.aborted) throw err;
      lang = lang || (/[áéíóúñ¿¡]|\b(el|la|los|las|que|de|y|hola|qué|pero|muy)\b/i.test(line) ? 'es' : 'en');
      decision = { error: err.message };
    }
    const known = await styleMap();
    const voice = cast(lang, npc, known);
    const allowed = known.get(voice) || [];
    const style = (STYLE_FOR[emotion] || []).find((s) => allowed.includes(s)) || null;
    const key = `${voice}|${style}|${line}`;
    let audio = cache.get(key);
    if (!audio) {
      const locale = voice.split('-').slice(0, 2).join('-');
      const body = style ? `<mstts:express-as style="${style}">${esc(line)}</mstts:express-as>` : esc(line);
      audio = await F.tts({ ssml: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${voice}">${body}</voice></speak>`, signal });
      cache.set(key, audio);
      if (cache.size > 120) cache.delete(cache.keys().next().value);
    }
    return { audio, voice, style, emotion, lang, decision };
  }

  return { speak, cast, warm: () => Promise.all([decideLine('¡Nadie cruza mi arena!', { name: 'Rey Volcán', role: 'a grumpy volcano golem king in a children\'s platform game' }, null).catch(() => null), styleMap().catch(() => null)]) };
}
