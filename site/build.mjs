// Construye Plató en site/dist: la página del juego (app/) con el host de Plató (site/plato.js), que conecta la voz,
// el panel del router y «Hacerlo real» con el servidor local (server/server.mjs).
import { cpSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), app = join(root, 'app'), out = join(here, 'dist');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
cpSync(app, out, { recursive: true });
mkdirSync(join(out, 'js'), { recursive: true });
copyFileSync(join(here, 'plato.js'), join(out, 'js', 'plato.js'));

// Three.js r128 y sus cargadores no-módulo salen de node_modules (sin CDN).
const three = join(root, 'node_modules', 'three'), vendor = join(out, 'platform', 'vendor');
mkdirSync(vendor, { recursive: true });
for (const [from, to] of [['build/three.min.js', 'three.min.js'], ['examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js'], ['examples/js/loaders/SVGLoader.js', 'SVGLoader.js'], ['examples/js/utils/SkeletonUtils.js', 'SkeletonUtils.js']]) {
  try { copyFileSync(join(three, from), join(vendor, to)); } catch (err) { throw new Error('Falta three@0.128.0 en node_modules (ejecuta npm install): ' + from); }
}

const d = new Date(), p2 = (v) => String(v).padStart(2, '0'), build = process.env.PLATO_BUILD || (p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' UTC');
writeFileSync(join(out, 'version.json'), JSON.stringify({ build }));
console.log('Plató construido en', out, '· build', build);
