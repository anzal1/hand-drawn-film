# sketch.js: authoring whole drawings

Load order: `core.js`, `studio.js`, `cels.js`, `sketch.js`. Everything here produces raw cels
(`{strokes: [...]}`) that `compileCel` and `drawCel` from `cels.js` understand. Complete worked
use: [`examples/cat-and-mug.html`](../examples/cat-and-mug.html) and `assets/starter-film.html`.

## Drawings from SVG path data

```js
const MUG = svgCel({
  'mug/body':   {d:'M -44 -96 C -46 -60 -44 -24 -38 -4 C -20 4 20 4 38 -4 C 44 -24 46 -60 44 -96', width:1.8, fill:'paper'},
  'mug/handle': {d:'M 44 -80 C 78 -84 80 -30 42 -28', width:1.7},
}, {pressure:P, points:32});
```

- `svgPoints(d, {step, scale, offset})` parses M L H V C S Q T A Z, absolute and relative, and
  returns `[{points, close}]` per subpath. `svgCel(parts, opts)` turns named paths into strokes;
  extra subpaths become `name/1`, `name/2`.
- Per-stroke fields pass through: `width`, `opacity`, `color`, `pressure`, `corner` (smaller keeps
  sharp turns such as ears and beaks), `fill` (`'paper'` or a colour), `fillOpacity`.
- `points: N` resamples every stroke to N points at equal arc length. Use it on every key of a
  character so `inbetweenCel` can morph any two keys that share stroke names.
- Generate a drawing from a function when poses share construction (the cat's `head(hx, hy,
  tilt, face)`), but author each key as a complete drawing: silhouettes, overlaps and paws change
  per pose. That is still whole-drawing animation; a rig that rotates unchanged parts is not.

## drawCel options (cels.js)

| option | default | use |
|---|---|---|
| `material` | `'pencil'` | `'pencil'` or `'ink'` |
| `weight` | 1 | line width multiplier; 1.8-2.2 for pencil at 1080p |
| `value` | 1 | darkness multiplier per pass, clamped to full ink |
| `reveal` | 1 | 0..1 draw-on in stroke order, paced by the square root of stroke length |
| `fill` | true | paint strokes that have a `fill` before their line (occlusion) |

Defaults reproduce the original brush pixel for pixel. Put a draw-on on twos:
`drawCel(c, SET, {...opt, reveal: sm(0, 1.2, twos(t), x => x)})`.

## Boil

`boilCels(raw, n, {amp, seed, pin, keep, freq})` returns n redrawn variants. Each stroke moves
along its normal by low-frequency noise scaled to its length. `pin` (default) holds stroke
endpoints so joins stay closed; `keep: ['eye', 'eye/l']` never moves the listed strokes. Each
variant compiles with its own id, so the pencil tooth changes too, as a redraw would. Use 3
variants on fours for an idle hold, `amp` 0.8-1.4. Larger `amp` (3-5) with `pin: false` suits
smoke and steam.

## Spacing

`spacing(n, 'even' | 'slowIn' | 'slowOut' | 'slowInOut' | 'thirds')` returns n positions strictly
between two keys. See [craft.md](craft.md) for when to use each.

## sheetBuilder

```js
const sb = sheetBuilder({library: RAW})
  .key('sit', 1).hold('sit', 23, {boil:3, every:4, keep:['eye']})
  .put('blink', 3).hold('sit', 13, {boil:3, every:4, seed:5})
  .mark('notice').between('sit', 'look', spacing(3), 2).key('look', 5)
  .between('look', 'reach', spacing(2, 'slowOut'), 1).key('reach', 1).mark('contact');
const CAT = sb.build();
CAT.at(tau)            // {id, drawing, place, raw, start, end}
CAT.time('contact')    // seconds, for sound and props
CAT.duration           // seconds; use as the scene duration
```

- `key` / `put(id, frames, at)` expose a library drawing at placement `at` (root offset); without
  a library pass the raw cel: `put(id, raw, frames, at)`.
- `between(a, b, us, frames, {from, to})` adds `inbetweenCel` drawings; `frames` may be an array
  per inbetween; placement interpolates with the same spacing.
- `hold(id, frames, {boil, every, amp, seed, keep, at})` re-exposes a drawing, optionally boiling.
- `mark(name)` names the current frame. `draw(id, raw, at)` registers a target without exposing it.
- Placement belongs to each exposure row, so one drawing can be exposed at many places (a ball in
  flight).

## Sprites

`drawCelSprite(c, cel, x, y, {box, material, color, weight, value})` renders a compiled cel once
per output scale into a bounded LRU cache (256 entries) and blits it. Use it for heavy drawings
held for many frames. Direct `drawCel` stays crisper under camera zoom.
