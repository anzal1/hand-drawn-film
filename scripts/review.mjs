// Film doctor: renders every frame small, measures it and writes a motion report an agent can read.
//   node review.mjs film.html [--out dir] [--look NAME] [--ar 9:16] [--jobs N] [--width 320]
// Writes <name>-review.md, <name>-review.json and <name>-review.png (motion-energy chart with flags
// and before/at/after thumbnails of each flagged frame). Exit code 0 even with warnings; read the report.
//
// What it measures (per frame, against the previous one):
//   energy   mean absolute luminance change; the film's motion graph
//   pops     a frame whose change is far above its neighbourhood, away from a cut
//   flicker  A-B-A frames: i differs from i-1 but i+1 returns to i-1 (strobing hatch, boiling noise)
//   blank    near-uniform frames (unrendered layer, cleared canvas, missing photo)
//   frozen   long runs of identical frames (stale scene, forgotten hold)
//   faint    ink contrast at thumbnail size (lines that vanish in a feed or after encoding)
//   pacing   shot lengths, holds before cuts and exposure (ones / twos / threes) per scene
import puppeteer from 'puppeteer-core';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2), flags = new Map(); let file;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { if (!['--out', '--look', '--ar', '--jobs', '--width'].includes(args[i])) throw new Error(`Unknown option: ${args[i]}`); flags.set(args[i], args[++i]); }
  else if (!file) file = args[i]; else throw new Error(`Unexpected argument: ${args[i]}`);
}
if (!file) throw new Error('Usage: node review.mjs film.html [--out dir] [--look NAME] [--jobs N]');
const name = path.basename(file, '.html'), out = path.resolve(flags.get('--out') || path.join(path.dirname(file), 'out'));
mkdirSync(out, {recursive: true});
const AW = Number(flags.get('--width') || 320), jobs = Number(flags.get('--jobs') || Math.max(1, Math.min(6, os.availableParallelism() - 1)));
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; if (existsSync(mac)) return mac;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) { try { return execFileSync('which', [bin], {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch {} }
  throw new Error('No Chrome found. Set CHROME=/path/to/chrome');
}
const url = pathToFileURL(path.resolve(file)); url.searchParams.set('bare', '1'); url.searchParams.set('frame', '0');
url.searchParams.set('w', String(flags.get('--width') ? AW * 2 : 640));   // measure a small render; thumbnails come from it too
for (const [f, q] of [['--look', 'look'], ['--ar', 'ar']]) if (flags.has(f)) url.searchParams.set(q, flags.get(f));
const browsers = [];
async function open() {
  const b = await puppeteer.launch({executablePath: findChrome(), headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']}); browsers.push(b);
  const page = await b.newPage(), errors = []; let fail; const failed = new Promise((_, rej) => { fail = rej; }); failed.catch(() => {});
  page.on('pageerror', e => { errors.push(String(e)); fail(new Error(`${file}: ${e.message || e}`)); });
  page.on('requestfailed', r => fail(new Error(`${file}: failed to load ${r.url()} (check script paths)`)));
  await page.goto(url.href, {waitUntil: 'load'});
  await Promise.race([failed, page.waitForFunction('window.__ready === true || window.__error', {timeout: 60000})]);
  const meta = await page.evaluate(() => ({N: window.__NDRAW, fps: window.__fps, error: window.__error, hooks: typeof window.__analyze, scenes: window.__scenes?.(), audio: !!window.__wav}));
  if (meta.error || errors.length) throw new Error(meta.error || errors.join('\n'));
  if (meta.hooks !== 'function') throw new Error('This film loads an old core.js without review hooks; copy the current assets/core.js');
  return {page, errors, meta};
}
const t0 = Date.now();
let meta, rows = [], thumbs = {};
try {
  const first = await open(); meta = first.meta; const N = meta.N;
  const n = Math.min(jobs, Math.max(1, Math.floor(N / 48))), chunk = Math.ceil(N / n);
  const pages = [first, ...await Promise.all(Array.from({length: n - 1}, open))];
  const parts = await Promise.all(pages.map(({page}, w) => page.evaluate(([a, b, aw]) => window.__analyze(a, b, aw), [w * chunk, Math.min(N, (w + 1) * chunk), AW])));
  rows = parts.flat().sort((a, b) => a.i - b.i);
  for (const {errors} of pages) if (errors.length) throw new Error(errors.join('\n'));
  // Findings are computed below; thumbnails are fetched for them afterwards with the first page.
  var page = first.page;
} catch (e) { await Promise.all(browsers.map(b => b.close())); console.error(`Review failed: ${e.message}`); process.exit(1); }

const {N, fps} = meta, scenes = meta.scenes, cuts = new Set(scenes.map(s => s.start));
const sec = i => (i / fps).toFixed(2) + 's', sceneOf = i => scenes.filter(s => s.start <= i).at(-1)?.name ?? '?';
const nearCut = (i, r = 1) => [...cuts].some(c => Math.abs(i - c) <= r);
const energy = rows.map(r => r.d1 ? r.d1.mad : 0);
const findings = [];
const cluster = (list, report, gap = fps) => { for (let k = 0; k < list.length;) { let j = k; while (j + 1 < list.length && list[j + 1] - list[j] <= gap) j++; report(list[k], list[j], j - k + 1); k = j + 1; } };
const add = (level, kind, frame, msg) => findings.push({level, kind, frame, time: frame == null ? null : +(frame / fps).toFixed(3), scene: frame == null ? null : sceneOf(frame), msg});

// Paper polarity and contrast. Light films: ink is darker than the median; night films the reverse.
const contrast = rows.map(r => Math.max(r.p50 - r.p1, r.p99 - r.p50));
const sorted = a => [...a].sort((x, y) => x - y), median = a => { const s = sorted(a); return s.length ? s[s.length >> 1] : 0; };
// blank frames, reported as runs
for (let i = 0, run = null; i <= rows.length; i++) {
  const blank = i < rows.length && rows[i].std < 2.5;
  if (blank && run === null) run = i;
  if (!blank && run !== null) { const edge = run === 0 || i === rows.length || [...cuts].some(c => c >= run - 3 && c <= i + 3);
    add(edge || i - run <= 2 ? 'info' : 'warn', 'blank', run, `${i - run} near-uniform frame(s) ${run}..${i - 1} (std < 2.5). ${edge ? 'At a cut or the film edge: fine if it is a deliberate fade, card or draw-on start.' : 'Mid-shot: a layer probably failed to draw.'}`); run = null; }
}
// frozen stretches: identical frames (mad == 0) for long runs, skipping the final hold
for (let i = 1, run = null; i <= rows.length; i++) {
  const still = i < rows.length && rows[i].d1 && rows[i].d1.mad < .02;
  if (still && run === null) run = i - 1;
  if (!still && run !== null) { const len = i - run, s = len / fps; if (s >= 2.5 && i < rows.length) add(s >= 4 ? 'warn' : 'info', 'frozen', run, `${len} identical frames (${s.toFixed(1)} s) from ${run}. A held drawing this long reads as a stalled film unless the moment asks for stillness; add a moving hold, a blink or a camera drift.`); run = null; }
}
// pops: spikes relative to the local neighbourhood, not at a cut
const hardCuts = [], wholeFrame = [], pops = [];
for (let i = 2; i < rows.length - 1; i++) {
  if (nearCut(i, 3)) continue;
  // Compare with the busiest neighbour within 4 frames, so an action on twos or threes is not a pop.
  const e = energy[i], nb = Math.max(.05, ...[-4, -3, -2, -1, 1, 2, 3, 4].map(k => energy[i + k] ?? 0));
  const ch = k => rows[k]?.d1?.changed ?? 0;
  if (ch(i) > .25) { if (ch(i - 1) < .1 && ch(i + 1) < .1) hardCuts.push(i); else wholeFrame.push(i); continue; }   // a cut inside the scene, or a whip/fast pan
  if (e > .8 && e > nb * 4 && ch(i) > .01) pops.push({i, e, nb});
}
// Spikes that recur at a fixed interval are a boil cycle, reported once per scene.
for (const s of scenes) {
  // A boil shows as whole-drawing spikes at a fixed period. Look for the period among all spikes in the
  // scene, not only the pop candidates: motion between boil steps can hide most of them from the pop test.
  const end = scenes[scenes.indexOf(s) + 1]?.start ?? N, sceneE = energy.slice(s.start + 1, end), base = median(sceneE.filter(v => v > .02)) || .02;
  const spikes = []; for (let i = s.start + 2; i < end - 1; i++) if (energy[i] > .4 && energy[i] > base * 2.5 && energy[i] > energy[i - 1] * 2 && energy[i] > energy[i + 1] * 2) spikes.push(i);
  const sg = spikes.slice(1).map((v, k) => v - spikes[k]), sper = median(sg), cycle = spikes.length >= 4 && sper >= 3 && sg.filter(g => g % sper === 0 && g <= sper * 3).length >= sg.length * .6;
  const inS = pops.filter(p => sceneOf(p.i) === s.name && !(cycle && spikes.some(q => Math.abs(q - p.i) <= 1))), gaps = inS.slice(1).map((p, k) => p.i - inS[k].i), per = median(gaps);
  if (cycle) add('info', 'boil', spikes[0], `scene "${s.name}": whole-drawing changes every ~${sper} frames (${(sper / fps).toFixed(2)} s), ${spikes.length} seen. A deliberate boil cycle reads as living line; unwanted, it reads as jitter.`);
  const periodic = inS.length >= 3 && gaps.filter(g => Math.abs(g - per) <= 1).length >= gaps.length * .6;
  if (periodic) add('info', 'boil', inS[0].i, `scene "${s.name}": ${inS.length} whole-drawing changes every ~${per} frames (${(per / fps).toFixed(2)} s). A deliberate boil cycle reads as living line; unwanted, it reads as jitter. Hold the drawing when nothing moves.`);
  else for (const {i, e, nb} of inS) add(e > nb * 8 ? 'warn' : 'info', 'pop', i, `frame ${i} changes ${(e / nb).toFixed(1)}x more than any frame within 4 of it (energy ${e.toFixed(2)}). A drawing that snaps, a layer popping on, or a missing inbetween.`);
}
cluster(wholeFrame, (a, b, count) => { if (count >= 4) add('info', 'whip', a, `the whole frame changes for ${count} frames between ${a} and ${b}: a whip, flash or fast pan. Deliberate whips are fine; a slow pan that moves more than ~1/40 of the frame per frame will judder at 24 fps.`); }, 2);
// flicker: A-B-A where i+1 returns to i-1. Clusters within a second are one finding.
const flick = [];
for (let i = 1; i < rows.length - 1; i++) {
  const a = rows[i].d1, b = rows[i + 1].d1, back = rows[i + 1].d2;
  if (a && b && back && a.mad > .35 && b.mad > .35 && back.mad < Math.min(a.mad, b.mad) * .25 && !nearCut(i) && !nearCut(i + 1)) flick.push(i);
}
// Whole-frame changes with no strongly changed pixel are texture (paper grain, raster phase), not marks.
const subtle = i => rows[i].d1.changed < .002 && rows[i + 1].d1.changed < .002;
cluster(flick.filter(i => !subtle(i)), (a, b, count) => add(count >= 3 ? 'warn' : 'info', 'flicker', a, `${count} A-B-A frame(s) from ${a} to ${b}: a mark or layer alternates and returns. Boil should cycle through 3+ drawings, not toggle between two. A single one can be a blink.`));
cluster(flick.filter(subtle), (a, b, count) => add('info', 'shimmer', a, `${count} A-B-A frame(s) from ${a} to ${b} change the whole frame faintly with no strong edge: paper grain or a raster toggling. Tie the texture to the paper (one seed) unless the crawl is wanted.`));
const cMed = median(contrast);
// pacing and exposure per scene
const sceneStats = scenes.map((s, k) => {
  const end = k + 1 < scenes.length ? scenes[k + 1].start : N, r = rows.slice(s.start, end), e = energy.slice(s.start + 1, end);
  const runs = []; let len = 1; for (let i = s.start + 1; i < end; i++) { if (rows[i].d1.mad < .02) len++; else { runs.push(len); len = 1; } } runs.push(len);
  const moving = runs.filter(l => l <= 4), ex = [1, 2, 3, 4].map(l => moving.filter(m => m === l).length), tot = moving.length || 1;
  const boxes = r.map(x => x.d1?.box).filter(Boolean), edge = boxes.filter(b => b[0] < .01 || b[1] < .01 || b[2] > .99 || b[3] > .99).length / (boxes.length || 1);
  return {name: s.name, start: s.start, frames: end - s.start, seconds: +((end - s.start) / fps).toFixed(2), meanEnergy: +(e.reduce((a, b) => a + b, 0) / (e.length || 1)).toFixed(3), exposure: {ones: +(ex[0] / tot).toFixed(2), twos: +(ex[1] / tot).toFixed(2), threes: +(ex[2] / tot).toFixed(2), fours: +(ex[3] / tot).toFixed(2)}, edgeMotion: +edge.toFixed(2), contrast: median(contrast.slice(s.start, end))};
});
for (const s of sceneStats) {
  if (s.seconds < .75 && scenes.length > 1) add('info', 'short-shot', s.start, `scene "${s.name}" lasts ${s.seconds}s. Under ~0.75 s a shot only reads as a flash; intended for a montage?`);
  if (s.contrast < 80 && s.frames > fps) add(s.contrast < 50 ? 'warn' : 'info', 'faint', s.start, `scene "${s.name}": median ink contrast at ${AW}px is ${s.contrast}/255. Lines wash out in a feed and after encoding; raise stroke weight or darken the ink (line films read best at 110+). Ignore for a deliberately pale card.`);
  const inner = hardCuts.filter(i => i > s.start && i < s.start + s.frames);
  if (inner.length) add('info', 'cuts', inner[0], `scene "${s.name}" contains ${inner.length} hard cut(s) at ${inner.slice(0, 12).join(', ')}${inner.length > 12 ? ', ...' : ''}. Montage cards or flashes; each image should stay up long enough to read (about 6+ frames).`);
}
// the last shot should settle before the film ends
const tail = energy.slice(-Math.round(fps * .5)), tailE = tail.reduce((a, b) => a + b, 0) / (tail.length || 1);
if (tailE > 1.2) add('info', 'ending', N - 1, `the last half second is still moving (energy ${tailE.toFixed(2)}). Endings usually read better with a hold of 0.5 to 1.5 s.`);

// thumbnails for warnings (and the first infos), then the report image
const shown = findings.filter(f => f.frame != null).sort((a, b) => (a.level === 'warn' ? 0 : 1) - (b.level === 'warn' ? 0 : 1)).slice(0, 8);
try {
  thumbs = await page.evaluate(async (list, NN) => {
    const o = {}; for (const f of list) for (const i of [f - 1, f, f + 1]) if (i >= 0 && i < NN && !o[i]) { window.__drawFrame(i); const c = document.createElement('canvas'), src = document.getElementById('c'); c.width = 200; c.height = Math.round(200 * src.height / src.width); const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(downscale(src, c.width, c.height), 0, 0, c.width, c.height); o[i] = c.toDataURL('image/jpeg', .85); }
    return o;
  }, shown.map(f => f.frame), N);
  const png = await page.evaluate(({energy, contrast, scenes, fps, shown, thumbs, N}) => {
    const W = 1400, CH = 220, TH = 112, rowH = TH + 30, H = 40 + CH + 40 + 60 + shown.length * rowH + 20, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#121212'; g.fillRect(0, 0, W, H); g.font = '13px ui-monospace, Menlo, monospace';
    const x0 = 50, x1 = W - 20, X = i => x0 + (x1 - x0) * i / Math.max(1, N - 1), top = 30, emax = Math.max(1, ...energy.map(e => Math.min(e, 40)));
    scenes.forEach((s, k) => { const a = X(s.start), b = X(k + 1 < scenes.length ? scenes[k + 1].start : N - 1); g.fillStyle = k % 2 ? '#1c1c1c' : '#232323'; g.fillRect(a, top, b - a, CH); g.fillStyle = '#888'; g.save(); g.beginPath(); g.rect(a, 0, b - a, top); g.clip(); g.fillText(s.name, a + 4, top - 8); g.restore(); });
    g.strokeStyle = '#6fb3ff'; g.lineWidth = 1.2; g.beginPath(); energy.forEach((e, i) => { const y = top + CH - CH * Math.min(e, emax) / emax; i ? g.lineTo(X(i), y) : g.moveTo(X(i), y); }); g.stroke();
    g.strokeStyle = 'rgba(255,209,102,.8)'; g.beginPath(); contrast.forEach((c, i) => { const y = top + CH - CH * c / 255; i ? g.lineTo(X(i), y) : g.moveTo(X(i), y); }); g.stroke();
    g.fillStyle = '#6fb3ff'; g.fillText('motion energy', x0, top + CH + 18); g.fillStyle = '#ffd166'; g.fillText('ink contrast (0-255)', x0 + 140, top + CH + 18); g.fillStyle = '#ff6b6b'; g.fillText('warn', x0 + 330, top + CH + 18); g.fillStyle = '#c9a0ff'; g.fillText('info', x0 + 380, top + CH + 18);
    g.fillStyle = '#777'; for (let s = 0; s <= N / fps; s += Math.max(1, Math.round(N / fps / 12))) g.fillText(s + 's', X(s * fps) - 8, top + CH + 36);
    shown.forEach((f, k) => { g.fillStyle = f.level === 'warn' ? '#ff6b6b' : '#c9a0ff'; g.fillRect(X(f.frame) - 1, top, 2, CH); g.fillText(String(k + 1), X(f.frame) + 3, top + 12 + (k % 4) * 13); });
    const imgs = Object.fromEntries(Object.entries(thumbs).map(([i, src]) => { const im = new Image(); im.src = src; return [i, im]; }));
    return Promise.all(Object.values(imgs).map(im => im.decode())).then(() => {
      shown.forEach((f, k) => { const y = top + CH + 60 + k * rowH; g.fillStyle = f.level === 'warn' ? '#ff6b6b' : '#c9a0ff'; g.fillText(`${k + 1}. ${f.level.toUpperCase()} ${f.kind} @ ${f.frame} (${(f.frame / fps).toFixed(2)}s) ${f.scene}`, x0, y);
        [f.frame - 1, f.frame, f.frame + 1].forEach((i, j) => { const im = imgs[i]; if (!im) return; const w = TH * im.width / im.height; g.drawImage(im, x0 + j * (w + 8), y + 8, w, TH); g.fillStyle = '#aaa'; g.fillText(String(i), x0 + j * (w + 8) + 3, y + 8 + TH - 4); });
        g.fillStyle = '#ccc'; const words = f.msg.split(' '); let line = '', ly = y + 24; const tx = x0 + 3 * (TH * 16 / 9 + 8) + 16; for (const wd of words) { if (g.measureText(line + wd).width > x1 - tx) { g.fillText(line, tx, ly); ly += 16; line = ''; } line += wd + ' '; } g.fillText(line, tx, ly); });
      return cv.toDataURL('image/png');
    });
  }, {energy, contrast, scenes, fps, shown, thumbs, N});
  writeFileSync(path.join(out, `${name}-review.png`), Buffer.from(png.split(',')[1], 'base64'));
} finally { await Promise.all(browsers.map(b => b.close())); }

const warn = findings.filter(f => f.level === 'warn'), info = findings.filter(f => f.level === 'info');
const report = {file: path.resolve(file), frames: N, fps, seconds: +(N / fps).toFixed(2), audio: meta.audio, analysedWidth: AW, contrastMedian: cMed, scenes: sceneStats, findings, seconds_taken: (Date.now() - t0) / 1000};
writeFileSync(path.join(out, `${name}-review.json`), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(out, `${name}-review-frames.json`), JSON.stringify(rows.map(r => ({i: r.i, energy: r.d1 ? +r.d1.mad.toFixed(3) : 0, changed: r.d1 ? +r.d1.changed.toFixed(4) : 0, back2: r.d2 ? +r.d2.mad.toFixed(3) : null, contrast: Math.max(r.p50 - r.p1, r.p99 - r.p50), std: r.std, box: r.d1?.box?.map(v => +v.toFixed(3)) ?? null}))) + '\n');
const pct = v => Math.round(v * 100) + '%';
const md = [`# Review: ${name}`, '', `${N} frames at ${fps} fps (${report.seconds}s), ${scenes.length} scene(s), audio: ${meta.audio ? 'yes' : 'no'}, ink contrast median ${cMed}/255 at ${AW}px.`,
  `**${warn.length} warning(s), ${info.length} note(s).** Chart and flagged frames: \`${name}-review.png\`. These are measurements, not taste: confirm each one by eye with --strip or --onion around the frame.`, '',
  '| scene | start | seconds | energy | ones | twos | threes | 4+ held | contrast |', '|---|---|---|---|---|---|---|---|---|',
  ...sceneStats.map(s => `| ${s.name} | ${s.start} | ${s.seconds} | ${s.meanEnergy} | ${pct(s.exposure.ones)} | ${pct(s.exposure.twos)} | ${pct(s.exposure.threes)} | ${pct(s.exposure.fours)} | ${s.contrast} |`), '',
  ...(findings.length ? findings.map(f => `- **${f.level}** \`${f.kind}\`${f.frame != null ? ` @ frame ${f.frame} (${f.time}s, ${f.scene})` : ''}: ${f.msg}${f.frame != null ? `  \n  check: \`node scripts/render.mjs ${file} --strip ${Math.max(0, f.frame - 6)},12\`` : ''}`) : ['No findings. Still watch it at normal speed.']), ''].join('\n');
writeFileSync(path.join(out, `${name}-review.md`), md);
console.log(md);
console.log(`Review written to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
