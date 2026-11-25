# Chop toggle

A binary switch built as a recessed alabaster porcelain pill cradling a studio-photographed fruit: Blood Orange, Golden Yuzu, Fuzzy Kiwi and Watermelon in rotation. Swipe across the fruit to cleave it along your exact blade angle and speed — the two 3D spherical-cap halves separate cleanly with off-center mass physics, a Beer-Lambert viscous nectar splat blooms across the ceramic, and the next fruit glides smoothly into the opposite end of the track.

Swipe downward or sideways and the halves tumble naturally off the bottom edge. Swipe upward through the fruit and only that fruit launches into upper-frame hang-time — keep your finger down across the floating halves to dice them into quarters and eighths for Double, Triple, Quad and Penta combos. Clicking or pressing Space / Enter cleaves the switch cleanly for mouse and keyboard users.

One of four files in this repo. Same material system in each (macro-photographed fruit on matte alabaster porcelain with GPU viscous nectar physics), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toggle/
```

`?embed=1` hides the heading and the hint.

## Use it

`toggle.js` is the whole control: one file of about 480 KB with the WebGL2 nectar engine, Web Audio foley and photographed fruit sprites inside it, and no dependencies.

```html
<script src="toggle.js"></script>
<fruit-toggle label="Porcelain switch"></fruit-toggle>
```

```js
const el = document.querySelector('fruit-toggle');
el.addEventListener('change', (e) => setEnabled(e.detail.checked));
el.toggle();          // programmatic cleave
el.fruit = 'kiwi';    // bloodOrange, yuzu, kiwi, watermelon
el.clear();           // wipe nectar from the ceramic
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | starts on | off |
| `fruit` | starting fruit (`bloodOrange`, `yuzu`, `kiwi`, `watermelon`) | `bloodOrange` |
| `label` | accessible name for screen readers | `Chop toggle` |
| `name` | sent with its form when on |  |
| `value` | form value sent when on | `on` |
| `disabled` | disables pointer and keyboard input | off |

- **A switch underneath:** `role="switch"` with `aria-checked`. Click, swipe, Space or Enter flips it.
- **Form-associated:** with a `name`, it submits `value` (default `"on"`) when checked and omits itself when off, like a native checkbox.
- **True swipe physics:** cut angle, blade speed, curvature and off-center chord offset drive the 3D split, angular momentum and WebGL2 nectar splash.

## What happens

| you | it |
|---|---|
| swipe sideways or down | cleaves the fruit along your exact cut line, splashes viscous nectar on the porcelain, drops the halves off-screen and glides the next fruit into the opposite slot |
| swipe upward | launches only the cleaved fruit halves upward into hang-time so you can keep your finger down and dice them for Double / Triple / Quad / Penta combos |
| click, Space or Enter | cleaves the current fruit cleanly and toggles the switch |
| call `el.clear()` | wipes accumulated viscous nectar pools and beads off the ceramic surface |

## Limits

- **Fixed 16:9 stage aspect ratio.** Give the element any CSS `width` and its height follows cleanly.
- **WebGL2 for the viscous nectar layer.** Without WebGL2, the porcelain hardware, 3D fruit split and keyboard controls still work through a 2D canvas fallback, without the GPU nectar shader.
- **One canvas per element.** Each element uses its own WebGL2 context, and browsers keep roughly sixteen alive at once, so it is for hero controls and settings, not long lists.
- **Touch gestures capture swipes inside the frame.** Because upward swipes launch fruit into the air for mid-air combos, the canvas sets `touch-action: none`; leave breathing room around the control on mobile pages so visitors can scroll past it.
- **Drawn for a warm light page.** The alabaster porcelain stage and shadows assume a pale background (`#F1EAE0` or light neutral paper).
- **Single-file payload.** The photographed fruit sprites are embedded as WebP data URIs inside each file (roughly 210 to 630 KB); load only the controls you use.
- **Sound plays after the first gesture.** `FruitStudio.Sound.on = false` silences every control on the page.
- **Checked in headless Chromium** with real mouse, touch and keyboard events at 390 px phone width. Not yet tried in Safari or Firefox, on a real phone, or with a screen reader.
