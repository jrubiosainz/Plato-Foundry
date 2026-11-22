// Configuración local de Plató: la escribe scripts/provision.sh en config/local.json.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig() {
  const file = process.env.PLATO_CONFIG || join(ROOT, 'config', 'local.json');
  if (!existsSync(file)) throw new Error(`No encuentro ${file}. Ejecuta antes: npm run provision`);
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  for (const k of ['endpoint', 'cognitiveEndpoint', 'openaiEndpoint', 'deployments']) {
    if (!cfg[k]) throw new Error(`Falta "${k}" en ${file}`);
  }
  return {
    ...cfg,
    port: Number(process.env.PORT) || 8740,
    host: process.env.HOST || '127.0.0.1',
    codeModel: process.env.PLATO_CODE_MODEL || 'mai-code-2-flash',
    videoResolution: process.env.PLATO_VIDEO_RES || '768P',
  };
}
