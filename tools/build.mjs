// Put each component file together from its parts, so each file works on its own.
//   <id>/<id>.js = header + core.js + the WebP fruit sprites it draws + src/elements/<id>.js
//   node tools/build.mjs          (run after editing core.js, art/, src/elements/ or tools/spec.mjs)
//   node tools/build.mjs --check  (exits 1 if anything is out of date, and changes nothing)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC, FRUITS_BY_CONTROL, REPO } from './spec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8').trim();
const b64 = (f) => readFileSync(join(root, f)).toString('base64');
const check = process.argv.includes('--check');

export const core = read('core.js');

const TAKE = `const FS = window.FruitStudio;
const {
  StudioLiquidEngine,
  FruitElement,
  FRUITS: STUDIO_FRUITS,
  getLoadedFruits,
  getComboTierInfo,
  computeCircleCutGeometry,
  roundRectPath,
  drawPhotoWholeFruit,
  drawPhotoSlicedHalf3D,
  drawPhotoFlatCutHalf,
  drawPhotoSlicedChunk3D,
} = FS;`;

let stale = 0;
const put = (rel, next) => {
  let was = ''; try { was = readFileSync(join(root, rel), 'utf8'); } catch {}
  if (next !== was) {
    stale++;
    if (!check) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), next); }
    console.log(`${check ? 'stale' : 'wrote'} ${rel} (${Math.round(next.length / 1024)} KB)`);
  }
};

const wrapLines = (s, n = 112) => s.split(' ').reduce((a, w) => {
  const l = a[a.length - 1];
  if ((l + ' ' + w).length > n) a.push(w);
  else a[a.length - 1] = l ? l + ' ' + w : w;
  return a;
}, ['']);

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const c of SPEC) {
    const fruits = FRUITS_BY_CONTROL[c.id] || [];
    const head = [
      `Fruit Studio ${c.name}: ${c.desc}`,
      '',
      `One file, no dependencies. Load it with a script tag and use <${c.tag}>. ${c.docs}`,
      '',
      `Built by tools/build.mjs in github.com/${REPO}: the shared core (WebGL2 viscous nectar fluid optics, macro 3D`,
      'fruit physics, Web Audio foley and FruitElement base), the photographed fruit WebP sprites this control uses,',
      'and the custom element.',
    ].flatMap((l) => (l ? wrapLines(l) : [''])).map((l) => ('// ' + l).trimEnd()).join('\n');

    const artBlock = fruits.length
      ? `FS.addFruits({\n${fruits.map((k) => `  ${k}: {\n    whole: 'data:image/webp;base64,${b64(`art/${k}-whole.webp`)}',\n    cut: 'data:image/webp;base64,${b64(`art/${k}-cut.webp`)}',\n  },`).join('\n')}\n});\n`
      : '';

    put(`${c.id}/${c.id}.js`, `${head}
// >>> fruit studio core (core.js; edit that, not this)
${core}
// <<< fruit studio core
(() => {
'use strict';
${TAKE}
// >>> fruit art (art/)
${artBlock}// <<< fruit art
if (customElements.get('${c.tag}')) return;
// >>> element (src/elements/${c.id}.js)
${read(`src/elements/${c.id}.js`)}
// <<< element
})();
`);
  }
  put('skills/fruit-studio-ui/core.js', core + '\n');
  if (check && stale) process.exit(1);
}
