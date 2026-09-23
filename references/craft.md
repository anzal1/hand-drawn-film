# Craft numbers

Starting points at 24 fps that produce readable, lively animation. They come from classic
exposure-sheet practice and were checked against the examples with onion skins and review.mjs.
Change them when the performance asks for it, and look at the onion when you do.

## Timing (frames at 24 fps)

| action | frames | exposure | notes |
|---|---|---|---|
| blink | close 1-2, shut 2-3, open 2 | ones or a single replacement cel held 3 | a slow, affectionate blink holds shut 6-9 |
| head turn, small | 6-8 | twos | 2-3 inbetweens, `slowInOut`; redraw the head if the view changes |
| head turn, profile to front | 4-6 | a 3/4 breakdown held 2, then the new view | replacement drawings, never a morph |
| look / notice | 4-6 to arrive, hold 12+ | twos | the hold is where the audience reads the thought |
| anticipation before a fast move | 4-8 | twos, the last pose held 3-5 | against the direction of the move |
| fast action (swipe, throw, hit) | 2-4 | ones | a stretched breakdown reads better than a blur |
| settle after an action | 6-12 | twos | `slowIn`; overshoot only for loose parts |
| jump, small hop | crouch 6 (hold), air 14-20, land squash 3, settle 8 | air on twos, contact frames held | apex bunched: spacing like [.06 .16 .3 .44 .56 .68 .8 .9 .97] |
| walk step | 12 (a stride of two steps = 24) | twos | contact, down, passing, up per step |
| idle hold | 16-48 | boil on fours, 3 variants | `keep` eyes and contacts |
| camera push / drift | 1-3 s | ones | ease with `easeInOutSine`; stop before a key moment |
| whip pan | 4-6 | ones | cut on its fastest frame |
| title or card | 1 s + 1 s per 3 words | held | let lettering finish before the clock starts |
| film ending hold | 12-36 | held or boiling | the review flags endings still moving |

## Spacing (`spacing(n, kind)`)

- `slowInOut`: default for character moves between two holds.
- `slowIn` (cushion into the end): landings, arriving looks, settling, a hand closing on a prop.
- `slowOut` (leave gently, arrive fast): the start of a fall, a throw's release, a pounce.
- `even`: mechanisms, conveyor belts, horizontal travel in flight.
- `thirds`: classic favouring into a key; good for a quick snap into a pose.

Physics beats keys for props: a ball, a falling mug, debris. Use `y = y0 + g t^2 / 2` with
`g` around 3500-4500 logical units/s^2 for a table-height fall that reads in 0.4-0.5 s, and a
friction slide `x = x0 + v0 t - a t^2 / 2`. Put falls on ones.

## Lines

| look | `weight` | `value` | stroke widths in the cel |
|---|---|---|---|
| pencil | 1.8-2.2 | 1.3-1.4 | contour 1.9-2.2, interior 1.2-1.5, whiskers/detail 0.8 |
| ink | 1.1-1.3 | 1 | contour 1.8-2.2, interior 1.1-1.4 |

- Outer contour heaviest, interior lines 60-75% of it, texture and construction 40%.
- Pressure profile with a quick attack and a long taper, like `[[0,.12],[.14,.85],[.45,1],[.8,.7],[1,.08]]`.
- Judge weight in the grid (240 px tiles). review.mjs reports contrast per scene; line films read
  best at 110+ and wash out below 80.
- Background lines at opacity .35-.55 so the character is the darkest thing in frame.

## Composition

- 16:9: subject in the middle 60%; horizon, table or ground 60-65% down the frame.
- 9:16: stack the action vertically; keep the subject between 25% and 75% of the height; a
  landscape layout squeezed into portrait leaves dead bands top and bottom.
- Leave 5% margins free of anything that must be read. Let the action travel toward open space.
- One clear focal point per moment. When the character looks at something, the audience does too,
  so give the look a hold.

## Sound

- Every cue reads a sheet mark (`film.time('contact')`) or a physics time (`tLand`), never a
  hand-typed second.
- Layers that work with `note` and `noiseBurst`: soft noise for pencil scratch during a draw-on,
  a short sine for blinks and looks, a triangle for taps and contacts, a pitched sweep for falls,
  a loud noise burst plus a few high triangle notes for a crash, a quiet chord under the ending.
- Keep the mix sparse; silence before a hit makes it land.
