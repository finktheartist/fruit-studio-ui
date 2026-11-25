---
name: fruit-studio-ui
description: Build, change or wire in a porcelain fruit UI control from Fruit Studio UI (macro-photographed fruit on matte alabaster porcelain with WebGL2 viscous nectar splats, swipe-angle 3D physics, upward-launch combos and synthesized Web Audio foley). Use when asked to add one of the fruit-* custom elements to an app, tweak how one reacts, or build a new control in the same style.
---

# Fruit Studio UI

A Fruit Studio control is an ordinary UI control (a switch, a 5-step stepper, a hold-to-confirm button, a 3×2 multi-select palette) built as matte alabaster porcelain hardware cradling macro-photographed fruit. Swiping through a fruit cleaves it in 3D along the user's exact blade chord and blooms Beer-Lambert viscous nectar across the porcelain on the GPU. Under the stage is a real accessible custom element (`switch`, `slider`, `button`, `group`) with keyboard and `<form>` support.

This skill comes with three files:

- `core.js`: the shared core. Sets `window.FruitStudio` with `StudioFluidGL` (WebGL2 viscous nectar optics + 2D fallback), `StudioLiquidEngine`, `Sound` (Web Audio foley), `FruitElement` (custom-element base class), shared 3D fruit renderers, and a single shared animation clock (`FruitStudio.paused`, `FruitStudio.advance(dt)`).
- `starter.html`: the smallest whole porcelain control built on `core.js`. Copy it to start a new control.
- `look.mjs`: pauses `FruitStudio`, steps an interaction to chosen timestamps, and saves frames side by side so you can inspect motion visually.

If the job is only to add an existing control to an app, skip to **Wire it in** and **Check it**.

## 1. The core

Load `core.js` and read everything from `window.FruitStudio`:

- **`FruitElement`**: extend it with `_createDemo(mount, opts)`, `_syncFromAttrs()`, `_onPointerDown/Move/Up`, `_onKeyDown`, and `_afterStep`. It mounts a 16:9 responsive Shadow DOM host, maps pointer events into logical `640 × 360` coordinates (handling CSS width and `zoom` cleanly), registers with the shared animation loop, and disposes WebGL2 contexts on disconnect.
- **`StudioLiquidEngine(mount, opts)`**: manages the alabaster porcelain surface, WebGL2 nectar pools (`beadness = 0`), micro-beads (`beadness = 1`), curving 3D airborne splash ribbons, seeds, razor slash trail, combo shock rings and editorial combo popups.
- **`addFruits(uriMap)`**: registers `{ whole, cut }` data URIs (or URLs) for any fruit keys used by the control and builds frosted inner-slice layers automatically.
- **`computeCircleCutGeometry(x1, y1, x2, y2, cx, cy, r)`**: computes exact chord offset, cut angle and 3D spherical-cap mass ratios (`massNeg`, `massPos`) from any pointer segment.
- **`Sound`**: Web Audio foley (`playSliceAir`, `playMacroChop`, `playCeramicSettle`, `playUpwardScoop`, `playComboChime`, `playBezelTick`, `playHydraulicBurst`). `FruitStudio.Sound.on = false` silences every control.
- **Deterministic clock**: set `FruitStudio.paused = true` and call `FruitStudio.advance(1 / 60)` to step every live control frame by frame.

## 2. Rules the set follows

- **Real control underneath.** Keep a real ARIA role (`switch`, `slider`, `button`, `group`), keyboard shortcuts, and `static formAssociated = true` for value controls.
- **No mid-air fade-out.** Cleaved fruit pieces stay 100% opaque and fall cleanly off the bottom of the stage.
- **Strict per-fruit upward launch.** Only fruit swiped upward (`uy < -0.22`) launches into hang-time; never spawn unrelated fruit from the bottom edge.
- **Continuous finger-down combos.** Keep `strokeHits` and `strokeAwardedPts` across a single pointerdown → pointerup stroke so sweeping through multiple pieces triggers Double, Triple, Quad, Penta and Hexa combos.
- **No focus ring under the pointer.** `FruitElement` sets `data-pointer` on pointer interaction and clears it on keyboard focus, so the focus outline appears only for keyboard users.
- **Warm light background.** The alabaster ceramic (`#F1EAE0`) and soft contact shadows assume a pale page.

## 3. Look before you ship

Drive an interaction frame by frame with `look.mjs`:

```sh
node look.mjs http://localhost:8000/toggle/ fruit-toggle out.png "0.1:el.toggle()" "0,0.12,0.28,0.55,1.0"
```

Check the sheet for clean 3D spherical-cap separation, glossy translucent nectar edges (no muddy opaque paint), crisp shadows, and nothing clipped unexpectedly at the frame border.

## 4. Wire it in

Each component (`toggle/toggle.js`, `stepper/stepper.js`, `button/button.js`, `matrix/matrix.js`) is one standalone script. Load it with a plain `<script src="...">` tag (not `type="module"`), do not split or rewrite the embedded sprites/engine, and read that control's `README.md` for its exact attributes and events.

## 5. Check it

- Test with real pointer/touch swipes and keyboard keys, not only property setters.
- Verify `<form>` submission (`FormData`) for `<fruit-toggle>`, `<fruit-stepper>`, and `<fruit-matrix>`.
- Verify zero horizontal scroll at 390 px mobile width and zero console errors.
