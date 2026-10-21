// Contrast audit: every visible piece of text on every screen, in both themes,
// measured against what is actually painted behind it (the WCAG 2 contrast
// ratio). Run it after any colour change instead of eyeballing.
//
//   BROSPLIT_KEY=<api key> node --experimental-websocket scripts/contrast-audit.mjs \
//       [--at 2026-10-19T13:27:24Z] [--shots <dir>] [--port 8777]
//
// --at fakes the clock, so a day with sets can be audited as "today" (set rows,
// tags, the live rest timer). Needs `python3 serve.py 8777` running and Google
// Chrome. Read-only: it never presses Save, and turns usage stats off for its
// own throwaway browser profile.
//
// Thresholds: 4.5:1 for text, 3:1 for large text (24px, or 18.7px bold), for
// icon glyphs, and for chart lines and markers. Emoji are skipped (they bring
// their own colours), as are disabled controls (WCAG exempts them).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, dflt = null) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const KEY = process.env.BROSPLIT_KEY;
if (!KEY) { console.error('Set BROSPLIT_KEY to the API key (as pasted on a phone, without ---Name).'); process.exit(2); }
const PORT = arg('port', '8777');
const AT = arg('at');
const SHOTS = arg('shots');
const OWNER = process.env.BROSPLIT_OWNER || 'Prabhashwara';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profileDir = mkdtempSync(join(tmpdir(), 'brosplit-audit-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${profileDir}`, `--remote-debugging-port=${DBG}`, 'about:blank'], { stdio: 'ignore' });
const done = (code) => { try { chrome.kill(); } catch {} rmSync(profileDir, { recursive: true, force: true }); process.exit(code); };

let target;
for (let i = 0; i < 60 && !target; i++) {
  try { target = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); }
}
if (!target) { console.error('Chrome did not start'); done(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result?.result?.value;
};
const go = async (h, ms = 2600) => { await ev(`location.hash = ${JSON.stringify('#/' + h)}`); await sleep(ms); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
// Animations finish instantly-ish, so nothing is caught mid-fade.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

/* ------------------------------------------------------------------------ */
/* Runs in the page. Self-contained: it is sent as source.                   */
function pageAudit(route, scope) {
  const toRGBA = (s) => {
    if (!s || s === 'transparent' || s === 'none') return null;
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = /^color\(srgb ([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const stops = (img) => (img.match(/rgba?\([^)]+\)|color\(srgb[^)]+\)/g) || []).map(toRGBA).filter(Boolean);
  const path = (el) => [el.parentElement, el].filter(Boolean)
    .map((n) => n.tagName.toLowerCase() + [...n.classList].map((c) => '.' + c).join('')).join(' > ');

  // Everything painted behind `el`, composited from the first opaque layer up.
  // A gradient surface (the PRO plate) is judged against each of its stops.
  function behind(el) {
    const layers = []; let grad = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!grad && cs.backgroundImage !== 'none' && cs.backgroundClip !== 'text' && cs.webkitBackgroundClip !== 'text') {
        // a full-surface gradient only: a chevron or shine has transparent stops
        const st = stops(cs.backgroundImage);
        if (st.length && st.every((s) => s[3] > 0.5)) grad = st;
      }
      const c = toRGBA(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return grad ? grad.map((g) => over(g, base)) : [base];
  }
  const opacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };

  const root = scope ? document.querySelector(scope) : document.body;
  const fails = []; let checked = 0;
  const judge = (el, fgs, need, text, kind) => {
    const op = opacity(el);
    const bgs = behind(el instanceof SVGElement ? (el.ownerSVGElement || el) : el);
    let worst = Infinity, wf, wb;
    for (const f0 of fgs) for (const b of bgs) {
      const f = over([f0[0], f0[1], f0[2], f0[3] * op], b);
      const k = ratio(f, b);
      if (k < worst) { worst = k; wf = f; wb = b; }
    }
    if (worst === Infinity) return;
    checked++;
    if (worst < need) fails.push({ route, kind, text: text.slice(0, 34), ratio: Math.round(worst * 100) / 100, need, fg: hex(wf), bg: hex(wb), where: path(el) });
  };

  for (const el of root.querySelectorAll('*')) {
    if (el.closest('script,style,template,[hidden]')) continue;
    if (!scope && el.closest('#splash')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;

    // chart marks and lines: graphics, 3:1
    if (el.matches('.chart .line')) { const s = toRGBA(cs.stroke); if (s) judge(el, [s], 3, 'line', 'graphic'); continue; }
    if (el.matches('.chart .mark:not(.hollow)')) { const s = toRGBA(cs.fill); if (s) judge(el, [s], 3, 'marker', 'graphic'); continue; }
    if (el.matches('.swatch')) { const s = toRGBA(cs.backgroundColor); if (s) judge(el.parentElement, [s], 3, 'legend swatch', 'graphic'); continue; }

    if (el.matches('input[placeholder]:placeholder-shown, textarea[placeholder]:placeholder-shown')) {
      const p = toRGBA(getComputedStyle(el, '::placeholder').color);
      if (p) judge(el, [p], 4.5, el.getAttribute('placeholder'), 'placeholder');
    }
    const field = el.matches('input:not([type=checkbox]):not([type=radio]),select,textarea');
    const own = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || '') : field ? (el.value || '') : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own) continue;
    if (el.closest(':disabled')) continue;
    if (/^[\p{Extended_Pictographic}️‍\s]+$/u.test(own)) continue;   // emoji carry their own colour
    const icon = !/[\p{L}\p{N}]/u.test(own);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const clipped = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
    const fgs = clipped ? stops(cs.backgroundImage) : [toRGBA(el instanceof SVGElement ? cs.fill : cs.color)].filter(Boolean);
    if (fgs.length) judge(el, fgs, icon || large ? 3 : 4.5, own, icon ? 'icon' : 'text');
  }
  return { checked, fails };
}

// The palette itself: every text token on every surface it can sit on.
function tokenMatrix() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = L(rgb(a)), y = L(rgb(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
  const texts = ['--text', '--dim', '--faint', '--accent', '--gold', '--warn', '--bad', '--good', '--series-me', '--series-them'];
  const surfaces = ['--bg', '--panel', '--panel-2'];
  const rows = texts.map((t) => [t, ...surfaces.map((s) => ratio(v(t), v(s)))]);
  rows.push(['--gold on --gold-dim', ratio(v('--gold'), v('--gold-dim')), '', '']);
  rows.push(['--gold-soft on --gold-dim', ratio(v('--gold-soft'), v('--gold-dim')), '', '']);
  rows.push(['--accent-ink on --accent', ratio(v('--accent-ink'), v('--accent')), '', '']);
  rows.push(['#2b1f02 on --gold-fill', ratio('#2b1f02', v('--gold-fill')), '', '']);
  return { surfaces, rows };
}
/* ------------------------------------------------------------------------ */

const audit = async (route, scope = null) => ev(`(${pageAudit.toString()})(${JSON.stringify(route)}, ${JSON.stringify(scope)})`);
const shot = async (name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
};

let script = null;
const report = {};
for (const theme of ['dark', 'light']) {
  if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  const offset = AT ? Date.parse(AT) - Date.now() : 0;
  script = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    try {
      localStorage.setItem('gn.apikey', ${JSON.stringify(KEY)});
      localStorage.setItem('gn.owner', ${JSON.stringify(OWNER)});
      localStorage.setItem('gn.noUsage', '1');
      ${theme === 'light' ? "localStorage.setItem('gn.theme', 'light');" : "localStorage.removeItem('gn.theme');"}
    } catch (e) {}
    ${AT ? `const OFF = ${offset}; const RD = Date;
    class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + OFF); } static now() { return RD.now() + OFF; } }
    globalThis.Date = FD;` : ''}
  })();` })).result.identifier;

  // via about:blank: from BASE#/x to BASE#/log is only a hash change, which
  // would keep the old document — and the old theme
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: BASE + '#/log' });
  for (let i = 0; i < 80; i++) { await sleep(500); if (await ev(`location.hash === '#/log' && !!document.querySelector('#splash.gone')`).catch(() => false)) break; }
  await sleep(1500);

  // An exercise worth looking at: the one the owner did most recently.
  const pick = await ev(`(async () => {
    const S = await import('/js/store.js');
    const all = await new Promise((res) => S.watchRecent(S.daysAgoKey(21), ({ all }) => res(all)));
    const me = localStorage.getItem('gn.profile');
    const mine = all.filter((s) => (!me || s.profileId === me) && (s.loggedAt || 0) <= Date.now()).sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0));
    // and one trained on the most days, so a chart gets drawn
    const days = new Map();
    for (const s of mine) (days.get(s.exerciseId) || days.set(s.exerciseId, new Set()).get(s.exerciseId)).add(s.date);
    const chart = [...days].sort((a, b) => b[1].size - a[1].size)[0]?.[0];
    return mine[0] ? { ex: mine[0].exerciseId, pid: mine[0].profileId, chart } : null;
  })()`);
  const routes = [['log'], ['search'], ['history'], ['exercises'], ['alerts'], ['settings']];
  if (pick) routes.push([`ex/${pick.ex}`], [`set/${pick.ex}/${pick.pid}`], [`progress/${pick.ex}`], [`exercises/${pick.ex}`]);
  if (pick?.chart) routes.push([`progress/${pick.chart}`], [`ex/${pick.chart}`]);

  const results = [];
  for (const [r] of routes) {
    await go(r);
    results.push(await audit(r));
    await shot(`${theme}-${r.split('/')[0]}${pick?.chart && r.endsWith(pick.chart) && pick.chart !== pick.ex ? '-chart' : ''}`);
  }
  // the edit form, opened from today's first set if there is one
  if (pick) {
    await go(`ex/${pick.ex}`, 1500);
    if (await ev(`(() => { const b = document.querySelector('#view .edit-btn'); if (b) b.click(); return !!b; })()`)) {
      await sleep(2000);
      results.push(await audit('edit'));
      await shot(`${theme}-edit`);
    }
  }
  // a confirm sheet
  await go('settings', 1200);
  if (await ev(`(() => { const b = [...document.querySelectorAll('#view button')].find((x) => /Forget key/.test(x.textContent)); if (b) b.click(); return !!b; })()`)) {
    await sleep(800);
    results.push(await audit('confirm sheet', 'dialog[open]'));
    await shot(`${theme}-dialog`);
    await ev(`(() => { const d = document.querySelector('dialog[open]'); const c = d && [...d.querySelectorAll('button')].find((x) => /cancel|keep|no/i.test(x.textContent)); c ? c.click() : d?.close(); })()`);
    await sleep(400);
  }
  // the splash, shown again over the app
  await ev(`document.getElementById('splash').classList.remove('gone')`); await sleep(800);
  results.push(await audit('splash', '#splash'));
  await shot(`${theme}-splash`);
  await ev(`document.getElementById('splash').classList.add('gone')`);

  report[theme] = { results, matrix: await ev(`(${tokenMatrix.toString()})()`) };
}

/* --------------------------------- print --------------------------------- */
let failed = 0;
for (const [theme, { results, matrix }] of Object.entries(report)) {
  const checked = results.reduce((n, r) => n + r.checked, 0);
  // one line per distinct colour pair and element, however many screens show it
  const seen = new Map();
  for (const f of results.flatMap((r) => r.fails)) {
    const k = [f.kind, f.fg, f.bg, f.where].join('|');
    if (seen.has(k)) seen.get(k).routes.add(f.route); else seen.set(k, { ...f, routes: new Set([f.route]) });
  }
  console.log(`\n=== ${theme.toUpperCase()} — ${checked} elements on ${results.length} screens, ${seen.size} failing ===`);
  for (const f of [...seen.values()].sort((a, b) => a.ratio - b.ratio)) {
    console.log(`  ${String(f.ratio).padStart(5)}:1 < ${f.need}  ${f.kind.padEnd(11)} ${f.fg} on ${f.bg}  "${f.text}"  ${f.where}  [${[...f.routes].join(', ')}]`);
  }
  console.log(`\n  palette (${matrix.surfaces.join(' / ')}):`);
  for (const [name, ...vals] of matrix.rows) {
    console.log(`    ${name.padEnd(26)} ${vals.map((x) => (x === '' ? '' : String(x).padStart(6))).join('')}`);
  }
  if (theme === 'light') failed = seen.size;
}
if (errors.length) console.log('\npage errors:\n  ' + errors.join('\n  '));
done(failed ? 1 : 0);
