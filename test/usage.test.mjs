import { parseBrowser, createTracker, sessionId, deviceId, deviceHints, friendlyModel, FLUSH_MS } from '../js/usage.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

console.log('\nparseBrowser — Chromium browsers all claim "Chrome", so order matters\n');

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  safariIos:     'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIos:     'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIos:    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15',
  firefoxMac:    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  edgeWin:       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  chromeMac:     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  samsung:       'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
};

eq('Chrome on Android',      parseBrowser(UA.chromeAndroid), 'Chrome 141 / Android');
eq('Safari on iOS',          parseBrowser(UA.safariIos),     'Safari 18 / iOS');
eq('Chrome on iOS (CriOS)',  parseBrowser(UA.chromeIos),     'Chrome 141 / iOS');
eq('Firefox on iOS (FxiOS)', parseBrowser(UA.firefoxIos),    'Firefox 133 / iOS');
eq('Firefox on macOS',       parseBrowser(UA.firefoxMac),    'Firefox 133 / macOS');
eq('Edge not mistaken for Chrome',    parseBrowser(UA.edgeWin),  'Edge 141 / Windows');
eq('Samsung not mistaken for Chrome', parseBrowser(UA.samsung),  'Samsung 27 / Android');
eq('Chrome on macOS',        parseBrowser(UA.chromeMac),     'Chrome 141 / macOS');

// Brave ships a Chrome UA with no token of its own, so the hint is the only way.
eq('Brave looks like Chrome without the hint', parseBrowser(UA.chromeMac), 'Chrome 141 / macOS');
eq('Brave identified via navigator.brave',
   parseBrowser(UA.chromeMac, { brave: true }), 'Brave 141 / macOS');

eq('empty UA does not crash', parseBrowser(''), 'Unknown / Unknown');

console.log('\ncreateTracker — only visible time counts\n');

let clock = 0;
const now = () => clock;
const t = createTracker({ now });

t.screen('log');
clock += 10000;                       // 10s on log
t.screen('ex');
clock += 25000;                       // 25s on ex
eq('time banked per screen', t.snapshot().screens, { log: 10, ex: 25 });
eq('visible total',          t.snapshot().visibleSeconds, 35);

t.visible(false);
clock += 600000;                      // 10 minutes backgrounded
eq('backgrounded time is not counted', t.snapshot().screens, { log: 10, ex: 25 });
eq('total unchanged while hidden',     t.snapshot().visibleSeconds, 35);

t.visible(true);
clock += 5000;
eq('counting resumes on return', t.snapshot().screens, { log: 10, ex: 30 });

t.logged(); t.logged();
eq('sets are counted', t.snapshot().setsLogged, 2);

eq('snapshot is repeatable, not destructive',
   [t.snapshot().visibleSeconds, t.snapshot().visibleSeconds], [40, 40]);

const t2 = createTracker({ now: () => 0 });
eq('fresh tracker is empty', t2.snapshot(), { screens: {}, visibleSeconds: 0, setsLogged: 0 });

console.log('\nsessionId — stable per tab so a reload does not fork the session\n');

const mem = (() => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; })();
const first = sessionId(mem);
eq('same id on a second call', sessionId(mem), first);
eq('id is date-prefixed', /^\d{4}-\d{2}-\d{2}-[a-z0-9]+$/.test(first), true);
eq('survives storage being unavailable',
   /^nostore-/.test(sessionId({ getItem() { throw new Error('blocked'); }, setItem() {} })), true);

console.log('\nflush cadence\n');
eq('30s, not 5s', FLUSH_MS, 30000);

console.log('\nfriendlyModel — Samsung reports a code, Pixel reports a name\n');
eq('Pixel needs no mapping',   friendlyModel('Pixel 9 Pro'), 'Pixel 9 Pro');
eq('S23 European variant',     friendlyModel('SM-S911B'), 'Galaxy S23 (SM-S911B)');
eq('S23 US variant, same phone', friendlyModel('SM-S911U'), 'Galaxy S23 (SM-S911U)');
eq('S23 Ultra',                friendlyModel('SM-S918B'), 'Galaxy S23 Ultra (SM-S918B)');
eq('S24 Ultra',                friendlyModel('SM-S928B'), 'Galaxy S24 Ultra (SM-S928B)');
eq('Z Fold5',                  friendlyModel('SM-F946B'), 'Galaxy Z Fold5 (SM-F946B)');
eq('unknown code passes through rather than guessing',
   friendlyModel('SM-X999Z'), 'SM-X999Z');
eq('empty',                    friendlyModel(''), '');
eq('null',                     friendlyModel(null), '');

console.log('\ndeviceId — persistent, unlike the per-tab session id\n');
const store = (() => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; })();
const d1 = deviceId(store);
eq('same id on a later call', deviceId(store), d1);
eq('prefixed',                /^d-[a-z0-9]+$/.test(d1), true);
eq('a different device gets a different id',
   deviceId({ getItem: () => null, setItem() {} }) !== d1, true);
eq('storage blocked does not crash',
   deviceId({ getItem() { throw new Error('blocked'); }, setItem() {} }), 'd-unknown');

console.log('\ndeviceHints — degrades where the API does not exist\n');
const hints = await deviceHints({
  userAgentData: { getHighEntropyValues: async () => ({ model: 'Pixel 9 Pro', platformVersion: '15.0.0' }) },
});
eq('model read from Client Hints', hints.model, 'Pixel 9 Pro');
eq('platform version read',        hints.platformVersion, '15.0.0');

const none = await deviceHints({});            // Firefox / Safari: no userAgentData
eq('no userAgentData -> blank, not a throw', none, { model: '', platformVersion: '', brave: false });

const brave = await deviceHints({ brave: { isBrave: async () => true } });
eq('Brave detected', brave.brave, true);

const broken = await deviceHints({ userAgentData: { getHighEntropyValues: async () => { throw new Error('denied'); } } });
eq('a rejected hints call is swallowed', broken.model, '');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
