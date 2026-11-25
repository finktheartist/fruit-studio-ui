# Swatch matrix

A sculpted 3×2 matte-porcelain bento tray uniting all six studio-photographed fruits: Blood Orange, Golden Yuzu and Fuzzy Kiwi on the top row; Ripe Strawberry, Black Mission Fig and Watermelon on the bottom row. Sweep across any combination of wells in a single stroke — each cleaved fruit reveals its glistening heart while its distinct translucent nectar pigment (crimson, gold, emerald, ruby, wine-plum and coral-red) mixes organically on the shared WebGL2 fluid layer.

Swipe upward across multiple wells to launch only those swiped fruits into a multi-color mid-air bouquet for Quad, Penta, Hexa and Octa combos. Tap any selected well to deselect and restore that fruit, tap an intact well to select it, or navigate with Arrow keys and Space / Enter.

One of four files in this repo. Same material system in each (macro-photographed fruit on matte alabaster porcelain with GPU viscous nectar physics), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/matrix/
```

`?embed=1` hides the heading and the hint.

## Use it

`matrix.js` is the whole control: one file of about 630 KB with the WebGL2 nectar engine, Web Audio foley and photographed fruit sprites inside it, and no dependencies.

```html
<script src="matrix.js"></script>
<fruit-matrix name="palette" value="bloodOrange,kiwi"></fruit-matrix>
```

```js
const el = document.querySelector('fruit-matrix');
el.addEventListener('change', (e) => applyPalette(e.detail.selected));
el.toggleFruit('fig');          // bloodOrange, yuzu, kiwi, strawberry, fig, watermelon
el.selected = ['yuzu', 'fig'];  // set from code
el.reset();                     // restore all six fruits
```

| attribute | what it sets | default |
|---|---|---|
| `value` | comma-separated selected keys (e.g. `bloodOrange,kiwi`) | empty |
| `label` | accessible name for screen readers | `Fruit swatch matrix` |
| `name` | sent with its form as a comma-separated list |  |
| `auto-refill` | automatically resets the tray after all 6 are selected | off |
| `disabled` | disables pointer and keyboard input | off |

- **Keys:** Arrow keys move between the six wells, Space or Enter toggles the focused fruit, and Escape resets the tray.
- **Tap any well:** tap an intact fruit to cleave and select it, or tap an already cleaved well to deselect and roll that fruit back in.
- **Form-associated:** with a `name`, its `FormData` entry is the comma-separated list of selected fruit keys.

## What happens

| you | it |
|---|---|
| sweep across wells | cleaves every fruit your stroke touches and blends their distinct nectar pigments on the porcelain |
| swipe upward | launches only the swiped fruits into a multi-color mid-air bouquet for Quad / Penta / Hexa / Octa combos |
| tap a cleaved well | deselects that single swatch and rolls a fresh whole fruit back into its dimple |
| Arrow keys + Space / Enter | moves through the 3×2 grid and toggles individual swatches |

## Limits

- **Six fixed fruit swatches** (`bloodOrange`, `yuzu`, `kiwi`, `strawberry`, `fig`, `watermelon`).
- **WebGL2 for the viscous nectar layer.** Without WebGL2, the porcelain hardware, 3D fruit split and keyboard controls still work through a 2D canvas fallback, without the GPU nectar shader.
- **One canvas per element.** Each element uses its own WebGL2 context, and browsers keep roughly sixteen alive at once, so it is for hero controls and settings, not long lists.
- **Touch gestures capture swipes inside the frame.** Because upward swipes launch fruit into the air for mid-air combos, the canvas sets `touch-action: none`; leave breathing room around the control on mobile pages so visitors can scroll past it.
- **Drawn for a warm light page.** The alabaster porcelain stage and shadows assume a pale background (`#F1EAE0` or light neutral paper).
- **Single-file payload.** The photographed fruit sprites are embedded as WebP data URIs inside each file (roughly 210 to 630 KB); load only the controls you use.
- **Sound plays after the first gesture.** `FruitStudio.Sound.on = false` silences every control on the page.
- **Checked in headless Chromium** with real mouse, touch and keyboard events at 390 px phone width. Not yet tried in Safari or Firefox, on a real phone, or with a screen reader.
