# Burst pedestal

A concentric circular matte-porcelain confirm pedestal holding a studio-photographed Black Mission Fig. Press and hold for two-thirds of a second: the velvety dark fig compresses under hydraulic tension with crisp ceramic ticks while a recessed wine-plum progress ring fills 360° around the rim. At full compression, a hydraulic burst erupts a radial wine-plum crown across the porcelain, exposes the glistening ruby fig heart and lights a crisp confirmation checkmark.

Slash or swipe upward across the pedestal at any time to cleave the fig along your blade angle and launch both halves upward for continuous mid-air combos. Tap the confirmed pedestal (or press Space / Enter) to cycle cleanly between confirmed and fresh states.

One of four files in this repo. Same material system in each (macro-photographed fruit on matte alabaster porcelain with GPU viscous nectar physics), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/button/
```

`?embed=1` hides the heading and the hint.

## Use it

`button.js` is the whole control: one file of about 220 KB with the WebGL2 nectar engine, Web Audio foley and photographed fruit sprites inside it, and no dependencies.

```html
<script src="button.js"></script>
<fruit-button label="Confirm publish"></fruit-button>
```

```js
const el = document.querySelector('fruit-button');
el.addEventListener('confirm', () => publishNow());
el.addEventListener('reset', () => cancelState());
el.burst();           // trigger hydraulic burst
el.reset();           // roll in a fresh fig
```

| attribute | what it sets | default |
|---|---|---|
| `confirmed` | starts in the confirmed state (`✓`) | off |
| `label` | accessible name for screen readers | `Confirm` |
| `disabled` | disables pointer and keyboard input | off |

- **A button underneath:** `role="button"` with `aria-pressed`. Space or Enter triggers the hydraulic burst, and pressing again resets to a fresh fig.
- **Hold-to-confirm prevents accidental clicks:** releasing before the 360° wine-plum rim completes eases tension back down without firing `confirm`.
- **Slash shortcut:** swiping across the fig also cleaves and toggles confirmation, with upward swipes launching halves for mid-air combos.

## What happens

| you | it |
|---|---|
| press and hold (0.66 s) | compresses the fig with tactile rim ticks as the wine-plum ring fills 360°, then erupts a radial hydraulic burst, reveals the ruby heart and fires `confirm` |
| release early | tension relaxes cleanly back to poised with no confirmation fired |
| tap while confirmed | rolls a fresh Black Mission Fig back onto the pedestal and fires `reset` |
| swipe upward | cleaves the fig and launches both halves into hang-time for continuous mid-air re-slicing |

## Limits

- **Not a submit input.** Listen for the `confirm` event to trigger your action.
- **WebGL2 for the viscous nectar layer.** Without WebGL2, the porcelain hardware, 3D fruit split and keyboard controls still work through a 2D canvas fallback, without the GPU nectar shader.
- **One canvas per element.** Each element uses its own WebGL2 context, and browsers keep roughly sixteen alive at once, so it is for hero controls and settings, not long lists.
- **Touch gestures capture swipes inside the frame.** Because upward swipes launch fruit into the air for mid-air combos, the canvas sets `touch-action: none`; leave breathing room around the control on mobile pages so visitors can scroll past it.
- **Drawn for a warm light page.** The alabaster porcelain stage and shadows assume a pale background (`#F1EAE0` or light neutral paper).
- **Single-file payload.** The photographed fruit sprites are embedded as WebP data URIs inside each file (roughly 210 to 630 KB); load only the controls you use.
- **Sound plays after the first gesture.** `FruitStudio.Sound.on = false` silences every control on the page.
- **Checked in headless Chromium** with real mouse, touch and keyboard events at 390 px phone width. Not yet tried in Safari or Firefox, on a real phone, or with a screen reader.
