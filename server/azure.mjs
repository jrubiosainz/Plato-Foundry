// Identidad de Azure: la sesión de Azure CLI de este equipo (o la de azd), sin claves.
// El token nunca sale del servidor local; el navegador solo habla con localhost.
import { execFile } from 'node:child_process';

const SCOPE = 'https://cognitiveservices.azure.com/.default';
let cache = { token: null, exp: 0, source: null };
let pending = null;

function run(cmd, args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function fetchToken() {
  const az = await run('az', ['account', 'get-access-token', '--scope', SCOPE, '-o', 'json']);
  if (az.code === 0) {
    const j = JSON.parse(az.stdout);
    const exp = j.expires_on ? Number(j.expires_on) * 1000 : Date.parse(j.expiresOn);
    return { token: j.accessToken, exp, source: 'az' };
  }
  const azd = await run('azd', ['auth', 'token', '--scope', SCOPE, '--output', 'json']);
  if (azd.code === 0) {
    const j = JSON.parse(azd.stdout);
    return { token: j.token, exp: Date.parse(j.expiresOn), source: 'azd' };
  }
  throw new Error('No hay sesión de Azure en este equipo: ejecuta "az login" (o "azd auth login").');
}

export async function token() {
  if (cache.token && Date.now() < cache.exp - 5 * 60000) return cache.token;
  if (!pending) {
    pending = fetchToken()
      .then((t) => { cache = t; return t.token; })
      .finally(() => { pending = null; });
  }
  return pending;
}

export async function identity() {
  try {
    const t = await token();
    const claims = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
    return { signedIn: true, user: claims.upn || claims.unique_name || claims.preferred_username || null, tenantId: claims.tid || null, source: cache.source };
  } catch (err) {
    return { signedIn: false, error: err.message };
  }
}
