// Prueba rápida: ¿llega MAI-Code-2-Flash por el SDK de Copilot con la sesión de GitHub de este equipo?
import { CopilotClient, RuntimeConnection, approveAll } from '@microsoft/copilot-sdk';
import { execFileSync } from 'node:child_process';

const base = { mode: 'coding-agent', runtime: RuntimeConnection.forSpawnedStdio({ env: { ...process.env } }) };
let client = new CopilotClient(base);
await client.start();
let auth = await client.getAuthStatus().catch(() => ({ isAuthenticated: false }));
if (!auth.isAuthenticated) {
  const token = execFileSync('gh', ['auth', 'token', '--hostname', 'github.com']).toString().trim();
  await client.stop();
  client = new CopilotClient({ ...base, github: { token } });
  await client.start();
  auth = await client.getAuthStatus();
}
console.log('auth:', auth.isAuthenticated, auth.login, auth.authType);
const models = await client.listModels();
const pick = models.filter((m) => /mai|luna|astra/i.test(m.id + ' ' + (m.name || '')));
console.log('models:', pick.map((m) => `${m.id} (${m.name}) effort=${JSON.stringify(m.capabilities?.supports?.reasoningEffort ?? m.supportedReasoningEfforts ?? null)}`).join('\n  '));

const model = process.argv[2] || 'mai-code-2-flash';
const t0 = Date.now();
const session = await client.createSession({
  model,
  systemMessage: { mode: 'replace', content: 'You write small JavaScript functions. Reply with code only, no prose, no code fences.' },
  inference: { reasoningEffort: process.argv[3] || 'low' },
  events: { streaming: true },
  tools: { availableTools: [] },
  permissions: { onRequest: approveAll },
});
let text = '', first = 0;
await new Promise((resolve, reject) => {
  const off = session.on((e) => {
    if (e.type === 'assistant.message_delta' && e.data?.deltaContent) { if (!first) first = Date.now() - t0; text += e.data.deltaContent; }
    else if (e.type === 'session.idle') { off?.(); resolve(); }
    else if (e.type === 'session.error') { off?.(); reject(new Error(e.data?.message || 'session.error')); }
  });
  session.send({ prompt: 'Write function lerp(a, b, t) that linearly interpolates, then function clamp(x, lo, hi).' }).catch(reject);
});
console.log(`model=${model} first=${first}ms total=${Date.now() - t0}ms\n---\n${text}\n---`);
await session.disconnect().catch(() => {});
await client.stop();
