# Berry stepper

A five-step matte-white porcelain rail with five sculpted concave dimples, each cradling a macro-photographed crimson strawberry (0/5 through 5/5). Sweep across one or all five berries in a single continuous stroke: every cleaved dimple reveals a glistening sliced strawberry heart ringed with translucent ruby nectar while its severed cap launches with your exact swipe angle and velocity.

Swipe upward across the rail to launch only the swiped berries' caps into upper-frame hang-time and keep sweeping through them mid-air for Triple, Quad, Penta and Hexa combos. Tap an intact berry to step it on, tap a cleaved dimple to restore that berry, or use Arrow keys, Home and End.

One of four files in this repo. Same material system in each (macro-photographed fruit on matte alabaster porcelain with GPU viscous nectar physics), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/stepper/
```

`?embed=1` hides the heading and the hint.

## Use it

`stepper.js` is the whole control: one file of about 210 KB with the WebGL2 nectar engine, Web Audio foley and photographed fruit sprites inside it, and no dependencies.

```html
<script src="stepper.js"></script>
<fruit-stepper value="2" label="Intensity"></fruit-stepper>
```

```js
const el = document.querySelector('fruit-stepper');
el.addEventListener('input', (e) => preview(e.detail.value));
el.addEventListener('change', (e) => save(e.detail.value));
el.value = 3;         // 0..5
el.refill();          // restore all five berries
```

| attribute | what it sets | default |
|---|---|---|
| `value` | starting count (`0` to `5`) | `0` |
| `label` | accessible name for screen readers | `Berry stepper` |
| `name` | sent with its form (`"0"`..`"5"`) |  |
| `auto-refill` | automatically refills the rail after hitting `5` | off |
| `disabled` | disables pointer and keyboard input | off |

- **A slider underneath:** `role="slider"` with `aria-valuemin="0"`, `aria-valuemax="5"` and `aria-valuenow`. ArrowRight/Up cleaves the next berry, ArrowLeft/Down restores the last cleaved berry, Home refills to 0 and End steps to 5.
- **Tap to toggle individual berries:** tap an intact berry to cleave it, or tap an already cleaved heart to restore it.
- **Form-associated:** with a `name`, its current count (`"0"`..`"5"`) is included in `FormData`.

## What happens

| you | it |
|---|---|
| sweep across the rail | cleaves every berry your stroke crosses, reveals glossy ruby hearts and blooms crimson nectar out of each dimple |
| swipe upward | launches only the swiped berries' caps upward into hang-time so one continuous stroke can chain Penta and Hexa combos |
| tap a cleaved dimple | restores that berry cleanly with a ceramic tick |
| Arrow keys / Home / End | steps the count up or down one berry at a time, or jumps to 0 / 5 |

## Limits

- **Five fixed steps (0–5).** Designed for discrete ratings, intensity levels and short multi-step settings.
- **WebGL2 for the viscous nectar layer.** Without WebGL2, the porcelain hardware, 3D fruit split and keyboard controls still work through a 2D canvas fallback, without the GPU nectar shader.
- **One canvas per element.** Each element uses its own WebGL2 context, and browsers keep roughly sixteen alive at once, so it is for hero controls and settings, not long lists.
- **Touch gestures capture swipes inside the frame.** Because upward swipes launch fruit into the air for mid-air combos, the canvas sets `touch-action: none`; leave breathing room around the control on mobile pages so visitors can scroll past it.
- **Drawn for a warm light page.** The alabaster porcelain stage and shadows assume a pale background (`#F1EAE0` or light neutral paper).
- **Single-file payload.** The photographed fruit sprites are embedded as WebP data URIs inside each file (roughly 210 to 630 KB); load only the controls you use.
- **Sound plays after the first gesture.** `FruitStudio.Sound.on = false` silences every control on the page.
- **Checked in headless Chromium** with real mouse, touch and keyboard events at 390 px phone width. Not yet tried in Safari or Firefox, on a real phone, or with a screen reader.
