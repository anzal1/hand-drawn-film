'use strict';
// Authoring helpers for whole-drawing animation. Load after core.js, studio.js and cels.js.
//   svgPoints / svgCel   design curves as SVG path data instead of hand-typed point lists
//   boilCels             a few redrawn variants of one drawing for a living hold (landmarks pinned)
//   spacing              classic spacing charts for the inbetweens between two keys
//   sheetBuilder         keys, passages, holds and boils on one exposure sheet with root placement
//   celSprite            render a compiled cel once per output scale, bounded cache
// Nothing here reads the output frame number. Every drawing is made once and held.

// ---------- SVG path data -> polylines ----------
// Supports M L H V C S Q T A Z in absolute and relative forms. Returns one point list per subpath,
// sampled about every `step` logical units, plus whether each subpath was closed.
function svgPoints(d, {step = 4, scale = 1, offset = [0, 0]} = {}) {
  const tokens = String(d).match(/[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  if (!tokens.length || !/[Mm]/.test(tokens[0])) throw new Error('svgPoints: path data must start with M');
  const subs = []; let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, prev = '';
  const num = () => { const v = Number(tokens[i++]); if (!Number.isFinite(v)) throw new Error('svgPoints: expected a number near token ' + i); return v; };
  const isNum = () => i < tokens.length && !/[A-Za-z]/.test(tokens[i]);
  const push = p => cur.pts.push(p);
  const sample = (f, len) => { const n = Math.max(2, Math.ceil(len / step)); for (let k = 1; k <= n; k++) push(f(k / n)); };
  const cubic = (p0, p1, p2, p3) => sample(t => bez(p0, p1, p2, p3, t), Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
  const quad = (p0, p1, p2) => sample(t => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; }, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++]; else if (!cmd) throw new Error('svgPoints: missing command');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { cur.close = true; x = sx; y = sy; } prev = C; cmd = ''; continue; }
    if (C === 'M') { cur = {pts: [], close: false}; subs.push(cur); x = ox + num(); y = oy + num(); sx = x; sy = y; push([x, y]); cmd = rel ? 'l' : 'L'; prev = 'M'; if (!isNum()) cmd = ''; continue; }
    if (!cur) throw new Error('svgPoints: drawing command before M');
    const p0 = [x, y];
    if (C === 'L') { x = ox + num(); y = oy + num(); sample(t => [lerp(p0[0], x, t), lerp(p0[1], y, t)], Math.hypot(x - p0[0], y - p0[1])); }
    else if (C === 'H') { x = ox + num(); sample(t => [lerp(p0[0], x, t), y], Math.abs(x - p0[0])); }
    else if (C === 'V') { y = oy + num(); sample(t => [x, lerp(p0[1], y, t)], Math.abs(y - p0[1])); }
    else if (C === 'C') { const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); cubic(p0, p1, p2, [x, y]); cx = p2[0]; cy = p2[1]; }
    else if (C === 'S') { const p1 = 'CS'.includes(prev) ? [2 * x - cx, 2 * y - cy] : p0, p2 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); cubic(p0, p1, p2, [x, y]); cx = p2[0]; cy = p2[1]; }
    else if (C === 'Q') { const p1 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); quad(p0, p1, [x, y]); cx = p1[0]; cy = p1[1]; }
    else if (C === 'T') { const p1 = 'QT'.includes(prev) ? [2 * x - cx, 2 * y - cy] : p0; x = ox + num(); y = oy + num(); quad(p0, p1, [x, y]); cx = p1[0]; cy = p1[1]; }
    else if (C === 'A') {
      let rx = Math.abs(num()), ry = Math.abs(num()); const phi = num() * Math.PI / 180, large = num(), sweep = num(); x = ox + num(); y = oy + num();
      const cp = Math.cos(phi), sp = Math.sin(phi), dx = (p0[0] - x) / 2, dy = (p0[1] - y) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
      if (!rx || !ry) { sample(t => [lerp(p0[0], x, t), lerp(p0[1], y, t)], Math.hypot(x - p0[0], y - p0[1])); }
      else {
        const L = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
        const sgn = large === sweep ? -1 : 1, num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, co = sgn * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
        const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx, ccx = cp * cxp - sp * cyp + (p0[0] + x) / 2, ccy = sp * cxp + cp * cyp + (p0[1] + y) / 2;
        const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry); let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
        if (!sweep && dt > 0) dt -= TAU; else if (sweep && dt < 0) dt += TAU;
        sample(t => { const a = t1 + dt * t; return [ccx + rx * Math.cos(a) * cp - ry * Math.sin(a) * sp, ccy + rx * Math.cos(a) * sp + ry * Math.sin(a) * cp]; }, Math.abs(dt) * Math.max(rx, ry));
      }
    }
    else throw new Error('svgPoints: unsupported command ' + cmd);
    prev = C; if (!isNum()) cmd = '';
  }
  return subs.filter(s => s.pts.length > 1).map(s => {
    const pts = s.pts.map(([px, py]) => [px * scale + offset[0], py * scale + offset[1]]);
    if (s.close && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < step * .5 * scale) pts.pop();
    return {points: pts, close: s.close};
  });
}

// svgCel: a raw cel from named path data. A value is a path string or {d, width, opacity, fill, pressure, corner, color}.
// Multi-subpath strings become strokes 'name', 'name/1', 'name/2'. Order = painter's order (back first).
// Keep the same names, subpath counts and command structure across keys and inbetweenCel can morph them;
// set `points` (a fixed sample count per stroke) so point lists match even when curve lengths differ.
function svgCel(parts, {step = 4, scale = 1, offset = [0, 0], width = 1.7, pressure, points} = {}) {
  const strokes = [];
  for (const [name, spec] of Object.entries(parts)) {
    const o = typeof spec === 'string' ? {d: spec} : spec, subs = svgPoints(o.d, {step: o.step ?? step, scale, offset});
    subs.forEach((sp, k) => {
      const n = o.points ?? points, pts = n ? resample(sp.points, n, sp.close) : sp.points;
      const {d, step: _s, points: _p, ...style} = o;
      strokes.push({id: k ? `${name}/${k}` : name, points: pts, close: sp.close, width: o.width ?? width, ...(pressure || o.pressure ? {pressure: o.pressure ?? pressure} : {}), ...style});
    });
  }
  return {strokes};
}
// resample: n points at equal arc length along a polyline (closed paths wrap).
function resample(pts, n, close = false) {
  if (n < 2) throw new Error('resample needs n >= 2');
  const p = motionPath(pts, {smooth: false, closed: close}), m = close ? n : n - 1;
  return Array.from({length: n}, (_, k) => p.at(k / m).p);
}

// ---------- boil: a living hold ----------
// n redrawn variants of one raw cel. Each stroke is displaced along its normal by low-frequency
// noise (a hand retracing, not static on a TV). `pin` keeps stroke endpoints fixed so joins,
// contacts and eyes stay registered; `keep` lists stroke ids (prefixes) that never move.
// Cycle variants on threes or fours (see sheetBuilder.hold); boiling on ones reads as vibration.
function boilCels(raw, n = 3, {amp = 1.1, seed = 1, pin = true, keep = [], freq = 1.6} = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error('boilCels needs n >= 2');
  const still = id => keep.some(k => id === k || id.startsWith(k + '/'));
  return Array.from({length: n}, (_, v) => ({strokes: raw.strokes.map(s => {
    if (still(s.id) || s.points.length < 2) return s;
    const L = s.points.length, sd = strokeSeed(s.id) + (seed + v) * 7919, len = pathLength(s.points, s.close) || 1, k = amp * Math.min(1, Math.sqrt(len / 40));
    return {...s, points: s.points.map((p, i) => {
      const u = s.close ? i / L : i / (L - 1), prev = s.points[Math.max(0, i - 1)], next = s.points[Math.min(L - 1, i + 1)];
      const tx = next[0] - prev[0], ty = next[1] - prev[1], tl = Math.hypot(tx, ty) || 1, env = pin && !s.close ? Math.sin(Math.PI * u) : 1;
      const dn = noise1(u * freq * Math.max(1, len / 120), sd) * k * env, dt = noise1(u * freq + 5.3, sd + 11) * k * .35 * env;
      return [p[0] - ty / tl * dn + tx / tl * dt, p[1] + tx / tl * dn + ty / tl * dt];
    })};
  })}));
}

// ---------- spacing charts ----------
// n inbetween positions strictly between two keys (0 and 1). The shape of the chart is the acting:
//   'even'       constant speed (mechanical, a motor, a ball in flight horizontally)
//   'slowOut'    leaves the first key gently, arrives fast (a fall, a punch, a drop)
//   'slowIn'     leaves fast, cushions into the second key (a catch, a landing settle, a head turn)
//   'slowInOut'  eases out of and into both keys (most character moves)
//   'thirds'     classic favouring: each drawing covers 2/3 of the remaining gap into the key
function spacing(n, kind = 'slowInOut') {
  if (!Number.isInteger(n) || n < 1) throw new Error('spacing needs n >= 1');
  const x = Array.from({length: n}, (_, k) => (k + 1) / (n + 1));
  const f = {even: t => t, slowOut: t => t * t, slowIn: t => 1 - (1 - t) * (1 - t), slowInOut: t => .5 - .5 * Math.cos(Math.PI * t)}[kind];
  if (kind === 'thirds') { let u = 0; return x.map(() => (u += (1 - u) * 2 / 3)).map(v => +v.toFixed(4)); }
  if (!f) throw new Error('spacing kind: even | slowOut | slowIn | slowInOut | thirds');
  return x.map(t => +f(t).toFixed(4));
}

// ---------- exposure sheet builder ----------
// const sb = sheetBuilder({library: RAW});             RAW = {rest: rawCel, lean: rawCel, ...}
// sb.key('rest', 16)                                    a key held 16 frames at placement [0,0]
//   .between('rest', 'lean', spacing(3), 2)             3 inbetweens on twos; placement interpolates
//   .key('lean', 6, [30, 0])                            (or .key('lean', rawCel, 6, [30, 0]) without a library)
//   .hold('lean', 24, {boil: 3, every: 4})              a living hold: 3 boil variants on fours
//   .put('blink', 3, [30, 0])                           a replacement drawing (new topology)
//   .mark('contact')                                    name the current frame, for props and sound cues
// const film = sb.build();  film.at(tau) -> {id, drawing, place:[x,y], raw}; film.duration
// film.marks.contact -> frame; film.time('contact') -> seconds
function sheetBuilder({fps = 24, library = {}} = {}) {
  const raws = {}, entries = [], place = {}, lastPlace = {}, marks = {};   // place: last placement per id, for passages
  const frameNow = () => entries.reduce((a, e) => a + e.frames, 0);
  const api = {
    // put(id, raw, frames, at) or, with a library, put(id, frames, at)
    put(id, raw, frames, at = [0, 0]) {
      if (typeof raw === 'number') { at = frames ?? at; frames = raw; raw = library[id]; if (!raw) throw new Error(`sheetBuilder: "${id}" is not in the library`); }
      if (!Number.isInteger(frames) || frames < 1) throw new Error(`sheetBuilder: "${id}" needs a positive integer frame count`);
      if (raws[id] && raws[id] !== raw) throw new Error(`sheetBuilder: drawing id "${id}" reused for a different drawing`);
      raws[id] = raw; place[id] = at; lastPlace[id] = at; entries.push({id, frames, at}); return api;
    },
    key(id, raw, frames, at) { return api.put(id, raw, frames, at); },
    // Re-expose an existing drawing; with boil, alternate n variants every `every` frames.
    hold(id, frames, {boil = 0, every = 3, amp = 1.1, seed = 1, keep = [], at} = {}) {
      if (!raws[id] && library[id]) { raws[id] = library[id]; lastPlace[id] = at ?? [0, 0]; }
      if (!raws[id]) throw new Error(`sheetBuilder.hold: unknown drawing "${id}"`);
      const p = at ?? lastPlace[id];
      if (!boil) { const hid = `${id}@${entries.length}`; raws[hid] = raws[id]; place[hid] = p; entries.push({id: hid, frames, at: p}); return api; }
      const vars = boilCels(raws[id], boil, {amp, seed: seed + entries.length, keep});
      for (let f = 0, k = 0; f < frames; f += every, k++) { const vid = `${id}~${entries.length}`; raws[vid] = vars[k % boil]; place[vid] = p; entries.push({id: vid, frames: Math.min(every, frames - f), at: p}); }
      return api;
    },
    between(a, b, us, frames = 2, {from, to, raws: rb} = {}) {
      const A = raws[a] ?? library[a], B = rb?.[b] ?? raws[b] ?? pending[b] ?? library[b];
      if (!A) throw new Error(`sheetBuilder.between: unknown drawing "${a}"`);
      if (!B) throw new Error(`sheetBuilder.between: unknown drawing "${b}"; pass sheetBuilder({library}) or sb.draw("${b}", raw)`);
      const p0 = from ?? lastPlace[a] ?? [0, 0], p1 = to ?? pendingPlace[b] ?? lastPlace[b] ?? p0;
      us.forEach((u, k) => api.put(`${a}>${b}#${k}@${entries.length}`, inbetweenCel(A, B, u), Array.isArray(frames) ? frames[k] : frames, [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u)]));
      return api;
    },
    mark(name) { if (Object.hasOwn(marks, name)) throw new Error(`sheetBuilder.mark: "${name}" already marked`); marks[name] = frameNow(); return api; },
    // Register a drawing (and its placement) without exposing it yet, so passages can aim at it.
    draw(id, raw, at = [0, 0]) { pending[id] = raw; pendingPlace[id] = at; return api; },
    build({compile = true} = {}) {
      const D = {}; for (const [id, raw] of Object.entries(raws)) D[id] = compile ? compileCel(raw, {id: id.replace(/@\d+$/, '')}) : raw;
      const sheet = exposureSheet(entries.map(({id, frames}) => ({id, frames})), D, fps);
      // Placement belongs to the exposure row: one drawing can be exposed at several places.
      const row = q => entries[sheet.rows.findIndex(r => r.start === q.start)];
      const atFrame = f => { const q = sheet.atFrame(f); return {...q, place: row(q).at, raw: raws[q.id]}; };
      return {...sheet, drawings: D, raws, marks, time: m => { if (!Object.hasOwn(marks, m)) throw new Error('unknown mark ' + m); return marks[m] / fps; }, atFrame, at: t => atFrame(Math.floor(t * fps + 1e-6))};
    },
  };
  const pending = {}, pendingPlace = {};
  return api;
}

// ---------- sprite cache ----------
// Render a compiled cel into an offscreen canvas once per (cel, options, output scale) and
// blit it afterwards. `box` is the logical area [x, y, w, h] the drawing occupies in cel space.
const _sprites = new Map();
function celSprite(cel, {box = [-400, -300, 800, 600], material = 'pencil', color, weight = 1, value = 1, max = 256, supersample = 1} = {}) {
  const key = [cel.id, material, color, weight, value, S, supersample, box.join(',')].join('|');
  let hit = _sprites.get(key);
  if (!hit) {
    const k = S * supersample, cvs = document.createElement('canvas'); cvs.width = Math.ceil(box[2] * k); cvs.height = Math.ceil(box[3] * k);
    const g = cvs.getContext('2d'); g.scale(k, k); g.translate(-box[0], -box[1]); drawCel(g, cel, {material, color, weight, value});
    hit = {cvs, box}; _sprites.set(key, hit);
    if (_sprites.size > max) _sprites.delete(_sprites.keys().next().value);
  } else { _sprites.delete(key); _sprites.set(key, hit); }
  return hit;
}
function drawCelSprite(c, cel, x = 0, y = 0, opts = {}) {
  const {cvs, box} = celSprite(cel, opts); c.drawImage(cvs, x + box[0], y + box[1], box[2], box[3]);
}
