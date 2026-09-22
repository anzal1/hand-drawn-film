// Scaffold a film project: local engine modules, render/review scripts, a brief and a working
// starter film built on the whole-drawing workflow (svgCel keys, sheetBuilder, draw-on, score).
//   node scripts/new.mjs ~/films/my-film [--ar 16:9] [--look pencil|ink] [--title "My film"]
// Then: cd ~/films/my-film && npm i --no-audit --no-fund && node render.mjs film.html --grid 24
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flags = new Map(); let dest;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { if (!['--ar', '--look', '--title'].includes(args[i])) throw new Error(`Unknown option ${args[i]}`); flags.set(args[i], args[++i]); }
  else if (!dest) dest = args[i]; else throw new Error(`Unexpected argument ${args[i]}`);
}
if (!dest) throw new Error('Usage: node scripts/new.mjs <folder> [--ar 16:9] [--look pencil|ink] [--title "..."]');
dest = path.resolve(dest);
if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} exists and is not empty`);
const ar = flags.get('--ar') || '16:9', look = flags.get('--look') || 'pencil', title = flags.get('--title') || path.basename(dest);
if (!/^\d+:\d+$/.test(ar)) throw new Error('--ar like 16:9, 9:16 or 1:1');
if (!['pencil', 'ink'].includes(look)) throw new Error('--look pencil or ink (other looks: start from an example)');
mkdirSync(dest, {recursive: true});
for (const f of ['core.js', 'studio.js', 'cels.js', 'sketch.js', 'materials.js']) cpSync(path.join(root, 'assets', f), path.join(dest, f));
for (const f of ['render.mjs', 'review.mjs', 'package.json']) cpSync(path.join(root, 'scripts', f), path.join(dest, f));
cpSync(path.join(root, 'references/brief-template.md'), path.join(dest, 'brief.md'));
const [a, b] = ar.split(':').map(Number), W = a >= b ? Math.round(1080 * a / b) : 1080, H = a >= b ? 1080 : Math.round(1080 * b / a);
const film = readFileSync(path.join(root, 'assets/starter-film.html'), 'utf8')
  .replaceAll('__TITLE__', title).replaceAll('__AR__', ar).replaceAll('__LOOK__', look)
  .replaceAll('__W__', String(W)).replaceAll('__H__', String(H)).replaceAll('__WIDTH__', String(a >= b ? 1920 : 1080));
writeFileSync(path.join(dest, 'film.html'), film);
writeFileSync(path.join(dest, '.gitignore'), 'node_modules/\nout/\n');
console.log(`Film project: ${dest}
  cd ${dest}
  npm i --no-audit --no-fund
  node render.mjs film.html --grid 24        # composition
  node review.mjs film.html                  # motion report
  node render.mjs film.html                  # mp4 (+ score)
Fill brief.md first. Replace the starter drawings with your own keys.`);
