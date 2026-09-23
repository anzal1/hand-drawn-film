---
name: hand-drawn-film
description: >-
  Make short hand-drawn films in JavaScript and Canvas 2D (pencil, ink, risograph, screen print,
  brush-pen doodles on photos, sand animation, pop-up paper) and export an MP4 with a synthesized
  score. Whole-pose drawings authored as SVG path data, exposure sheets, draw-on reveals, boiling
  holds, and a review loop (onion skins, motion report) that lets you judge animation without
  watching it. Use for hand-drawn cartoons, animated explainers, sketch-style intros, rotoscope,
  sand stories or drawings that interact with photos. Not for UI animation or slide decks.
---

# Hand-drawn film

You are making a film that must feel drawn by hand in its marks **and** its movement. You cannot
watch playback, so this skill gives you instruments that turn motion into stills and numbers.
Use them after every change. The loop is the method:

```
draw keys -> render one still -> build the exposure sheet -> onion / strip the hard action
-> review.mjs -> fix -> full render -> review.mjs on the final -> deliver with limitations
```

## 1. Start a project (1 minute)

```bash
node <skill>/scripts/new.mjs ~/films/my-film --ar 16:9 --look pencil --title "My film"
cd ~/films/my-film && npm i --no-audit --no-fund
node render.mjs film.html --grid 24
```

`film.html` is a complete, working starter (a ball hops onto a box) with the canonical structure:
drawings, one exposure sheet, the shot, a score whose cues read the sheet. Keep the structure,
replace the drawings. Fill `brief.md` first; infer routine choices, ask the user only about
decisions that change the film (subject, length, look, format, ending). Needs Node 22+, Chrome,
ffmpeg. For looks other than pencil/ink, or photos, sand and paper, start from the matching
example in `examples/` (table below) and copy its modules locally.

## 2. Draw (the part that decides quality)

Author each key pose as a **whole drawing** in SVG path data with `svgCel` (see
[redrawn-animation.md](references/redrawn-animation.md) and [sketch.md](references/sketch.md)).

- Same stroke names in every key; start each stroke at the same landmark; pass `points: N` so
  `inbetweenCel` matches strokes by arc length. A new view, a closed eye or a changed overlap is
  a **replacement drawing** (`put`), never a morph.
- Give closed forms `fill: 'paper'` so a front shape hides the lines behind it. Stroke order is
  painter's order: background first, near limbs last. Add an invisible silhouette
  (`opacity: 0, fill: 'paper'`) first when a body is built from open strokes.
- Line weight: pencil `weight 1.8-2.2, value 1.3`; ink `weight 1.1-1.3`. Weight is judged at
  thumbnail size, not full size. Target ink contrast 110+ in the review table.
- Render each key alone (`?pose=` pattern in `examples/cat-and-mug.html`) and look at them side by
  side before animating. A texture never rescues an unclear silhouette.
- Composition: subject in the middle 60% of the frame, horizon or table around 60-65% down,
  nothing important within 5% of an edge. Frame with `cam()` rather than moving every drawing.
- **Call `setFormat()` before any file-scope constant reads `W`, `H`, `CX`, `CY`.** `defineFilm()`
  runs last; without this the film is laid out on the 1:1 default (the starter shows the pattern).

## 3. Animate (exposure sheet)

Use `sheetBuilder({library: RAW})`: `key`, `between(a, b, spacing(n, kind), frames)`, `hold`
(optionally `{boil: 3, every: 4}`), `put` for replacements, `mark('name')` for cues. Numbers
that work at 24 fps are in [craft.md](references/craft.md). The short version:

- Moves on twos; fast actions (a swipe, a hit, a fall) on ones; holds 8-24 frames, boiling on
  fours with `keep` for eyes and contacts. Never boil on ones.
- Spacing is the acting: `slowInOut` for most moves, `slowIn` into a landing or a look,
  `slowOut` out of a crouch into a throw or fall, `even` only for machines and ballistics along
  the horizontal.
- Anticipation 4-8 frames before any fast action; a settle after it. Give the viewer about
  one second to read a new idea before the next one starts.
- Props with physics (a falling mug) use formulas on continuous time, not keys. Cue sound from
  marks (`film.time('contact')`) so it cannot drift.

## 4. Look at the motion (every iteration)

```bash
node render.mjs film.html --grid 24          # composition across the film (faithful thumbnails)
node render.mjs film.html --onion 96,16      # one action overlaid blue->red, with a spacing trail
node render.mjs film.html --strip 96,12      # consecutive frames at readable size
node render.mjs film.html --only 96          # one full-size frame for line detail
node review.mjs film.html                    # motion report: pops, flicker, shimmer, blank,
                                             # frozen, faint lines, pacing, exposure per scene
```

Read [review.md](references/review.md) for how to interpret each finding. In an onion, the dots
are the ink centroid per frame: evenly spaced dots are even spacing, bunched dots are a slow in or
out, a straight chain on a jump means the arc is missing. Fix every `warn` or state why it is
intended; confirm each finding by eye with `--strip` around the frame. The numbers are
measurements, not taste.

## 5. Deliver

```bash
node render.mjs film.html                    # frames, mp4, contact sheet, -final.mp4 with score
node review.mjs film.html                    # on the finished film
```

Full renders run on parallel browser processes (`--jobs N`) and are bit-identical to serial
renders. Deliver the source folder, the MP4, the contact sheet, the review report and a short
list of known limitations. Verify duration, dimensions and frame count (ffprobe). Never call a
film finished because code or checks passed; say what you looked at (onions, strips, stills) and
that you did not watch it at speed if you could not.

## Choose references by task

| task | read | start from |
|---|---|---|
| any character in pencil or ink | [redrawn-animation.md](references/redrawn-animation.md), [sketch.md](references/sketch.md), [craft.md](references/craft.md) | `examples/cat-and-mug.html`, `examples/sketchbook-bird.html` |
| timing, spacing, contacts, weather | [motion.md](references/motion.md), [craft.md](references/craft.md) | `examples/weight-study.html` |
| looks: ink, pencil, riso, screen, doodle | [style.md](references/style.md), [palettes.md](references/palettes.md) | `examples/four-looks.html` |
| several looks in one film | [mixed-media.md](references/mixed-media.md) | `examples/becoming-phoenix/` |
| drawings on real photos | [doodle.md](references/doodle.md) | `examples/held-once.html`, `examples/night-shift.html` |
| traced real motion | [found-motion.md](references/found-motion.md) | `examples/gallop.html` |
| sand animation | [sand.md](references/sand.md) | `examples/one-year.html` |
| pop-up paper in 3D | [paper3d.md](references/paper3d.md) | `examples/moon-book.html` |
| engine APIs, export, pitfalls | [architecture.md](references/architecture.md), [studio.md](references/studio.md) | |
| reading review output | [review.md](references/review.md) | |

[scenes.md](references/scenes.md) and [reference-films.md](references/reference-films.md) hold
optional scene devices and historical references, not required structures.

## Invariants

- 24 fps by default. Scenes get continuous `tau`; quantize a pose once (`twos(t)` or an exposure
  sheet), never twice. Camera and physics usually run on ones.
- No output-frame seeds. A held drawing holds its marks; a boil is a finite set of drawings.
  Every frame must reproduce after seeking (render workers depend on it).
- Contacts stay planted until their planned release; IK clamps and reports unreachable targets.
- Record sources and licences for external media (photos, fonts).
- Engine edits belong in the skill's `assets/`, then get copied to films; do not fork `core.js`
  inside one film.

## Quality gates

- **Drawing:** clear silhouette at 240 px; consistent proportions across keys; line hierarchy
  (outer contour heavier than interior detail); purposeful taper and gaps; no accidental
  tangents; front forms hide what is behind them.
- **Motion:** readable keys, anticipation and settle where the action needs them, deliberate
  spacing (check the onion), planted contacts, no pops or two-drawing flicker in the review.
- **Material:** texture tied to the paper or object, not the screen; no shimmer unless intended;
  line contrast 110+ at thumbnail size for line films.
- **Delivery:** no page errors, no unintended blank frames, the ending holds 0.5-1.5 s, text and
  cards stay up long enough to read (about 3 words per second plus one second), the encoded MP4
  decodes and has the expected frame count.

`node scripts/verify.mjs` runs the engine's regression suite (20 checks) after engine edits.
