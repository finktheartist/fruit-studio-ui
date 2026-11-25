// Write every folder's README.md and index.html, registry.json and llms.txt from tools/spec.mjs.
//   node tools/docs.mjs          (run after editing tools/spec.mjs or rebuilding)
//   node tools/docs.mjs --check  (exits 1 if anything is out of date, and changes nothing)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC, REPO, SITE, AUTHOR, COMMON_LIMITS, COUNT } from './spec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
let stale = 0;
const put = (rel, next) => {
  let was = ''; try { was = readFileSync(join(root, rel), 'utf8'); } catch {}
  if (next !== was) { stale++; if (!check) writeFileSync(join(root, rel), next); console.log(`${check ? 'stale' : 'wrote'} ${rel}`); }
};
const kb = (id) => Math.round(statSync(join(root, id, id + '.js')).size / 1024 / 10) * 10;
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

for (const c of SPEC) {
  put(`${c.id}/README.md`, `# ${c.name}

${c.intro.join('\n\n')}

One of ${COUNT} files in this repo. Same material system in each (macro-photographed fruit on matte alabaster porcelain with GPU viscous nectar physics), different control.

## Run it

\`\`\`sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/${c.id}/
\`\`\`

\`?embed=1\` hides the heading and the hint.

## Use it

\`${c.id}.js\` is the whole control: one file of about ${kb(c.id)} KB with the WebGL2 nectar engine, Web Audio foley and photographed fruit sprites inside it, and no dependencies.

\`\`\`html
${c.use}
\`\`\`

\`\`\`js
${c.js}
\`\`\`

${c.attrs.length ? table(['attribute', 'what it sets', 'default'], c.attrs) + '\n\n' : ''}${c.notes.map((n) => `- ${n}`).join('\n')}

## What happens

${table(['you', 'it'], c.happens)}

## Limits

${[...c.limits, ...COMMON_LIMITS].map((l) => `- ${l}`).join('\n')}
`);

  const d = c.demo;
  put(`${c.id}/index.html`, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fruit Studio ${c.name}</title>
<link rel="icon" href="data:,">
<style>
  :root { --page: #F1EAE0; --card: #F6F1EA; --ink: #1C1815; --mute: rgba(28, 24, 21, 0.54); --line: rgba(92, 74, 56, 0.14); }
  html { overflow-x: clip; background: var(--page); }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; overflow-x: clip; }
  main { width: min(600px, 100vw - 28px); padding: 36px 0 52px; text-align: center; }
  h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -.02em; }
  .sub { margin: 4px 0 0; color: var(--mute); }
  .stage { display: grid; justify-items: center; gap: 12px; padding: 22px 0 16px; }
  .stage > :is(fruit-toggle, fruit-stepper, fruit-button, fruit-matrix) { width: 100%; border-radius: 22px; box-shadow: 0 18px 42px rgba(72, 54, 38, 0.09); border: 1px solid var(--line); }
  .field { width: 100%; display: flex; justify-content: space-between; font-weight: 500; font-size: 14px; }
  .field output { color: var(--mute); font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .hint { margin: 0 4px; color: var(--mute); font-size: 13.5px; line-height: 1.45; }
  .back { margin-top: 14px; }
  .pill { font: inherit; font-size: 13.5px; padding: 6px 15px; border-radius: 999px; border: 1px solid rgba(28, 24, 21, 0.14); background: rgba(255, 253, 250, 0.88); color: inherit; cursor: pointer; }
  .pill:hover { background: #FFFFFF; }
  .pill.on { background: #1C1815; border-color: #1C1815; color: #FAF7F2; }
  a { color: inherit; } :focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
  code { font: 12.5px ui-monospace, monospace; padding: 1px 5px; border-radius: 5px; background: var(--card); border: 1px solid var(--line); }
  .embed body { place-items: start center; min-height: 0; }
  .embed h1, .embed .sub, .embed .hint, .embed .back, .embed .field, .embed .row { display: none; }
  .embed main { width: 100%; max-width: 640px; padding: 0; }
  .embed .stage { padding: 0; }
  .embed .stage > :is(fruit-toggle, fruit-stepper, fruit-button, fruit-matrix) { border-radius: 0; border: 0; box-shadow: none; }
</style>
</head>
<body>
<main>
  <h1>${c.name}</h1>
  <p class="sub">${c.sub} <code>&lt;${c.tag}&gt;</code></p>
  <div class="stage">
    ${d.html}
  </div>
  <p class="hint">${d.hint}</p>
  <p class="hint back"><button class="pill on" type="button" id="snd">Sound on</button> · <a href="../gallery/">All ${COUNT}</a> · <a href="https://github.com/${REPO}/blob/main/${c.id}/README.md">Docs</a></p>
</main>
<script src="${c.id}.js"></script>
<script>
// This page's own wiring. The control is all in ${c.id}.js.
// ?embed=1 hides the heading and the hint.
const Q = new URLSearchParams(location.search), el = document.getElementById('el');
if (Q.get('embed') === '1') document.documentElement.classList.add('embed');
const snd = document.getElementById('snd');
snd.onclick = () => {
  FruitStudio.Sound.wake();
  const on = FruitStudio.Sound.toggle();
  snd.textContent = on ? 'Sound on' : 'Sound off';
  snd.classList.toggle('on', on);
};
${d.script || ''}
</script>
</body>
</html>
`);
}

put('registry.json', JSON.stringify({
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'fruit-studio-ui',
  homepage: SITE,
  items: SPEC.map((c) => ({
    name: c.id,
    type: 'registry:file',
    title: `Fruit Studio ${c.name}`,
    description: `${c.desc} One file of about ${kb(c.id)} KB with its WebGL2 nectar engine, foley sound and fruit sprites inside it, no dependencies, defines <${c.tag}>.`,
    author: AUTHOR,
    categories: c.categories,
    files: [{ path: `${c.id}/${c.id}.js`, type: 'registry:file', target: `~/public/fruit-studio-ui/${c.id}.js` }],
    docs: `Fruit Studio ${c.name} is a plain script that registers a custom element. Load /fruit-studio-ui/${c.id}.js with a script tag (not a module), ${c.docs} More: ${SITE}`,
  })),
}, null, 2) + '\n');

put('llms.txt', `# Fruit Studio UI

> ${COUNT[0].toUpperCase() + COUNT.slice(1)} ordinary UI controls built from macro-photographed fruit resting on matte alabaster porcelain: a chop toggle, a five-berry stepper rail, a press-to-burst fig confirm pedestal, and a 3×2 six-fruit swatch matrix. Cleaving any fruit splits it in 3D with swipe-angle physics and blooms Beer-Lambert viscous nectar across the porcelain on the GPU; swiping upward launches cleaved fruit into hang-time for continuous multi-piece combos. Each control is one plain script that registers a custom element, with its WebGL2 engine, Web Audio foley and fruit WebP sprites inside it: no dependencies, no build step, no external fetches. MIT licensed.

Live gallery: ${SITE}
Source: https://github.com/${REPO}

## Drop-in controls

Each is one plain script that registers a custom element. Load it with a script tag, not as a module. Do not rewrite or split the file: the WebGL2 nectar engine, Web Audio foley and fruit sprites are inside it as data. Each file carries a copy of the shared core; the first one loaded sets window.FruitStudio and the rest reuse it.

${SPEC.map((c) => `- [${c.name}](${SITE}/${c.id}/${c.id}.js): ${c.desc} \`<${c.tag}>\`: ${c.docs.replace(/^then use /, 'Use ')} [Docs](https://github.com/${REPO}/blob/main/${c.id}/README.md)`).join('\n')}

Install any one with the shadcn CLI: \`npx shadcn add ${REPO}/NAME\`, where NAME is ${SPEC.map((c) => c.id).join(', ')}. The file lands in \`public/fruit-studio-ui/\`.

Each scales cleanly to its CSS width at a 16:9 aspect ratio, renders viscous nectar with WebGL2 (falling back to 2D canvas without it), and is drawn for a warm light page (\`#F1EAE0\`). Sound plays after the first user gesture; \`FruitStudio.Sound.on = false\` silences them all.

## The skill

- [fruit-studio-ui skill](${SITE}/skills/fruit-studio-ui/SKILL.md): how the set was made and the rules it follows. Install with \`npx skills add ${REPO}\`.
- [core.js](${SITE}/skills/fruit-studio-ui/core.js): the shared core (WebGL2 viscous nectar optics, 3D spherical-cap fruit physics, Web Audio foley, FruitElement base).
- [starter.html](${SITE}/skills/fruit-studio-ui/starter.html): the smallest whole example built on the core.
- [look.mjs](${SITE}/skills/fruit-studio-ui/look.mjs): stops the clock, drives an interaction and saves frames side by side.

## How it was made

- [making-of/README.md](${SITE}/making-of/README.md): the material concept, why two controls were cut, and how the WebGL2 nectar and upward-combo physics came together.
`);
if (check && stale) process.exit(1);
