// Usage tracking: which person, which browser, how long, which screens.
//
// Deliberately NOT an append-per-tick log. At one write every 5 seconds a single
// forgotten open tab burns 17,280 writes a day — 86% of the free tier — and once
// writes are exhausted they fail for everything, including logging actual sets.
//
// Instead: one mutable document per app-open, updated every 30s and only while
// the page is visible. A backgrounded tab stops writing entirely, which removes
// the runaway case. Time is accumulated here in memory and flushed as a summary.
//
// Pure and clock-injectable so it can be tested — see test/usage.test.mjs.

export const FLUSH_MS = 30000;

/**
 * Browser and OS from a user-agent string.
 *
 * Approximate by design: UA strings are being frozen and reduced across the
 * board. Reliable for telling Chrome/Safari/Firefox and iOS/Android apart, not
 * for exact versions.
 *
 * Brave is the awkward one — it deliberately reports itself as Chrome and adds
 * no token of its own, so it can only be identified by the `navigator.brave`
 * object. Pass `{ brave: true }` when that is present.
 */
export function parseBrowser(ua = '', { brave = false } = {}) {
  const os =
    /iPhone|iPad|iPod/.test(ua)   ? 'iOS' :
    /Android/.test(ua)            ? 'Android' :
    /Macintosh|Mac OS X/.test(ua) ? 'macOS' :
    /Windows/.test(ua)            ? 'Windows' :
    /Linux/.test(ua)              ? 'Linux' : 'Unknown';

  // Order matters: every Chromium browser also claims "Chrome", and the iOS
  // wrappers (CriOS/FxiOS) claim Safari underneath.
  const rules = [
    [/Edg\/(\d+)/,                 'Edge'],
    [/OPR\/(\d+)/,                 'Opera'],
    [/SamsungBrowser\/(\d+)/,      'Samsung'],
    [/FxiOS\/(\d+)/,               'Firefox'],
    [/CriOS\/(\d+)/,               'Chrome'],
    [/Firefox\/(\d+)/,             'Firefox'],
    [/Chrome\/(\d+)/,              'Chrome'],
    // iOS inserts "Mobile/15E148" between Version/ and Safari/, so these two
    // tokens must not be required to be adjacent.
    [/Version\/(\d+)[.\d]*.*Safari/, 'Safari'],
  ];

  let name = /Safari/.test(ua) ? 'Safari' : 'Unknown';
  let version = '';
  for (const [re, label] of rules) {
    const m = ua.match(re);
    if (m) { name = label; version = m[1]; break; }
  }
  if (brave) { name = 'Brave'; }

  return version ? `${name} ${version} / ${os}` : `${name} / ${os}`;
}

/**
 * Accumulates visible time per screen.
 *
 * Only time while the page is visible counts — a phone in a pocket with the app
 * open is not usage. `now` is injectable purely so tests do not have to sleep.
 */
export function createTracker({ now = () => Date.now() } = {}) {
  const screens = {};
  let current = null;
  let since = now();
  let isVisible = true;
  let setsLogged = 0;

  /** Bank whatever has accrued since the last state change. */
  function bank() {
    const t = now();
    if (current && isVisible) {
      screens[current] = (screens[current] || 0) + (t - since);
    }
    since = t;
  }

  return {
    screen(name) { bank(); current = name || null; },
    visible(v)   { bank(); isVisible = !!v; },
    logged()     { setsLogged += 1; },
    isVisible()  { return isVisible; },

    /** Seconds per screen plus totals. Safe to call repeatedly. */
    snapshot() {
      bank();
      const out = {};
      let total = 0;
      for (const [k, ms] of Object.entries(screens)) {
        const secs = Math.round(ms / 1000);
        if (secs > 0) out[k] = secs;
        total += ms;
      }
      return { screens: out, visibleSeconds: Math.round(total / 1000), setsLogged };
    },
  };
}

// Samsung reports a model code, not a name. Prefixes only — the trailing letter
// is the regional variant (B Europe, U US, N Korea) and does not change the phone.
const SAMSUNG = {
  'SM-G991': 'Galaxy S21',  'SM-G996': 'Galaxy S21+',  'SM-G998': 'Galaxy S21 Ultra',
  'SM-S901': 'Galaxy S22',  'SM-S906': 'Galaxy S22+',  'SM-S908': 'Galaxy S22 Ultra',
  'SM-S911': 'Galaxy S23',  'SM-S916': 'Galaxy S23+',  'SM-S918': 'Galaxy S23 Ultra',
  'SM-S921': 'Galaxy S24',  'SM-S926': 'Galaxy S24+',  'SM-S928': 'Galaxy S24 Ultra',
  'SM-S931': 'Galaxy S25',  'SM-S936': 'Galaxy S25+',  'SM-S938': 'Galaxy S25 Ultra',
  'SM-F946': 'Galaxy Z Fold5', 'SM-F956': 'Galaxy Z Fold6',
  'SM-F731': 'Galaxy Z Flip5', 'SM-F741': 'Galaxy Z Flip6',
  'SM-A546': 'Galaxy A54', 'SM-A556': 'Galaxy A55',
};

/**
 * "SM-S911B" -> "Galaxy S23 (SM-S911B)". Pixels already report a readable name.
 *
 * The raw code is always kept: the mapping is mine and will be missing or wrong
 * for a model I have not listed, and a code is better than a confident mislabel.
 */
export function friendlyModel(model = '') {
  const m = String(model || '').trim();
  if (!m) return '';
  const prefix = (m.match(/^(SM-[A-Z]\d{3})/) || [])[1];
  const name = prefix && SAMSUNG[prefix];
  return name ? `${name} (${m})` : m;
}

/**
 * Device model and platform version via Client Hints.
 *
 * The user-agent is no longer usable for this: Chrome's UA Reduction replaced
 * the Android model with a literal "K", so every Android Chrome reports
 * "Android 10; K" whatever the phone. getHighEntropyValues still returns the
 * real model, on Chromium only — Firefox and Safari have no userAgentData, and
 * iOS reports every iPhone as "iPhone" regardless.
 */
export async function deviceHints(nav = (typeof navigator !== 'undefined' ? navigator : {})) {
  const out = { model: '', platformVersion: '', brave: false };
  try { if (nav.brave?.isBrave) out.brave = !!(await nav.brave.isBrave()); } catch {}
  try {
    const d = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (d) {
      out.model = d.model || '';
      out.platformVersion = d.platformVersion || '';
    }
  } catch {}
  return out;
}

/**
 * Stable id for this physical device, in localStorage so it survives across
 * sessions. The browser string cannot separate two people on the same setup —
 * three of the first seven sessions were all "Chrome 153 / Android" and could
 * have been one phone or two. This makes that unambiguous.
 */
export function deviceId(storage) {
  const KEY = 'gn.deviceId';
  try {
    let id = storage.getItem(KEY);
    if (!id) {
      id = 'd-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      storage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'd-unknown';
  }
}

/** Stable per-tab id so a reload continues one session instead of forking it. */
export function sessionId(storage) {
  const KEY = 'gn.usageSession';
  try {
    let id = storage.getItem(KEY);
    if (!id) {
      id = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 10)}`;
      storage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `nostore-${Math.random().toString(36).slice(2, 10)}`;
  }
}
