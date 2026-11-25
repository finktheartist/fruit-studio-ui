// What each control is, in one place. tools/docs.mjs turns this into every folder's README.md and index.html,
// registry.json and llms.txt, so they cannot drift apart. Edit here, then run `node tools/docs.mjs`.
export const REPO = 'finktheartist/fruit-studio-ui';
export const SITE = 'https://fruit-studio-ui.vercel.app';
export const AUTHOR = 'Justin Finkelman <https://github.com/finktheartist>';
export const COUNT = 'four';

export const FRUITS_BY_CONTROL = {
  toggle: ['bloodOrange', 'yuzu', 'kiwi', 'watermelon'],
  stepper: ['strawberry'],
  button: ['fig'],
  matrix: ['bloodOrange', 'yuzu', 'kiwi', 'strawberry', 'fig', 'watermelon'],
};

// Limits every control shares; each README ends with its own, then these.
export const COMMON_LIMITS = [
  '**WebGL2 for the viscous nectar layer.** Without WebGL2, the porcelain hardware, 3D fruit split and keyboard controls still work through a 2D canvas fallback, without the GPU nectar shader.',
  '**One canvas per element.** Each element uses its own WebGL2 context, and browsers keep roughly sixteen alive at once, so it is for hero controls and settings, not long lists.',
  '**Touch gestures capture swipes inside the frame.** Because upward swipes launch fruit into the air for mid-air combos, the canvas sets `touch-action: none`; leave breathing room around the control on mobile pages so visitors can scroll past it.',
  '**Drawn for a warm light page.** The alabaster porcelain stage and shadows assume a pale background (`#F1EAE0` or light neutral paper).',
  '**Single-file payload.** The photographed fruit sprites are embedded as WebP data URIs inside each file (roughly 210 to 630 KB); load only the controls you use.',
  '**Sound plays after the first gesture.** `FruitStudio.Sound.on = false` silences every control on the page.',
  '**Checked in headless Chromium** with real mouse, touch and keyboard events at 390 px phone width. Not yet tried in Safari or Firefox, on a real phone, or with a screen reader.',
];

export const SPEC = [
  {
    id: 'toggle',
    name: 'Chop toggle',
    tag: 'fruit-toggle',
    categories: ['toggle', 'switch', 'fruit', 'webgl', 'animation'],
    sub: 'A porcelain switch you cleave to flip.',
    desc: 'A binary switch whose thumb is a macro-photographed fruit resting in a matte alabaster track. Swipe through it to cleave the fruit in 3D, splash viscous nectar across the ceramic, and flip the switch; swipe upward to launch the halves into mid-air for continuous multi-piece combos.',
    docs: 'then use <fruit-toggle label="Ambient mode"></fruit-toggle>. Read el.checked and listen for change. Works in forms with a name.',
    intro: [
      'A binary switch built as a recessed alabaster porcelain pill cradling a studio-photographed fruit: Blood Orange, Golden Yuzu, Fuzzy Kiwi and Watermelon in rotation. Swipe across the fruit to cleave it along your exact blade angle and speed — the two 3D spherical-cap halves separate cleanly with off-center mass physics, a Beer-Lambert viscous nectar splat blooms across the ceramic, and the next fruit glides smoothly into the opposite end of the track.',
      'Swipe downward or sideways and the halves tumble naturally off the bottom edge. Swipe upward through the fruit and only that fruit launches into upper-frame hang-time — keep your finger down across the floating halves to dice them into quarters and eighths for Double, Triple, Quad and Penta combos. Clicking or pressing Space / Enter cleaves the switch cleanly for mouse and keyboard users.',
    ],
    demo: {
      html: '<div class="field"><span class="lab">Porcelain switch</span><output id="out"></output></div>\n    <fruit-toggle id="el" label="Porcelain switch"></fruit-toggle>\n    <div class="row"><button class="pill" type="button" id="clear">Clear ceramic</button></div>',
      hint: 'Swipe across the fruit to toggle, or swipe UP to launch halves for mid-air combos. Click, Space or Enter also flips it.',
      script: "const out = document.getElementById('out'); const show = () => out.textContent = el.checked ? 'On' : 'Off'; el.addEventListener('change', show); show(); document.getElementById('clear').onclick = () => el.clear();",
    },
    use: '<script src="toggle.js"></script>\n<fruit-toggle label="Porcelain switch"></fruit-toggle>',
    js: "const el = document.querySelector('fruit-toggle');\nel.addEventListener('change', (e) => setEnabled(e.detail.checked));\nel.toggle();          // programmatic cleave\nel.fruit = 'kiwi';    // bloodOrange, yuzu, kiwi, watermelon\nel.clear();           // wipe nectar from the ceramic",
    attrs: [
      ['`checked`', 'starts on', 'off'],
      ['`fruit`', 'starting fruit (`bloodOrange`, `yuzu`, `kiwi`, `watermelon`)', '`bloodOrange`'],
      ['`label`', 'accessible name for screen readers', '`Chop toggle`'],
      ['`name`', 'sent with its form when on', ''],
      ['`value`', 'form value sent when on', '`on`'],
      ['`disabled`', 'disables pointer and keyboard input', 'off'],
    ],
    notes: [
      '**A switch underneath:** `role="switch"` with `aria-checked`. Click, swipe, Space or Enter flips it.',
      '**Form-associated:** with a `name`, it submits `value` (default `"on"`) when checked and omits itself when off, like a native checkbox.',
      '**True swipe physics:** cut angle, blade speed, curvature and off-center chord offset drive the 3D split, angular momentum and WebGL2 nectar splash.',
    ],
    happens: [
      ['swipe sideways or down', 'cleaves the fruit along your exact cut line, splashes viscous nectar on the porcelain, drops the halves off-screen and glides the next fruit into the opposite slot'],
      ['swipe upward', 'launches only the cleaved fruit halves upward into hang-time so you can keep your finger down and dice them for Double / Triple / Quad / Penta combos'],
      ['click, Space or Enter', 'cleaves the current fruit cleanly and toggles the switch'],
      ['call `el.clear()`', 'wipes accumulated viscous nectar pools and beads off the ceramic surface'],
    ],
    limits: [
      '**Fixed 16:9 stage aspect ratio.** Give the element any CSS `width` and its height follows cleanly.',
    ],
  },
  {
    id: 'stepper',
    name: 'Berry stepper',
    tag: 'fruit-stepper',
    categories: ['stepper', 'slider', 'input', 'fruit', 'webgl', 'animation'],
    sub: 'Five crimson strawberries in a recessed porcelain rail.',
    desc: 'A five-step segmented stepper rail holding five macro-photographed strawberries. Sweep across one to five berries in a single stroke to cleave them, reveal their glossy ruby hearts and splash crimson nectar across the porcelain; swipe upward to launch caps into mid-air combos.',
    docs: 'then use <fruit-stepper value="0" label="Intensity"></fruit-stepper>. Read el.value (0–5); it fires input while sweeping and change when the stroke ends. Works in forms with a name.',
    intro: [
      'A five-step matte-white porcelain rail with five sculpted concave dimples, each cradling a macro-photographed crimson strawberry (0/5 through 5/5). Sweep across one or all five berries in a single continuous stroke: every cleaved dimple reveals a glistening sliced strawberry heart ringed with translucent ruby nectar while its severed cap launches with your exact swipe angle and velocity.',
      'Swipe upward across the rail to launch only the swiped berries\' caps into upper-frame hang-time and keep sweeping through them mid-air for Triple, Quad, Penta and Hexa combos. Tap an intact berry to step it on, tap a cleaved dimple to restore that berry, or use Arrow keys, Home and End.',
    ],
    demo: {
      html: '<div class="field"><span class="lab">Intensity</span><output id="out"></output></div>\n    <fruit-stepper id="el" value="0" label="Intensity"></fruit-stepper>\n    <div class="row"><button class="pill" type="button" id="refill">Refill berries</button><button class="pill" type="button" id="clear">Clear ceramic</button></div>',
      hint: 'Sweep across 1–5 berries in one stroke, swipe UP to juggle caps mid-air, or tap any dimple to toggle it.',
      script: "const out = document.getElementById('out'); const show = () => out.textContent = el.value + ' / 5'; el.addEventListener('input', show); el.addEventListener('change', show); show(); document.getElementById('refill').onclick = () => el.refill(); document.getElementById('clear').onclick = () => el.clear();",
    },
    use: '<script src="stepper.js"></script>\n<fruit-stepper value="2" label="Intensity"></fruit-stepper>',
    js: "const el = document.querySelector('fruit-stepper');\nel.addEventListener('input', (e) => preview(e.detail.value));\nel.addEventListener('change', (e) => save(e.detail.value));\nel.value = 3;         // 0..5\nel.refill();          // restore all five berries",
    attrs: [
      ['`value`', 'starting count (`0` to `5`)', '`0`'],
      ['`label`', 'accessible name for screen readers', '`Berry stepper`'],
      ['`name`', 'sent with its form (`"0"`..`"5"`)', ''],
      ['`auto-refill`', 'automatically refills the rail after hitting `5`', 'off'],
      ['`disabled`', 'disables pointer and keyboard input', 'off'],
    ],
    notes: [
      '**A slider underneath:** `role="slider"` with `aria-valuemin="0"`, `aria-valuemax="5"` and `aria-valuenow`. ArrowRight/Up cleaves the next berry, ArrowLeft/Down restores the last cleaved berry, Home refills to 0 and End steps to 5.',
      '**Tap to toggle individual berries:** tap an intact berry to cleave it, or tap an already cleaved heart to restore it.',
      '**Form-associated:** with a `name`, its current count (`"0"`..`"5"`) is included in `FormData`.',
    ],
    happens: [
      ['sweep across the rail', 'cleaves every berry your stroke crosses, reveals glossy ruby hearts and blooms crimson nectar out of each dimple'],
      ['swipe upward', 'launches only the swiped berries\' caps upward into hang-time so one continuous stroke can chain Penta and Hexa combos'],
      ['tap a cleaved dimple', 'restores that berry cleanly with a ceramic tick'],
      ['Arrow keys / Home / End', 'steps the count up or down one berry at a time, or jumps to 0 / 5'],
    ],
    limits: [
      '**Five fixed steps (0–5).** Designed for discrete ratings, intensity levels and short multi-step settings.',
    ],
  },
  {
    id: 'button',
    name: 'Burst pedestal',
    tag: 'fruit-button',
    categories: ['button', 'confirm', 'hold', 'fruit', 'webgl', 'animation'],
    sub: 'Press and hold a Black Mission Fig to confirm.',
    desc: 'A press-to-confirm pedestal cradling a macro-photographed Black Mission Fig. Hold for 0.66 seconds to compress the fig and fill its 360° wine-plum rim until it erupts in a radial hydraulic burst and lights a checkmark; or slash upward through the fig for mid-air combos.',
    docs: 'then use <fruit-button label="Confirm publish"></fruit-button>. Listen for confirm (and reset). el.confirmed reflects the state; el.burst() and el.reset() drive it from code.',
    intro: [
      'A concentric circular matte-porcelain confirm pedestal holding a studio-photographed Black Mission Fig. Press and hold for two-thirds of a second: the velvety dark fig compresses under hydraulic tension with crisp ceramic ticks while a recessed wine-plum progress ring fills 360° around the rim. At full compression, a hydraulic burst erupts a radial wine-plum crown across the porcelain, exposes the glistening ruby fig heart and lights a crisp confirmation checkmark.',
      'Slash or swipe upward across the pedestal at any time to cleave the fig along your blade angle and launch both halves upward for continuous mid-air combos. Tap the confirmed pedestal (or press Space / Enter) to cycle cleanly between confirmed and fresh states.',
    ],
    demo: {
      html: '<div class="field"><span class="lab">Confirm action</span><output id="out"></output></div>\n    <fruit-button id="el" label="Confirm action"></fruit-button>\n    <div class="row"><button class="pill" type="button" id="reset">Fresh fig</button><button class="pill" type="button" id="clear">Clear ceramic</button></div>',
      hint: 'Press and hold the fig for 0.66 s to trigger the 360° hydraulic burst, or swipe UP across it for mid-air combos.',
      script: "const out = document.getElementById('out'); const show = () => out.textContent = el.confirmed ? 'Confirmed ✓' : 'Poised'; el.addEventListener('confirm', show); el.addEventListener('reset', show); show(); document.getElementById('reset').onclick = () => el.reset(); document.getElementById('clear').onclick = () => el.clear();",
    },
    use: '<script src="button.js"></script>\n<fruit-button label="Confirm publish"></fruit-button>',
    js: "const el = document.querySelector('fruit-button');\nel.addEventListener('confirm', () => publishNow());\nel.addEventListener('reset', () => cancelState());\nel.burst();           // trigger hydraulic burst\nel.reset();           // roll in a fresh fig",
    attrs: [
      ['`confirmed`', 'starts in the confirmed state (`✓`)', 'off'],
      ['`label`', 'accessible name for screen readers', '`Confirm`'],
      ['`disabled`', 'disables pointer and keyboard input', 'off'],
    ],
    notes: [
      '**A button underneath:** `role="button"` with `aria-pressed`. Space or Enter triggers the hydraulic burst, and pressing again resets to a fresh fig.',
      '**Hold-to-confirm prevents accidental clicks:** releasing before the 360° wine-plum rim completes eases tension back down without firing `confirm`.',
      '**Slash shortcut:** swiping across the fig also cleaves and toggles confirmation, with upward swipes launching halves for mid-air combos.',
    ],
    happens: [
      ['press and hold (0.66 s)', 'compresses the fig with tactile rim ticks as the wine-plum ring fills 360°, then erupts a radial hydraulic burst, reveals the ruby heart and fires `confirm`'],
      ['release early', 'tension relaxes cleanly back to poised with no confirmation fired'],
      ['tap while confirmed', 'rolls a fresh Black Mission Fig back onto the pedestal and fires `reset`'],
      ['swipe upward', 'cleaves the fig and launches both halves into hang-time for continuous mid-air re-slicing'],
    ],
    limits: [
      '**Not a submit input.** Listen for the `confirm` event to trigger your action.',
    ],
  },
  {
    id: 'matrix',
    name: 'Swatch matrix',
    tag: 'fruit-matrix',
    categories: ['checkbox', 'selection', 'palette', 'fruit', 'webgl', 'animation'],
    sub: 'A 3×2 porcelain bento tray of all six fruits.',
    desc: 'A 3×2 multi-select palette cradling all six photographed studio fruits (Blood Orange, Yuzu, Kiwi, Strawberry, Fig, Watermelon). Sweep through any combination in one continuous stroke to mix translucent nectar pigments on the GPU, tap any cleaved well to deselect it, or swipe upward for multi-color mid-air combos.',
    docs: 'then use <fruit-matrix name="flavors"></fruit-matrix>. Read el.selected (array of fruit keys) or el.value (comma-separated); listen for change. Works in forms with a name.',
    intro: [
      'A sculpted 3×2 matte-porcelain bento tray uniting all six studio-photographed fruits: Blood Orange, Golden Yuzu and Fuzzy Kiwi on the top row; Ripe Strawberry, Black Mission Fig and Watermelon on the bottom row. Sweep across any combination of wells in a single stroke — each cleaved fruit reveals its glistening heart while its distinct translucent nectar pigment (crimson, gold, emerald, ruby, wine-plum and coral-red) mixes organically on the shared WebGL2 fluid layer.',
      'Swipe upward across multiple wells to launch only those swiped fruits into a multi-color mid-air bouquet for Quad, Penta, Hexa and Octa combos. Tap any selected well to deselect and restore that fruit, tap an intact well to select it, or navigate with Arrow keys and Space / Enter.',
    ],
    demo: {
      html: '<div class="field"><span class="lab">Selected swatches</span><output id="out"></output></div>\n    <fruit-matrix id="el" name="fruits" label="Fruit palette"></fruit-matrix>\n    <div class="row"><button class="pill" type="button" id="reset">Reset tray</button><button class="pill" type="button" id="clear">Clear ceramic</button></div>',
      hint: 'Sweep across any combination of 1–6 fruits, swipe UP for multi-color bouquet combos, or tap a cleaved well to deselect it.',
      script: "const out = document.getElementById('out'); const show = () => out.textContent = el.selected.length ? el.selected.length + ' / 6 · ' + el.selected.join(', ') : '0 / 6'; el.addEventListener('change', show); show(); document.getElementById('reset').onclick = () => el.reset(); document.getElementById('clear').onclick = () => el.clear();",
    },
    use: '<script src="matrix.js"></script>\n<fruit-matrix name="palette" value="bloodOrange,kiwi"></fruit-matrix>',
    js: "const el = document.querySelector('fruit-matrix');\nel.addEventListener('change', (e) => applyPalette(e.detail.selected));\nel.toggleFruit('fig');          // bloodOrange, yuzu, kiwi, strawberry, fig, watermelon\nel.selected = ['yuzu', 'fig'];  // set from code\nel.reset();                     // restore all six fruits",
    attrs: [
      ['`value`', 'comma-separated selected keys (e.g. `bloodOrange,kiwi`)', 'empty'],
      ['`label`', 'accessible name for screen readers', '`Fruit swatch matrix`'],
      ['`name`', 'sent with its form as a comma-separated list', ''],
      ['`auto-refill`', 'automatically resets the tray after all 6 are selected', 'off'],
      ['`disabled`', 'disables pointer and keyboard input', 'off'],
    ],
    notes: [
      '**Keys:** Arrow keys move between the six wells, Space or Enter toggles the focused fruit, and Escape resets the tray.',
      '**Tap any well:** tap an intact fruit to cleave and select it, or tap an already cleaved well to deselect and roll that fruit back in.',
      '**Form-associated:** with a `name`, its `FormData` entry is the comma-separated list of selected fruit keys.',
    ],
    happens: [
      ['sweep across wells', 'cleaves every fruit your stroke touches and blends their distinct nectar pigments on the porcelain'],
      ['swipe upward', 'launches only the swiped fruits into a multi-color mid-air bouquet for Quad / Penta / Hexa / Octa combos'],
      ['tap a cleaved well', 'deselects that single swatch and rolls a fresh whole fruit back into its dimple'],
      ['Arrow keys + Space / Enter', 'moves through the 3×2 grid and toggles individual swatches'],
    ],
    limits: [
      '**Six fixed fruit swatches** (`bloodOrange`, `yuzu`, `kiwi`, `strawberry`, `fig`, `watermelon`).',
    ],
  },
];
