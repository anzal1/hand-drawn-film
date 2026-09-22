// Offline Canvas renderer.
//   --grid N              N evenly spaced frames on one sheet (composition overview)
//   --strip START,COUNT   consecutive frames on one sheet (spacing, contacts)
//   --onion START,COUNT[,STEP]  frames overlaid, tinted blue->red, with a centroid spacing trail
//   --only 0,24           full-size spot frames
//   --ar / --width        override the film's format only when supplied
//   --look NAME           passed through to films that support several looks
//   --jobs N              parallel browser pages for a full render (default: min(6, cores-1))
// Frames are deterministic after seeking, so a full render splits the film into contiguous chunks.
import puppeteer from 'puppeteer-core';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2), flags = new Map();
const known = ['--out', '--ar', '--width', '--grid', '--strip', '--only', '--look', '--onion', '--jobs'];
let file;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    if (!known.includes(args[i])) throw new Error(`Unknown option: ${args[i]} (known: ${known.join(' ')})`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${args[i]}`);
    flags.set(args[i], args[++i]);
  } else if (!file) file = args[i]; else throw new Error(`Unexpected argument: ${args[i]}`);
}
if (!file) throw new Error('Usage: node render.mjs film.html [--grid 24 | --strip 48,12 | --onion 48,12 | --only 0,24] [--jobs 4] [--out dir]');
const integer = (v, name, min = 1, max = 16384) => {
  const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name}: expected integer ${min}..${max}`); return n;
};
const only = flags.has('--only') ? flags.get('--only').split(',').map(v => integer(v, 'frame', 0, 1e7)) : null;
const grid = flags.has('--grid') ? integer(flags.get('--grid'), 'grid', 1, 240) : null;
const strip = flags.has('--strip') ? flags.get('--strip').split(',').map(Number) : null;
if (strip && (strip.length !== 2 || !Number.isInteger(strip[0]) || strip[0] < 0 || !Number.isInteger(strip[1]) || strip[1] < 1 || strip[1] > 240)) throw new Error('--strip expects START_FRAME,COUNT (count 1..240)');
const onion = flags.has('--onion') ? flags.get('--onion').split(',').map(Number) : null;
if (onion && (onion.length < 2 || onion.length > 3 || !onion.every(Number.isInteger) || onion[0] < 0 || onion[1] < 2 || onion[1] > 96 || (onion[2] ?? 1) < 1)) throw new Error('--onion expects START,COUNT[,STEP] (count 2..96)');
if ([only, grid, strip, onion].filter(Boolean).length > 1) throw new Error('Choose only one of --only, --grid, --strip, --onion');
const jobs = flags.has('--jobs') ? integer(flags.get('--jobs'), 'jobs', 1, 32) : Math.max(1, Math.min(6, os.availableParallelism() - 1));
const preview = !!(only || grid || strip || onion), name = path.basename(file, '.html');
const out = path.resolve(flags.get('--out') || path.join(path.dirname(file), 'out'));
mkdirSync(out, {recursive: true});
// Every full render owns a new frame directory. Failed attempts retain their files for diagnosis.
const work = preview ? out : mkdtempSync(path.join(out, `.${name}-render-`));
const frames = path.join(work, `${name}-frames`); mkdirSync(frames, {recursive: true});
const url = pathToFileURL(path.resolve(file)); url.searchParams.set('bare', '1'); url.searchParams.set('frame', '0');
if (flags.has('--ar')) {
  const ar = flags.get('--ar'); if (!/^\d+(?:\.\d+)?[:x/]\d+(?:\.\d+)?$/.test(ar) || ar.split(/[:x/]/).some(v => Number(v) <= 0)) throw new Error('Invalid aspect ratio');
  url.searchParams.set('ar', ar);
}
if (flags.has('--width')) url.searchParams.set('w', integer(flags.get('--width'), 'width', 2));
if (flags.has('--look')) url.searchParams.set('look', flags.get('--look'));
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; if (existsSync(mac)) return mac;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [bin], {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch {}
  }
  throw new Error('No Chrome found. Set CHROME=/path/to/chrome');
}
const save = (f, data) => writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
const ff = argv => execFileSync('ffmpeg', ['-v', 'error', '-y', ...argv], {stdio: 'inherit'});
// One browser process per worker: pages of one file:// origin would otherwise share a renderer.
const browsers = [], launch = async () => { const b = await puppeteer.launch({executablePath: findChrome(), headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']}); browsers.push(b); return b; };
async function open() {
  const page = await (await launch()).newPage(), errors = [];
  let fail; const failed = new Promise((_, rej) => { fail = rej; }); failed.catch(() => {});
  page.on('pageerror', e => { errors.push(String(e)); fail(new Error(`${file}: ${e.message || e}`)); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => { errors.push(`failed to load ${r.url()}`); fail(new Error(`${file}: failed to load ${r.url()} (check script paths)`)); });
  await page.goto(url.href, {waitUntil: 'load'});
  // Fail fast on a script error instead of waiting out the timeout.
  await Promise.race([failed, page.waitForFunction('window.__ready === true || window.__error', {timeout: 60000}).catch(() => { throw new Error(`${file} never set window.__ready: is it a film that calls defineFilm()?`); })]);
  const meta = await page.evaluate(() => ({N: window.__NDRAW, fps: window.__fps, size: window.__size, error: window.__error, onion: typeof window.__onion}));
  if (meta.error || errors.length) throw new Error(meta.error || errors.join('\n'));
  return {page, errors, meta};
}
let N, fps, size, hasAudio = false;
const t0 = Date.now();
try {
  const first = await open(), {page, errors} = first;
  ({N, fps, size} = first.meta);
  if (!Number.isInteger(N) || N <= 0 || ![12, 24].includes(fps)) throw new Error('Invalid film frame count or fps');
  console.log(`${name}: ${N} frames, ${fps} fps, ${size.w}x${size.h}`);
  if (only?.some(i => i >= N) || strip && strip[0] + strip[1] > N || onion && onion[0] >= N) throw new Error(`Requested frames outside film (0..${N - 1})`);
  if (grid) save(path.join(out, `${name}-grid.jpg`), await page.evaluate(n => window.__grid(n), grid));
  if (strip) save(path.join(out, `${name}-strip-${strip[0]}.jpg`), await page.evaluate(([a, b]) => window.__strip(a, b), strip));
  if (onion) {
    if (first.meta.onion !== 'function') throw new Error('This film loads an old core.js without window.__onion; copy the current assets/core.js');
    const f = path.join(out, `${name}-onion-${onion[0]}.png`);
    save(f, await page.evaluate(([a, b, s]) => window.__onion(a, b, s ?? 1, 1280), onion)); console.log(`Onion: ${f}`);
  }
  if (only) for (const i of only) save(path.join(frames, `${String(i).padStart(4, '0')}.png`), await page.evaluate(i => window.__frame(i), i));
  if (!preview) {
    // Contiguous chunks keep simulation checkpoints (sand) warm within each worker.
    const n = Math.min(jobs, Math.max(1, Math.floor(N / 24))), chunk = Math.ceil(N / n);
    const pages = [first, ...await Promise.all(Array.from({length: n - 1}, open))];
    let done = 0;
    await Promise.all(pages.map(async ({page, errors}, w) => {
      for (let i = w * chunk; i < Math.min(N, (w + 1) * chunk); i++) {
        save(path.join(frames, `${String(i).padStart(4, '0')}.png`), await page.evaluate(i => window.__frame(i), i));
        if (errors.length) throw new Error(`Frame ${i}: ${errors.join('\n')}`);
        if (++done % 120 === 0 || done === N) console.log(`Rendered ${done}/${N}${n > 1 ? ` on ${n} pages` : ''}`);
      }
    }));
    const wav = await page.evaluate(() => window.__wav ? window.__wav() : null);
    if (wav) { writeFileSync(path.join(work, `${name}-score.wav`), Buffer.from(wav, 'base64')); hasAudio = true; }
  }
  if (errors.length) throw new Error(errors.join('\n'));
} catch (e) {
  console.error(`Render failed: ${e.message}\nDiagnostic files: ${work}`); await Promise.all(browsers.map(b => b.close())); process.exit(1);
} finally { await Promise.all(browsers.map(b => b.close())); }
if (!preview) {
  const duration = N / fps, outputFrames = N * 24 / fps, mp4 = path.join(work, `${name}.mp4`);
  ff(['-framerate', String(fps), '-i', path.join(frames, '%04d.png'), '-vf', 'fps=24', '-frames:v', String(outputFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', mp4]);
  ff(['-i', mp4, '-vf', `fps=2,scale=240:-2,tile=6x${Math.max(1, Math.ceil(duration * 2 / 6))}`, '-frames:v', '1', path.join(work, `${name}-contact.jpg`)]);
  if (hasAudio) ff(['-i', mp4, '-i', path.join(work, `${name}-score.wav`), '-map', '0:v:0', '-map', '1:a:0', '-af', 'apad', '-t', String(duration), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(work, `${name}-final.mp4`)]);
  writeFileSync(path.join(work, `${name}-render.json`), JSON.stringify({file: path.resolve(file), fps, frames: N, outputFps: 24, outputFrames, duration, size, look: flags.get('--look') || null, audio: hasAudio, seconds: (Date.now() - t0) / 1000}, null, 2) + '\n');
  // Publish only completed outputs; remove stale companions only for this exact film.
  for (const suffix of ['-frames', '.mp4', '-contact.jpg', '-score.wav', '-final.mp4', '-render.json']) {
    const dest = path.join(out, name + suffix), src = path.join(work, name + suffix);
    if (suffix === '-frames') rmSync(dest, {recursive: true, force: true});
    if (existsSync(src)) renameSync(src, dest); else rmSync(dest, {force: true});
  }
  rmSync(work, {recursive: true, force: true});
  console.log(`Finished in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${path.join(out, name + (hasAudio ? '-final.mp4' : '.mp4'))}`);
} else console.log(`Preview: ${out}`);
