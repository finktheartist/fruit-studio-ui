// node tools/test.mjs [URL]   drives every control in the gallery with real touch, pointer and key events at phone width,
// checks FormData values, responsive scaling and sideways scroll, and exits 1 on a failure.
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:8000/gallery/';
const PORT = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const tmpBase = process.platform === 'linux' && existsSync('/tmp') ? '/tmp' : tmpdir();
const PROFILE = mkdtempSync(join(tmpBase, 'fs-test-'));
const CHROME = process.env.CHROME || ['/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((f) => existsSync(f)) || 'chromium';
const extra = process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
const env = process.platform === 'linux' ? { ...process.env, TMPDIR: tmpBase, XDG_RUNTIME_DIR: tmpBase } : process.env;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader', ...extra, 'about:blank'], { env, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (Array.isArray(targets) && targets.length) break; } catch {} await sleep(150); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) logs.push('EVAL ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await sleep(1600);

const E = (tag) => `document.querySelector('${tag}')`;
const at = async (tag, fx = 0.5, fy = 0.5) => JSON.parse(await ev(`(() => { const e = ${E(tag)}; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return JSON.stringify([b.left + b.width * ${fx}, b.top + b.height * ${fy}]); })()`));
const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const swipe = async (x0, y0, x1, y1, steps = 8) => {
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    await sleep(22);
  }
  await touch('touchEnd', x1, y1);
};
const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, ...(k === 'Enter' ? { text: '\r' } : k === ' ' ? { text: ' ' } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
};
const focus = (tag) => ev(`${E(tag)}.focus()`);

await ev(`window.__n = {}; for (const t of ['input', 'change', 'confirm', 'reset']) document.addEventListener(t, (e) => { const k = e.target.localName + ' ' + t; __n[k] = (__n[k] || 0) + 1; })`);
const fired = (k) => ev(`__n[${JSON.stringify(k)}] || 0`);

let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== undefined ? `  ->  ${got}` : ''}`); };

{ // 1. Chop toggle: swipe cleaves it on, Space flips it off
  const on = () => ev(`${E('fruit-toggle')}.checked`);
  const [x0, y0] = await at('fruit-toggle', 0.30, 0.22);
  const [x1, y1] = await at('fruit-toggle', 0.48, 0.78);
  await sleep(150);
  await swipe(x0, y0, x1, y1);
  await sleep(400);
  check('toggle: swipe cleaves it on and fires change', (await on()) === true && (await fired('fruit-toggle change')) === 1, `${await on()} / ${await fired('fruit-toggle change')}`);
  await focus('fruit-toggle');
  await key(' ', 32);
  await sleep(300);
  check('toggle: Space flips it off', (await on()) === false && (await fired('fruit-toggle change')) === 2, await on());
}

{ // 2. Berry stepper: sweep across berries raises value, ArrowLeft lowers, Home refills to 0
  const val = () => ev(`${E('fruit-stepper')}.value`);
  const [x0, y0] = await at('fruit-stepper', 0.16, 0.52);
  const [x1, y1] = await at('fruit-stepper', 0.68, 0.52);
  await sleep(150);
  await swipe(x0, y0, x1, y1, 12);
  await sleep(350);
  const v1 = await val();
  check('stepper: continuous sweep cleaves multiple berries with input + change', v1 >= 3 && (await fired('fruit-stepper input')) >= 1 && (await fired('fruit-stepper change')) >= 1, v1);
  await focus('fruit-stepper');
  await key('ArrowLeft', 37);
  await sleep(250);
  check('stepper: ArrowLeft restores one berry', (await val()) === v1 - 1, await val());
  await key('Home', 36);
  await sleep(250);
  check('stepper: Home refills all berries to 0', (await val()) === 0, await val());
}

{ // 3. Burst pedestal: hold until 360° burst confirms ✓, Space resets to poised
  const conf = () => ev(`${E('fruit-button')}.confirmed`);
  const [x, y] = await at('fruit-button', 0.50, 0.48);
  await sleep(150);
  await touch('touchStart', x, y);
  for (let i = 0; i < 30 && !(await conf()); i++) await sleep(120);
  await touch('touchEnd', x, y);
  await sleep(200);
  check('button: holding 0.66s triggers 360° burst and fires confirm', (await conf()) === true && (await fired('fruit-button confirm')) >= 1, await conf());
  await focus('fruit-button');
  await key(' ', 32);
  await sleep(250);
  check('button: Space resets confirmed pedestal back to fresh fig', (await conf()) === false && (await fired('fruit-button reset')) >= 1, await conf());
}

{ // 4. Swatch matrix: sweep across top row selects multiple fruits, Escape resets tray
  const sel = () => ev(`${E('fruit-matrix')}.selected`);
  const [x0, y0] = await at('fruit-matrix', 0.24, 0.37);
  const [x1, y1] = await at('fruit-matrix', 0.76, 0.37);
  await sleep(150);
  await swipe(x0, y0, x1, y1, 12);
  await sleep(350);
  const s1 = await sel();
  check('matrix: horizontal sweep selects multiple fruits and fires change', s1.length >= 2 && (await fired('fruit-matrix change')) >= 1, s1.join(','));
  await focus('fruit-matrix');
  await key('Escape', 27);
  await sleep(250);
  check('matrix: Escape resets all six swatches', (await sel()).length === 0, (await sel()).length);
}

{ // 5. Forms: toggle, stepper and matrix all submit cleanly via FormData
  const got = await ev(`(() => {
    const f = document.createElement('form');
    f.innerHTML = '<fruit-toggle name="t" checked></fruit-toggle><fruit-stepper name="s" value="3"></fruit-stepper><fruit-matrix name="m" value="bloodOrange,fig"></fruit-matrix>';
    document.body.append(f);
    const out = JSON.stringify(Object.fromEntries(new FormData(f)));
    f.remove();
    return out;
  })()`);
  check('forms: toggle, stepper and matrix submit in FormData', got === JSON.stringify({ t: 'on', s: '3', m: 'bloodOrange,fig' }), got);
}

{ // 6. Responsive 16:9 scaling: height follows CSS width
  const got = await ev(`(() => {
    const e = document.createElement('fruit-toggle');
    e.style.width = '160px';
    document.body.append(e);
    const b = e.getBoundingClientRect();
    e.remove();
    return Math.round(b.width) + ' ' + Math.round(b.height);
  })()`);
  check('scaling: 160 px wide element is 90 px high (16:9)', got === '160 90', got);
}

const wide = await ev('document.documentElement.scrollWidth');
check('no sideways scroll at 390 px', wide <= 390, wide);
check('no script errors', !logs.length, logs.join(' | '));

ws.close(); chrome.kill(); await sleep(250);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(fails ? 1 : 0);
