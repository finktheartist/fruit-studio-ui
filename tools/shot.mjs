// node tools/shot.mjs URL OUT W H SCALE
// Captures a crisp screenshot of the live gallery (or any control page) in headless Chromium.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [URL_ = 'http://localhost:8000/gallery/', OUT = 'gallery/title.jpg', W = '1200', H = '960', SCALE = '2'] = process.argv.slice(2);
const tmpBase = process.platform === 'linux' && existsSync('/tmp') ? '/tmp' : tmpdir();
const PROFILE = mkdtempSync(join(tmpBase, 'fs-shot-'));
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

await send('Emulation.setDeviceMetricsOverride', { width: Number(W), height: Number(H), deviceScaleFactor: Number(SCALE), mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await sleep(1600);

const isJpg = /\.jpe?g$/i.test(OUT);
const { data } = await send('Page.captureScreenshot', isJpg ? { format: 'jpeg', quality: 90 } : { format: 'png' });
writeFileSync(OUT, Buffer.from(data, 'base64'));
console.log('wrote', OUT, `${Math.round(Buffer.from(data, 'base64').length / 1024)} KB`);
ws.close(); chrome.kill(); await sleep(200);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
