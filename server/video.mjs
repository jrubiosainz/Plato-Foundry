// «Hacerlo real»: una toma de cine grabada en el juego se convierte en vídeo generado.
//   1. ffmpeg normaliza la toma (MP4 H.264, 24 fps, máx. 10 s) y saca el primer fotograma.
//   2. MAI-Image-2.7 repinta ese fotograma en el estilo elegido, con la misma composición.
//   3. fal en Foundry genera el vídeo:
//      - "reference": MiniMax H3 Max reference-to-video, con la toma del juego como vídeo de referencia y el fotograma
//        de MAI-Image-2.7 como inicio.
//      - "draft": LTX-2.5 Fast image-to-video desde el fotograma real (borrador rápido).
//   Dos estilos (X-Plato-Job.style): "animated" (el del juego por defecto) y "live" (imagen real fotorrealista). "animated"
//   es metraje de una película de animación 3D de gran estudio: materiales ricos, luz de cine, sin aspecto low-poly, con el
//   diseño de cada personaje, la cámara y la acción de la toma. Cada estilo tiene su prompt de imagen y de vídeo.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 120000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => (err ? reject(new Error(`${cmd}: ${String(stderr || err.message).slice(-400)}`)) : resolve(String(stdout))));
});
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const STYLES = ['live', 'animated'];
const PROMPTS = {
  live: {
    image: 'Turn this frame from a stylized 3D previsualization into a photorealistic live-action film still. Keep the exact composition, camera angle, framing and layout, and the position, size, shape and colour of every building, object, vehicle and person. Replace the flat 3D materials with real-world materials, natural light, real skin and fabric, subtle depth of field. No text, no borders. Scene: ',
    reference: 'Video 1 is a rough 3D previsualization of this shot: follow its camera move, timing and framing, and the position and motion of every object and person, exactly. The video opens on the photorealistic first frame given. Render it as live-action photorealistic footage with natural light and real materials, no text. Scene: ',
    draft: 'Live-action footage continuing from this frame, with the camera moving as in a film shot. ',
  },
  animated: {
    image: 'Turn this frame from a simple low-poly 3D game previsualization into a frame of a feature-length 3D animated film by a major animation studio. Keep the exact composition, camera angle, framing and layout, and the position, size, pose and colours of every character, object and building. Keep every character\'s design recognisable: the same silhouette, proportions, hairstyle, facial hair, clothing, accessories and colours. Replace the flat game materials with rich, detailed film materials (soft skin with subsurface scattering, fabric with visible weave, rough rock with glowing lava cracks, fluffy tulle, lush grass, petals and stone), cinematic lighting with soft global illumination, rim light and atmospheric depth, and a gentle depth of field. No low-poly look, no flat shading, no text, no borders. Scene: ',
    reference: 'Video 1 is a rough low-poly 3D game previsualization of this shot: follow its camera move, timing and framing, and the position and motion of every character and object, exactly. The video opens on the first frame given, a frame from a feature-length 3D animated film by a major animation studio. Render the whole shot as footage from that animated film: rich detailed materials, expressive and fluid character animation, cinematic lighting and depth of field, keeping each character\'s design, colours and costume exactly as in the first frame. No low-poly look, no text. Scene: ',
    draft: 'Footage from a feature-length 3D animated film, continuing from this frame, with the camera moving as in a film shot. ',
  },
};

const STAGES = {
  prep: 'Preparando la toma…',
  image: 'MAI-Image-2.7 pinta el primer fotograma real…',
  submit: 'Enviando a fal en Foundry…',
  queue: 'En cola en fal…',
  render: 'Generando el vídeo…',
  download: 'Descargando el resultado…',
  done: 'Listo',
};

export function createVideo(cfg, F) {
  const base = join(ROOT, 'out', 'jobs');
  mkdirSync(base, { recursive: true });
  const jobs = new Map();

  function view(job) {
    const { id, mode, style, state, stage, error, model, startedAt, endedAt, frame } = job;
    return { id, mode, style, state, stage, label: STAGES[stage] || stage, error, model, frame: Boolean(frame), secs: Math.round(((endedAt || Date.now()) - startedAt) / 1000) };
  }

  async function pipeline(job, { buf, type, prompt, secs }) {
    const dir = join(base, job.id);
    mkdirSync(dir, { recursive: true });
    const input = join(dir, /webm/.test(type) ? 'input.webm' : 'input.mp4');
    writeFileSync(input, buf); job.input = input;

    job.stage = 'prep';
    const previz = join(dir, 'previz.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-t', '10', '-vf', 'scale=854:-2,fps=24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-an', previz]);
    const dur = Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', previz])) || secs || 0;
    if (dur < 2) throw new Error('La toma debe durar al menos 2 segundos');
    const first = join(dir, 'first.png');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-frames:v', '1', '-vf', 'scale=1280:-2', first]);

    job.stage = 'image';
    const scene = String(prompt || '').slice(0, 1500), P = PROMPTS[job.style] || PROMPTS.live;
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ id: job.id, style: job.style, mode: job.mode, secs: dur, prompt: scene, startedAt: new Date(job.startedAt).toISOString() }, null, 2));
    const still = await F.imageEdit({
      prompt: P.image + scene,
      images: [{ data: readFileSync(first), type: 'image/png', name: 'previz.png' }],
      width: 1365, height: 768,
    });
    job.frame = join(dir, 'real-first.png');
    writeFileSync(job.frame, still);
    const stillJpg = join(dir, 'real-first.jpg');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', job.frame, '-vf', 'scale=1280:-2', '-q:v', '3', stillJpg]);

    job.stage = 'submit';
    const kind = job.mode === 'draft' ? 'draft' : 'reference';
    const input2 = kind === 'reference'
      ? {
        prompt: P.reference + scene,
        reference_video_urls: [dataUri(previz, 'video/mp4')],
        image_url: dataUri(stillJpg, 'image/jpeg'),
        duration: Math.round(Math.min(Math.max(dur, 2), 10) * 10) / 10,
        resolution: cfg.videoResolution,
        aspect_ratio: '16:9',
        prompt_expansion_mode: 'disabled',
      }
      : {
        prompt: P.draft + scene,
        image_url: dataUri(stillJpg, 'image/jpeg'),
        duration: dur > 7 ? 8 : 6,
        resolution: '720p',
        aspect_ratio: '16:9',
      };
    job.model = kind === 'reference' ? 'MiniMax H3 Max · fal en Foundry' : 'LTX-2.5 Fast · fal en Foundry';
    const requestId = await F.falSubmit(kind, input2);
    job.requestId = requestId;

    job.stage = 'queue';
    const deadline = Date.now() + 12 * 60000;
    for (;;) {
      if (Date.now() > deadline) throw new Error('fal no terminó en 12 minutos');
      const st = await F.falStatus(kind, requestId);
      if (st.status === 'COMPLETED') break;
      if (st.status === 'FAILED' || st.status === 'ERROR' || st.error) throw new Error('fal: ' + (st.error || st.status));
      job.stage = st.status === 'IN_PROGRESS' ? 'render' : 'queue';
      await sleep(4000);
    }

    job.stage = 'download';
    const result = await F.falResult(kind, requestId);
    const url = result.video?.url;
    if (!url) throw new Error('fal no devolvió vídeo');
    job.video = join(dir, 'real.mp4');
    writeFileSync(job.video, await F.download(url));
    job.stage = 'done';
  }

  function start({ buf, type, prompt, secs, mode, style }) {
    const job = { id: randomUUID(), mode: mode === 'draft' ? 'draft' : 'reference', style: STYLES.includes(style) ? style : 'animated', state: 'running', stage: 'prep', startedAt: Date.now() };
    jobs.set(job.id, job);
    pipeline(job, { buf, type, prompt, secs })
      .then(() => { job.state = 'done'; })
      .catch((err) => { job.state = 'error'; job.error = err.message; })
      .finally(() => { job.endedAt = Date.now(); });
    return view(job);
  }

  // un trabajo terminado sigue disponible después de reiniciar el servidor (out/jobs/<id>: job.json, real.mp4…),
  // para volver a enseñar la comparación sin generar otra vez (PF.real.show en el juego)
  function fromDisk(id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const dir = join(base, id), meta = join(dir, 'job.json'), video = join(dir, 'real.mp4');
    if (!existsSync(meta) || !existsSync(video)) return null;
    try {
      const j = JSON.parse(readFileSync(meta, 'utf8')), input = readdirSync(dir).find((f) => /^input\.(mp4|webm)$/.test(f));
      return { id, mode: j.mode, style: j.style, state: 'done', stage: 'done', model: j.mode === 'draft' ? 'LTX-2.5 Fast · fal en Foundry' : 'MiniMax H3 Max · fal en Foundry', startedAt: Date.parse(j.startedAt) || 0, endedAt: statSync(video).mtimeMs, frame: existsSync(join(dir, 'real-first.png')) ? join(dir, 'real-first.png') : null, video, input: input ? join(dir, input) : null, takeSecs: j.secs };
    } catch { return null; }
  }
  const find = (id) => jobs.get(id) || fromDisk(id);

  return {
    start,
    get: (id) => { const j = find(id); return j ? Object.assign(view(j), j.takeSecs ? { takeSecs: j.takeSecs } : {}) : null; },
    file: (id, which) => { const j = find(id); const f = j && (which === 'frame' ? j.frame : which === 'take' ? j.input : j.video); return f && existsSync(f) ? f : null; },
  };
}
