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
