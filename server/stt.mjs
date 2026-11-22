// Voz a texto en streaming: el navegador manda PCM16 a 16 kHz a este servidor y el servidor lo reenvía a
// MAI-Transcribe-2-Streaming (Realtime API de Foundry) con el token de Entra, que nunca llega al navegador.
import { WebSocketServer, WebSocket } from 'ws';
import { token } from './azure.mjs';

export function attachStt(server, cfg, isLocalOrigin) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/stt' || !isLocalOrigin(req)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, url.searchParams.get('lang')));
  });

  async function bridge(client, lang) {
    const send = (o) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(o)); };
    if (process.env.PLATO_DEBUG) { console.log('[stt] conexión abierta'); client.on('close', () => console.log('[stt] conexión cerrada')); }
    if (!cfg.stt) { send({ t: 'error', message: 'No hay un despliegue de MAI-Transcribe-2-Streaming configurado' }); client.close(); return; }
    let up;
    try {
      const target = cfg.stt.endpoint.replace(/^https:/, 'wss:') + '/mai/v1/realtime?intent=transcription';
      up = new WebSocket(target, { headers: { Authorization: `Bearer ${await token()}` } });
    } catch (err) { send({ t: 'error', message: err.message }); client.close(); return; }

    let ready = false;
    const queue = [];
    const upSend = (o) => { const s = JSON.stringify(o); if (ready && up.readyState === WebSocket.OPEN) up.send(s); else queue.push(s); };

    up.on('message', (raw) => {
      let ev; try { ev = JSON.parse(raw); } catch { return; }
      const t = ev.type || '';
      if (t === 'session.created') {
        up.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription', audio: { input: {
          format: { type: 'audio/pcm', rate: 16000 },
          transcription: lang && /^[a-z]{2}$/.test(lang) ? { model: cfg.stt.deployment, language: lang } : { model: cfg.stt.deployment },
          turn_detection: null, noise_reduction: null,
        } } } }));
      } else if (t === 'session.updated') {
        ready = true;
        while (queue.length) up.send(queue.shift());
        send({ t: 'ready' });
      } else if (t.endsWith('input_audio_transcription.delta')) send({ t: 'delta', text: ev.delta || '' });
      else if (t.endsWith('input_audio_transcription.intermediate')) send({ t: 'partial', text: ev.intermediate || '' });
      else if (t.endsWith('input_audio_transcription.completed')) send({ t: 'final', text: ev.transcript || '' });
      else if (t === 'input_audio_buffer.committed') send({ t: 'committed' });
      else if (t.endsWith('input_audio_transcription.failed')) send({ t: 'final', text: '', failed: ev.error?.message || 'sin transcripción' }); // p. ej. un commit sin voz: no es un error para quien habla
      else if (t === 'error' && /transcription failed/i.test(ev.error?.message || '')) send({ t: 'final', text: '', failed: ev.error.message }); // audio sin voz
      else if (t === 'error') send({ t: 'error', message: ev.error?.message || 'Error de transcripción' });
      if (process.env.PLATO_DEBUG && /error|failed/.test(t)) console.log('[stt]', JSON.stringify(ev).slice(0, 300));
    });
    up.on('error', (err) => { send({ t: 'error', message: err.message }); client.close(); });
    up.on('close', () => { if (client.readyState === WebSocket.OPEN) client.close(); });

    client.on('message', (data, isBinary) => {
      if (isBinary) { if (data.length) upSend({ type: 'input_audio_buffer.append', audio: Buffer.from(data).toString('base64') }); return; }
      let m; try { m = JSON.parse(data); } catch { return; }
      if (m.type === 'commit') upSend({ type: 'input_audio_buffer.commit' });
    });
    client.on('close', () => { try { up.close(); } catch { /* ya cerrado */ } });
  }
}
