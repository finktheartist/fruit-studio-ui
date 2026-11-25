// node look.mjs URL TAG OUT.png "0.1:el.toggle()" "0,0.12,0.28,0.55,1.0"
// Pauses FruitStudio, runs scheduled actions, steps deterministically at 60 fps and stitches frames side by side.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [URL_, TAG, OUT, ACTS = '', TIMES = '0,0.2,0.5,1.0'] = process.argv.slice(2);
if (!URL_ || !TAG || !OUT) {
  console.error('usage: node look.mjs URL TAG OUT.png "t:js; t:js" "t0,t1,t2"');
  process.exit(1);
}

const tmpBase = process.platform === 'linux' && existsSync('/tmp') ? '/tmp' : tmpdir();
const PROFILE = mkdtempSync(join(tmpBase, 'fs-look-'));
const PORT = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const CHROME = process.env.CHROME || ['/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((f) => existsSync(f)) || 'chromium';
const extra = process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
const env = process.platform === 'linux' ? { ...process.env, TMPDIR: tmpBase, XDG_RUNTIME_DIR: tmpBase } : process.env;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader', ...extra, 'about:blank'], { env, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (Array.isArray(targets) && targets.length) break; } catch {} await sleep(150); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let cid = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++cid; pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => r.result.value);

await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 2, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await sleep(1200);

const actions = ACTS.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
  const i = s.indexOf(':');
  return { t: Number(s.slice(0, i)), code: s.slice(i + 1).trim(), done: false };
});
const times = TIMES.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);

await ev('FruitStudio.paused = true;');
const shots = [];
let now = 0;
const dt = 1 / 60;
for (const targetT of times) {
  while (now + 1e-6 < targetT) {
    for (const a of actions) {
      if (!a.done && now + 1e-6 >= a.t) {
        a.done = true;
        await ev(`(() => { const el = document.querySelector(${JSON.stringify(TAG)}); ${a.code}; })()`);
      }
    }
    const step = Math.min(dt, targetT - now);
    await ev(`FruitStudio.advance(${step})`);
    now += step;
  }
  for (const a of actions) {
    if (!a.done && now + 1e-6 >= a.t) {
      a.done = true;
      await ev(`(() => { const el = document.querySelector(${JSON.stringify(TAG)}); ${a.code}; })()`);
    }
  }
  const box = JSON.parse(await ev(`(() => { const b = document.querySelector(${JSON.stringify(TAG)}).getBoundingClientRect(); return JSON.stringify({ x: b.left, y: b.top, width: b.width, height: b.height }); })()`));
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
  shots.push({ t: targetT, data });
}

// Stitch horizontally inside the page via canvas so there are zero external dependencies.
const b64 = await ev(`(async () => {
  const shots = ${JSON.stringify(shots)};
  const imgs = await Promise.all(shots.map((s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s.data; })));
  const gap = 12, pad = 12, labH = 26;
  const w = pad * 2 + imgs.reduce((a, i) => a + i.width, 0) + gap * (imgs.length - 1);
  const h = pad * 2 + labH + Math.max(...imgs.map((i) => i.height));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#F1EAE0'; g.fillRect(0, 0, w, h);
  g.font = '600 18px system-ui, sans-serif'; g.fillStyle = '#1C1815';
  let x = pad;
  imgs.forEach((im, idx) => {
    g.drawImage(im, x, pad + labH);
    g.fillText('t = ' + shots[idx].t.toFixed(2) + 's', x, pad + 18);
    x += im.width + gap;
  });
  return c.toDataURL('image/png').split(',')[1];
})()`);

writeFileSync(OUT, Buffer.from(b64, 'base64'));
console.log('wrote', OUT, `(${shots.length} frames)`);
ws.close(); chrome.kill(); await sleep(200);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
