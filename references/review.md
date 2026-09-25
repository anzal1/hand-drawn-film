# Reviewing motion you cannot watch

Four instruments, from cheapest to richest. Use them after every change to timing or drawing.

| command | shows | use it for |
|---|---|---|
| `render.mjs film.html --grid 24` | 24 evenly spaced frames, properly downsampled | story, composition, continuity across the film |
| `render.mjs film.html --strip START,COUNT` | consecutive frames at 240 px | contacts, blinks, replacements, pops |
| `render.mjs film.html --onion START,COUNT[,STEP]` | frames overlaid, blue (first) to red (last), dots at the ink centroid | arcs, spacing, anticipation, overshoot, slides |
| `render.mjs film.html --only F` | one full-size frame | line quality, occlusion, fills, texture |
| `review.mjs film.html` | per-frame measurements and findings | pops, flicker, blank or frozen stretches, faint lines, pacing |

## Reading an onion

- Dot spacing is the spacing chart. Even dots move at constant speed; bunched dots at the start
  are a slow out, bunched at the end a slow in. A jump should trace an arc with dots bunched at
  the apex.
- The centroid is ink-weighted. A wing or paw that opens pulls it, so read it together with the
  drawings, not alone.
- A shape that jumps with no intermediate positions is a missing inbetween or a replacement
  without a breakdown. Choose a STEP of 2 for long actions so the image stays readable.
- The static background prints pale; only ink that differs from the lightest value of each pixel
  is tinted (darkest value on night films).

## Reading review.mjs

Outputs `<name>-review.md` (read this), `-review.png` (energy chart plus thumbnails of each
flagged frame with its neighbours), `-review.json` and `-review-frames.json` (per-frame numbers).

| finding | means | usual fix |
|---|---|---|
| `pop` (warn) | one frame changes far more than any frame within 4 of it | add a breakdown, ease a layer in, check a prop snapping |
| `flicker` | A-B-A: a mark or layer toggles and returns | boil with 3+ variants, not 2; hold the drawing |
| `shimmer` | the whole frame toggles faintly with no strong edge | tie paper texture to one seed; stop re-seeding grain |
| `boil` | whole-drawing changes at a fixed period | fine if intended; hold when nothing should move |
| `blank` | near-uniform frames | mid-shot means a layer failed; at a cut it is a fade or card |
| `frozen` | 2.5 s+ of identical frames | a moving hold (boil), a blink, or a camera drift |
| `faint` | line contrast at 320 px below 80 (warn below 50) | raise `weight`/`value`, darken the ink |
| `whip` / `cuts` | whole-frame changes / hard cuts inside a scene | check montage cards stay up 6+ frames |
| `ending` | still moving in the last half second | end on a hold of 0.5-1.5 s |
| `short-shot` | a scene under 0.75 s | intended montage, or lengthen |

The per-scene table reports energy, the share of changes on ones/twos/threes and held drawings,
and contrast. A character film is usually mostly twos with some ones and holds; all ones often
means a pose is being recomputed every frame.

Calibration: on the 15 bundled films the report raised one warning, and it was real: moon-book frame
615, where the book's front board lay flat beside the closing cover and vanished in one frame (fixed
in `paper3d.js`). An earlier version misread held-once's 8-frame doodle boil as a pop; boil cycles
are now detected from all periodic spikes in a scene. Still confirm each finding by eye.

## Limits

The report measures pixels, not taste. It cannot tell a weak pose from a strong one, whether an
action reads, or whether timing is funny. Say which instruments you used when you report on a
film, and say so plainly if nobody watched it at speed.
