'use strict';
// Whole-drawing animation. Load after core.js and studio.js.
// A cel is authored geometry, not a live rig. The exposure sheet chooses a cel;
// drawing time never enters the brush, so holding a drawing also holds its marks.

function exposureSheet(entries, drawings, fps = 24) {
  if (!Number.isInteger(fps) || fps <= 0 || !entries.length) throw new Error('Invalid exposure sheet');
  let end = 0;
  const rows = entries.map(({id, frames}) => {
    if (!Object.hasOwn(drawings, id) || !Number.isInteger(frames) || frames < 1) throw new Error('Exposure needs an existing drawing and positive integer frames');
    const row = {id, start: end, end: end + frames}; end += frames; return row;
  });
  const atFrame = frame => {
    if (!Number.isFinite(frame)) throw new Error('Invalid exposure frame');
    const f = clamp(Math.floor(frame), 0, end - 1);
    const row = rows.find(r => f < r.end);
    return {id: row.id, drawing: drawings[row.id], start: row.start, end: row.end};
  };
  return {rows, frames: end, duration: end / fps, atFrame, at: seconds => atFrame(Math.floor(seconds * fps + 1e-6))};
}

// A stroke's id and point order are semantic correspondence supplied by the artist.
// Occlusion, point count or stroke-order changes need a replacement drawing.
function inbetweenCel(a, b, t) {
  if (!Number.isFinite(t) || t < 0 || t > 1 || a.strokes.length !== b.strokes.length) throw new Error('Incompatible cels');
  const strokes = a.strokes.map((s, i) => {
    const q = b.strokes[i];
    if (s.id !== q.id || s.points.length !== q.points.length || !!s.close !== !!q.close || (s.corner ?? Math.PI) !== (q.corner ?? Math.PI) || JSON.stringify(s.pressure) !== JSON.stringify(q.pressure) || s.color !== q.color) throw new Error('Cel topology/style changed: author a replacement drawing');
    return {...s, points: morphPoints(s.points, q.points, t), width: lerp(s.width ?? 1.5, q.width ?? 1.5, t), opacity: lerp(s.opacity ?? 1, q.opacity ?? 1, t)};
  });
  return {strokes};
}

// Geometry is prepared once per drawing. A sharp beak can keep corners, while
// the back uses long continuous curves. Seed changes belong to new drawings.
function compileCel(cel, {id = 'cel'} = {}) {
  const seen = new Set();
  return {id, strokes: cel.strokes.map(s => {
    if (!s.id || seen.has(s.id)) throw new Error('Each cel stroke needs a unique semantic id');
    if (!s.points?.length || s.points.some(p => p.length !== 2 || !p.every(Number.isFinite)) || !Number.isFinite(s.opacity ?? 1) || (s.opacity ?? 1) < 0 || (s.opacity ?? 1) > 1) throw new Error('Invalid cel stroke');
    seen.add(s.id);
    const seed = strokeSeed(id + '/' + s.id), width = s.width ?? 1.5;
    const points = smoothPts(s.points, !!s.close, 1.2, s.corner ?? Math.PI);
    const p = motionPath(points, {smooth: false, closed: !!s.close});
    if (!(width > 0 && Number.isFinite(width))) throw new Error('Invalid stroke width');
    const pressure = s.pressure ?? [[0,.15],[.18,.85],[.5,1],[.82,.7],[1,.1]];
    if (!pressure.length || pressure.some((v,i) => v.length !== 2 || !v.every(Number.isFinite) || v[0] < 0 || v[0] > 1 || v[1] < 0 || i && v[0] <= pressure[i-1][0])) throw new Error('Invalid cel pressure');
    const n = Math.max(2, Math.ceil(p.length / 1.3));
    const samples = Array.from({length:n+1}, (_,i) => {
      const u=i/n, a=p.at(u); return {...a, u, w:width * strokeProfile(u, pressure)};
    });
    return {...s, seed, width, samples};
  })};
}

// Graphite is deposited as narrow, interrupted passes. There is no opaque
// vector ribbon underneath. The secondary pass shares the drawing gesture.
// Options beyond material/color/opacity (all default to the original look):
//   weight  line width multiplier (1.4-2 keeps pencil legible at 1080p and in thumbnails)
//   value   darkness multiplier for each pass, clamped so a pass never exceeds full ink
//   reveal  0..1: draw-on in stroke order, paced by stroke length; the stroke being drawn is partial
//   fill    true: strokes with a `fill` colour ('paper' = PAL.paper) paint their closed shape first,
//           so a front form hides the lines behind it (painter's order = stroke order)
function drawCel(c, cel, {material = 'pencil', color = '#39332e', opacity = 1, weight = 1, value = 1, reveal = 1, fill = true} = {}) {
  if (!['pencil','ink'].includes(material)) throw new Error('Cel brush supports pencil or ink');
  if (!(weight > 0) || !(value > 0) || !Number.isFinite(reveal)) throw new Error('drawCel: weight and value must be positive, reveal finite');
  c.save(); c.lineCap = material === 'pencil' ? 'butt' : 'round'; c.lineJoin = 'round';
  const inheritedAlpha = c.globalAlpha * opacity, plan = reveal < 1 ? revealPlan(cel) : null, r = clamp(reveal, 0, 1);
  for (const [k, s] of cel.strokes.entries()) {
    let part = 1;
    if (plan) { const [a, b] = plan[k]; if (r <= a) break; part = clamp((r - a) / (b - a), 0, 1); }
    if (fill && s.fill) {
      c.save(); c.globalAlpha = inheritedAlpha * (s.fillOpacity ?? 1) * Math.min(1, part * 3);
      c.fillStyle = s.fill === 'paper' ? PAL.paper : s.fill; c.beginPath();
      s.samples.forEach((a, i) => i ? c.lineTo(...a.p) : c.moveTo(...a.p)); c.closePath(); c.fill(); c.restore();
    }
    c.strokeStyle = s.color ?? color;
    const pencil = material === 'pencil', passes = pencil ? 3 : 1, last = Math.max(1, Math.round((s.samples.length - 1) * part));
    for (let pass=0; pass<passes; pass++) {
      const spread = pencil ? (pass-1) * s.width * .30 : 0;
      const point = a => {
        const drift = (noise1(a.u*5+pass*11, s.seed)*.20 + spread) * Math.sin(Math.PI*a.u);
        return [a.p[0]-a.tangent[1]*drift, a.p[1]+a.tangent[0]*drift];
      };
      for (let i=1; i<=last; i++) {
        const a=s.samples[i-1], b=s.samples[i], tooth=hash(i*3+pass,s.seed);
        // Short gaps at low pressure, rather than random changes to the silhouette.
        if (pencil && tooth < .08 + .10*(1-Math.min(1,b.w/s.width))) continue;
        const pressure=Math.max(.04, (a.w+b.w)/2);
        c.lineWidth = (pencil ? Math.max(.18,pressure*.40) : pressure) * weight;
        c.globalAlpha = inheritedAlpha * (s.opacity ?? 1) * Math.min(1, (pencil ? .34 + tooth*.30 : .90) * value);
        c.beginPath(); c.moveTo(...point(a)); c.lineTo(...point(b)); c.stroke();
      }
    }
  }
  c.restore();
}

// Draw-on pacing: each stroke gets a time slice that grows with the square root of its
// length, so long contours take longer than ticks without dominating the reveal.
function revealPlan(cel) {
  if (cel._reveal) return cel._reveal;
  const d = cel.strokes.map(s => .35 + Math.sqrt(s.samples.at(-1).s ?? s.samples.length * 1.3) / 8), total = d.reduce((a, b) => a + b, 0);
  let acc = 0; return (cel._reveal = d.map(v => { const a = acc / total; acc += v; return [a, acc / total]; }));
}
