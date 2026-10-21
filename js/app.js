import { ready, initFirebase, getStoredKey, saveKey, clearKey, isKeyError,
         parseAccessKey, getDeviceOwner, saveDeviceOwner, KEY_DELIMITER } from './firebase.js';
import * as S from './store.js';
import { SEED_EXERCISES, SEED_PROFILES } from './seed.js';
import { searchExercises, recentFrequency, MUSCLES } from './search.js';
import { allPRs, newPRs } from './pr.js';
import { suggestNext } from './nextset.js';
import { gymDays, grid, streaks, parseTarget } from './streak.js';
import { POLL_MS, STALE_HIDDEN_MS, POLL_TIMEOUT_MS, RECONNECT_GAP_MS, newestCreated, reconcile, mergeSets, fromOtherPhone, alertText, syncState, backoff } from './sync.js';
import { parseStore, recordPick, learnedPick, phraseCount, listPicks, forgetPhrase } from './learn.js';
import { layoutSides, resolveTarget, lastSessionFor } from './sides.js';
import { CHART_METRICS, buildProgress } from './progress.js';
import { draftFromSet, editPatch, changedFields } from './edits.js';
import { byTime, restGaps, formatRest } from './rest.js';
import { restingAfter, restHeat, heatColor, shouldBuzz, parseLimit, stepLimit, LIVE_MAX_MS } from './resttimer.js';
import { QUICK_NOTES, hasNote, toggleNote } from './notes.js';
import { drawChart, formatValue } from './chart.js';
import { UNITS, formatLoad, formatSetLoad, formatReps, formatEffort, formatEffortCompact, formatDuration, setVolumeKg,
         SUPPORT, METRICS, TIME_STEP, stepFor, snapTo } from './units.js';
import { icon } from './icons.js';
import { el, clear, toast, confirmSheet, promptSheet, segmented, field, dayLabel, timeAgo, stampMs, busyButton, stepper, fmtTime, fmtSpan } from './ui.js';
import { VERSION } from './version.js';
import { parseBrowser, createTracker, sessionId, deviceId, deviceHints, friendlyModel, FLUSH_MS } from './usage.js';
import { chime, soundOn, setSound, notifOn, setNotif, primeAudio,
         vibrateOn, setVibrate, vibrateSupported, buzzTest, buzzRest } from './notify.js';

/* ============================ state ============================ */

const state = {
  profiles: [],
  exercises: [],
  sets: [],                 // every set for the active profile
  profileId: localStorage.getItem('gn.profile') || null,
  owner: getDeviceOwner(),          // who is holding THIS phone
  recent: [],                       // every profile's sets in the recent window
  seenAlerts: Number(localStorage.getItem('gn.seenAlerts') || 0),

  loaded: { profiles: false, exercises: false, sets: false },
};

let unsubSets = () => {};
let unsubRecent = () => {};
let recentSince = null;
const HISTORY_DAYS = 90;

// True once the user has touched the set form. A snapshot arriving from the
// other person's phone must not rebuild the DOM and wipe half-typed input —
// both of us log at the same time, so this happens constantly in practice.
let formDirty = false;
const viewEl = () => document.getElementById('view');
const activeProfile = () => state.profiles.find((p) => p.id === state.profileId) || null;
/**
 * True when you are looking at someone else's log and history.
 *
 * This used to mean "logging on their behalf", back when the top-bar chip chose
 * the write target. Since the two-sided exercise view, the target comes from the
 * URL and this selection is purely a view filter — so the name and the styling
 * both had to change, or gold would keep implying a cross-person write.
 */
const viewingSomeoneElse = () => {
  const p = activeProfile();
  return !!(p && state.owner && p.name !== state.owner);
};
const exerciseById = (id) => state.exercises.find((e) => e.id === id);

function setProfile(id) {
  state.profileId = id;
  if (id) localStorage.setItem('gn.profile', id); else localStorage.removeItem('gn.profile');
  unsubSets();
  state.sets = [];
  state.loaded.sets = false;
  if (id) {
    unsubSets = S.watchSetsForProfile(id, (rows) => {
      state.sets = rows;
      state.loaded.sets = true;
      renderFromData();
    });
  }
  render();
}

/* ============================ routing ============================ */

const route = () => (location.hash || '#/log').slice(2).split('/');
const go = (path) => { location.hash = '#/' + path; };

// The previous in-app location. An edit can be opened from Log, History or a
// progress chart, and Save / Cancel should return to whichever it came from.
let prevHash = null;
let curHash = location.hash;

window.addEventListener('hashchange', () => {
  prevHash = curHash;
  curHash = location.hash;
  // Arriving at a chart plays its entrance again — except coming back to an
  // exercise from logging or editing a set there, which happens after every
  // single set and would replay a 2.6s animation twenty times a workout.
  //
  // The set and edit forms have no chart, so going INTO them must not clear
  // the key either — clearing on the way out was the first version's bug: the
  // round trip exercise -> set form -> exercise replayed every time.
  const from = (prevHash || '').slice(2).split('/')[0];
  const to = route()[0];
  const intoForm = to === 'set' || to === 'edit';
  const backFromForm = to === 'ex' && (from === 'set' || from === 'edit');
  if (!intoForm && !backFromForm) animatedKey = null;
  formDirty = false;
  tracker?.screen(route()[0] || 'log');
  render();
});

// "5s ago" has to keep counting. Only ticks while the Alerts tab is open, so it
// costs nothing the rest of the time.
setInterval(() => { if (route()[0] === 'alerts') render(); }, 15000);

// The live rest timer ticks every second. It repaints its own rows in place: a
// full render() each second would reset scroll, forms and chart entrances.
setInterval(() => {
  const now = Date.now();
  for (const row of document.querySelectorAll('.rest-live')) paintRestLive(row, now);
  checkRestBuzz(now);
}, 1000);

/**
 * Re-render triggered by a Firestore snapshot rather than by navigation.
 * Skipped while the set form holds unsaved input; the next explicit render
 * (save, or leaving the screen) picks the new data up.
 */
function renderFromData() {
  // Both forms: a set arriving from the other phone must not rebuild the DOM
  // and wipe input in progress — whether adding a set or correcting one.
  if ((route()[0] === 'set' || route()[0] === 'edit') && formDirty) return;
  render();
}

/* ============================ chrome ============================ */

function paintTopbar() {
  const btn = document.getElementById('profile-switch');
  const p = activeProfile();
  btn.textContent = p ? p.name : 'Choose person';
  btn.classList.toggle('viewing', viewingSomeoneElse());
  btn.onclick = () => go('settings');

  const tab = route()[0];
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('active', b.dataset.route === (tab === 'picks' ? 'settings' : tab));
    b.onclick = () => go(b.dataset.route);

    if (b.dataset.route === 'alerts') {
      b.querySelector('.tab-dot')?.remove();
      // Presence, not a count — the number read as clutter on a 5-tab bar.
      if (unreadAlerts().length) b.append(el('span', { class: 'tab-dot' }));
    }
  }
}

/**
 * The top-bar dot. Green only when the server has answered in the last 30s —
 * it used to go by "the phone has internet", which stayed green over a
 * listener that had silently died.
 */
const SYNC_LABEL = {
  live: ['on', 'Synced', 'Synced: new sets arrive live'],
  wait: ['wait', 'Connecting…', 'Online, waiting for the server: sets save on this phone meanwhile'],
  off:  ['off', 'Offline', 'Offline: sets save on this phone and sync when it is back'],
};
function paintSync() {
  const st = syncState({ online: navigator.onLine, lastServerAt: sync.lastServerAt, now: Date.now() });
  const [cls, label, title] = SYNC_LABEL[st];
  const s = document.getElementById('sync');
  if (!s || s.dataset.state === st) return;
  s.dataset.state = st;
  s.className = 'sync ' + cls;
  s.querySelector('.sync-label').textContent = label;
  s.title = title;   // the text is hidden on narrow screens; the dot needs a name
}

/* ============================ boot splash ============================ */

let splashDone = false;

/** Progress text under the wordmark. No-op once the splash is gone. */
function paintSplashVersion() {
  const n = document.getElementById('splash-version');
  if (n) n.textContent = `v${VERSION}`;
}

function splashStage(text, failed = false) {
  if (splashDone) return;
  const n = document.getElementById('splash-stage');
  if (!n) return;
  n.textContent = text;
  n.classList.toggle('failed', failed);
}

function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  clearTimeout(splashFailsafe);
  document.getElementById('splash')?.classList.add('gone');
  // The splash is always dark; the browser bar follows the app's theme from here.
  if (themeName() === 'light') document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#f4f1f8');
}

// Bad signal in the gym means a first-ever load can hang on auth. Never leave
// someone staring at an animation with no explanation.
const splashFailsafe = setTimeout(() => {
  if (splashDone) return;
  splashStage('still trying — check your connection', true);
}, 12000);

/* ============================ render ============================ */

/**
 * Rebuilding the screen you are already on keeps your place. Every re-render
 * replaces the whole view, and on a phone a tap that triggers one (the chart's
 * Top weight / Reps / Volume picker under the chart) dropped the scroll to the
 * very top, past a long list of last-day sets. A set arriving live does the
 * same rebuild. Going to another screen is unchanged.
 */
let renderedHash = null;
function render() {
  const same = renderedHash === location.hash;
  const y = window.scrollY;
  renderedHash = location.hash;
  renderScreen();
  if (same && y) {
    window.scrollTo(0, y);
    // and once more after the tap has finished: the jump can land after it
    requestAnimationFrame(() => { if (renderedHash === location.hash && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y); });
  }
}

function renderScreen() {
  paintTopbar();
  formDirty = false;
  // Gold for the whole page while editing, so nobody mistakes it for adding.
  document.body.classList.toggle('is-editing', route()[0] === 'edit');
  if (state.loaded.profiles && state.owner) { startRecentWatch(); primeAudio(); startUsage(); }
  const v = clear(viewEl());
  const [tab, arg, arg2] = route();

  if (!state.loaded.profiles || !state.loaded.exercises) {
    return v.append(el('div', { class: 'empty' }, 'Loading…'));
  }
  hideSplash();   // real content is on screen now
  prMap();        // notices a set that just became a PR, wherever you are

  // Device identity is required before anything can be logged, so a set is
  // never written without knowing who typed it.
  if (!state.owner) return viewWhoAmI(v);

  switch (tab) {
    case 'alerts':    return viewAlerts(v);
    case 'settings':
    case 'profiles':  return viewSettings(v);
    case 'search':    return viewSearch(v);
    case 'picks':     return viewPicks(v);
    case 'set':       return viewLogSet(v, arg, arg2);
    case 'edit':      return viewEditSet(v, arg);
    case 'history':   return viewHistory(v);
    case 'ex':        return viewExercise(v, arg);
    case 'progress':  return viewProgress(v, arg);
    case 'exercises': return arg ? viewExerciseEditor(v, arg) : viewExercisePool(v);
    default:          return viewLog(v);
  }
}

/* ============================ activity nudge ============================ */

/** Sets entered by the other person, newest first. */
function alertItems() {
  const today = S.todayKey();
  return state.recent
    .filter((x) => x.date === today && x.enteredBy && x.enteredBy !== state.owner)
    .sort((a, b) => (stampMs(b.createdAt) || 0) - (stampMs(a.createdAt) || 0));
}

const unreadAlerts = () => alertItems().filter((x) => (stampMs(x.createdAt) || Date.now()) > state.seenAlerts);

function markAlertsSeen() {
  state.seenAlerts = Date.now();
  try { localStorage.setItem('gn.seenAlerts', String(state.seenAlerts)); } catch {}
}

/**
 * Toast + chime when the OTHER person logs something. Pushed over the existing
 * Firestore socket, so there is no polling and no extra read cost beyond the
 * documents themselves.
 */
/*
 * Live updates (docs/sync-reliability-spec.md). The listener does the work
 * while its connection is alive. Underneath it:
 *   - a poll every 10s while the app is visible: "any sets newer than the
 *     newest I hold?", one read when the answer is no
 *   - on coming back (screen on, app switched back, back online): poll at once,
 *     and after a long sleep open a fresh connection, since the old one has
 *     usually died without saying so. The poll rides the same connection, so
 *     a poll with no answer in 8s also forces a fresh one.
 *   - a failed listener is restarted with backoff; Firestore never does that
 *   - alerts that arrive while the app is hidden wait for its return
 */
const sync = {
  known: new Set(),   // set ids already seen; a new one is news
  primed: false,      // the server has confirmed a full view once
  lastServerAt: 0,    // the server last answered (listener or poll)
  extras: [],         // polled sets the listener has not delivered yet
  listened: [],       // the listener's own latest view
  away: [],           // other people's sets that came in while hidden
  failures: 0, retry: null, polling: false, hiddenAt: 0, reconnectedAt: 0,
};

/**
 * A fresh server connection; listeners resume where they were. Rate-limited.
 * Resolves once the new connection is up, so a poll can follow it — a poll
 * started during the swap just fails.
 */
function reconnectNow() {
  if (!state.owner || Date.now() - sync.reconnectedAt < RECONNECT_GAP_MS) return Promise.resolve();
  sync.reconnectedAt = Date.now();
  return S.reconnect().catch(() => {});
}

function startRecentWatch(force = false) {
  const since = S.daysAgoKey(HISTORY_DAYS);
  if (!force && recentSince === since) return;
  recentSince = since;
  unsubRecent();
  clearTimeout(sync.retry);

  unsubRecent = S.watchRecent(since, ({ all, fromCache, changed }) => {
    if (!fromCache) { sync.lastServerAt = Date.now(); sync.failures = 0; paintSync(); }
    // metadata only (a write landing, the server confirming): nothing to show,
    // except the first server confirmation, which primes "news"
    if (!changed && (fromCache || sync.primed)) return;
    sync.listened = all;
    ({ recent: state.recent, extras: sync.extras } = reconcile(all, sync.extras));
    ingest(all, { confirmed: !fromCache });
  }, () => {
    // dead: try again shortly, then less often
    recentSince = null;
    clearTimeout(sync.retry);
    sync.retry = setTimeout(() => startRecentWatch(true), backoff(sync.failures++));
  });
}

/**
 * Notes which sets are new, and announces other people's. Nothing counts as
 * news until the server has confirmed a full view: the first snapshot comes
 * from this phone's cache, and everything the server adds to it was logged
 * while the app was closed (on a fresh phone, that was every set today).
 */
function ingest(sets, { confirmed }) {
  const fresh = [];
  for (const x of sets) {
    if (sync.known.has(x.id)) continue;
    sync.known.add(x.id);
    if (sync.primed) fresh.push(x);
  }
  if (confirmed) sync.primed = true;
  announce(fresh);
  renderFromData();
}

async function pollNow() {
  if (!sync.primed || sync.polling || document.hidden) return;
  const cursor = newestCreated(state.recent);
  if (cursor == null) return;
  sync.polling = true;
  let timer;
  try {
    const got = await Promise.race([
      S.setsCreatedAfter(cursor),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('stuck')), POLL_TIMEOUT_MS); }),
    ]);
    sync.lastServerAt = Date.now();
    if (got.length) {
      sync.extras = mergeSets(sync.extras, got);
      ({ recent: state.recent, extras: sync.extras } = reconcile(sync.listened, sync.extras));
      ingest(got, { confirmed: true });
    }
  } catch (e) {
    // No answer while the phone says it is online: the connection is stuck.
    // Offline is different, and the dot already says so.
    if (e?.message === 'stuck' && navigator.onLine) reconnectNow();
  } finally { clearTimeout(timer); sync.polling = false; paintSync(); }
}

function announce(fresh) {
  const theirs = fromOtherPhone(fresh, { deviceId: currentDeviceId(), owner: state.owner, today: S.todayKey() });
  if (!theirs.length) return;
  // A toast on a screen nobody is looking at is a lost alert, and phones block
  // vibration while hidden: hold them for the return.
  if (document.hidden) { sync.away.push(...theirs); return; }
  notifyTheirs(theirs, false);
}

function notifyTheirs(sets, away) {
  if (!notifOn()) return;
  toast(alertText(sets, { away, now: Date.now(), exerciseName: (id) => exerciseById(id)?.name }), 'dumbbell');
  chime();        // self-limiting: at most one tone per 15s
}

setInterval(() => { pollNow(); paintSync(); }, POLL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { sync.hiddenAt = Date.now(); return; }
  if (sync.away.length) notifyTheirs(sync.away.splice(0), true);
  const slept = sync.hiddenAt && Date.now() - sync.hiddenAt > STALE_HIDDEN_MS;
  (slept ? reconnectNow() : Promise.resolve()).then(pollNow);
  paintSync();
});
window.addEventListener('online', () => { reconnectNow().then(pollNow); paintSync(); });
window.addEventListener('offline', () => paintSync());

/* ============================ usage tracking ============================ */

let tracker = null;
let usageId = null;
let usageBrowser = '';
let usageDevice = null;      // { id, model, platformVersion }
let usageStartedAt = 0;
let usageTimer = null;

/**
 * This device's stable id. Reads storage directly rather than going through
 * usageDevice, so a set logged before usage tracking has started is still
 * attributable.
 */
const currentDeviceId = () => usageDevice?.id || deviceId(localStorage);

/**
 * Flush the accumulated summary. Only ever called while the page is visible, or
 * once on the way out — never on a timer that keeps firing in the background.
 */
async function flushUsage() {
  if (!tracker || !usageId) return;
  try {
    await S.upsertUsage(usageId, {
      owner: state.owner || null,
      browser: usageBrowser,
      deviceId: usageDevice?.id || null,
      model: usageDevice?.model || null,
      platformVersion: usageDevice?.platformVersion || null,
      version: VERSION,
      startedAt: usageStartedAt,
      lastSeenAt: Date.now(),
      ...tracker.snapshot(),
    });
  } catch (err) {
    // Never let analytics break logging — this is the least important write in
    // the app and must fail silently.
    console.warn('[usage] flush failed', err);
  }
}

/**
 * Per-device opt-out. Testing on a laptop otherwise lands in the same usage
 * data used to see who is really using the app — the first device analysis
 * found desktop Chrome and Firefox sessions mixed in with the two phones.
 */
const usageCounted = () => { try { return localStorage.getItem('gn.noUsage') !== '1'; } catch { return true; } };

function startUsage() {
  if (tracker || !usageCounted()) return;

  usageBrowser = parseBrowser(navigator.userAgent);

  // Survives across sessions, unlike the per-tab session id: two phones
  // reporting the same browser string are still two distinct devices.
  usageDevice = { id: deviceId(localStorage), model: '', platformVersion: '' };

  // Both the Brave check and the model lookup are async, so the first flush goes
  // out without them and a second one follows once they land.
  deviceHints().then((h) => {
    if (h.brave) usageBrowser = parseBrowser(navigator.userAgent, { brave: true });
    usageDevice.model = friendlyModel(h.model);
    usageDevice.platformVersion = h.platformVersion || '';
    flushUsage();
  }).catch(() => {});

  usageId = sessionId(sessionStorage);
  usageStartedAt = Date.now();
  tracker = createTracker();
  tracker.visible(document.visibilityState === 'visible');
  tracker.screen(route()[0] || 'log');

  // The interval checks visibility rather than being cleared and restarted, so
  // a hidden tab simply does nothing on each tick.
  usageTimer = setInterval(() => { if (tracker.isVisible()) flushUsage(); }, FLUSH_MS);

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    tracker.visible(visible);
    // Flush on the way out so the tail of a session is not lost.
    if (!visible) flushUsage();
  });

  // pagehide is the one that fires reliably on mobile; unload often does not.
  window.addEventListener('pagehide', () => { tracker.visible(false); flushUsage(); });

  flushUsage();
}

/**
 * When a set was logged. `loggedAt` is the client clock, written since 1.1.0;
 * `createdAt` is the server timestamp and the only thing older sets have.
 */
const setTime = (s) => s.loggedAt || stampMs(s.createdAt) || null;

/* ============================ freshness ============================ */

const FRESH_MS = 30000;

/**
 * null once a set is older than the window. `loggedAt` is the client clock and
 * is populated immediately; `createdAt` is a server sentinel that reads null for
 * the few hundred ms before the write is acknowledged, so it is the fallback,
 * not the primary.
 *
 * Returns the age so the CSS animation can be started partway through with a
 * negative delay — a set already 20s old glows for its remaining 10s, not a
 * fresh 30.
 */
function freshness(s) {
  const t = s.loggedAt || stampMs(s.createdAt);
  if (!t) return null;
  const age = Date.now() - t;
  if (age < 0 || age > FRESH_MS) return null;
  return { ageSec: age / 1000, own: s.enteredBy === state.owner };
}

/** Class + negative delay, or nothing. */
function freshAttrs(s) {
  const f = freshness(s);
  if (!f) return { cls: '', style: '' };
  return {
    cls: f.own ? ' fresh-own' : ' fresh-other',
    style: `animation-delay:-${f.ageSec.toFixed(2)}s`,
  };
}

/* ============================ alerts feed ============================ */

/**
 * Derived from today's sets rather than stored as its own collection — an
 * activity record would be a second write per set for information already
 * sitting in the set itself.
 */
function viewAlerts(v) {
  const items = alertItems();
  const cutoff = state.seenAlerts;

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:12px' },
    el('h2', { style: 'margin:0' }, 'Alerts'),
    el('span', { class: 'tiny faint' }, 'today')
  ));

  if (!items.length) {
    v.append(el('div', { class: 'empty' },
      'Nothing from anyone else yet.', el('br'),
      el('span', { class: 'tiny' }, 'Sets you enter yourself never appear here.')));
    markAlertsSeen();
    return;
  }

  const card = el('div', { class: 'card' });
  for (const x of items) {
    const ms = stampMs(x.createdAt);
    const ex = exerciseById(x.exerciseId);
    const forWhom = state.profiles.find((p) => p.id === x.profileId);

    card.append(el('div', { class: 'feed-item' + (ms && ms > cutoff ? ' fresh' : '') },
      el('div', { class: 'feed-icon' }, icon('dumbbell', { size: 17 })),
      el('div', { class: 'grow' },
        el('div', {},
          el('strong', {}, x.enteredBy),
          el('span', { class: 'muted' }, ' logged '),
          el('strong', {}, ex ? ex.name : 'a set'),
          forWhom ? el('span', { class: 'muted' }, ' for ' + forWhom.name) : null
        ),
        el('div', { class: 'tiny muted', style: 'margin-top:2px' },
          formatSetLoad(x) + ' × ' + formatEffort(x)),
        x.comment ? el('div', { class: 'cmt' }, x.comment) : null
      ),
      el('span', { class: 'feed-when' }, timeAgo(ms))
    ));
  }
  v.append(card);

  // Opening the tab clears the badge; the next render shows no dot.
  markAlertsSeen();
}

/* ============================ device identity ============================ */

/**
 * Fallback when the access key carried no "---Name" suffix. Asked once per
 * device, then remembered.
 */
function viewWhoAmI(v) {
  v.append(el('div', { style: 'text-align:center;margin:6vh 0 18px' },
    el('div', { class: 'hero-icon' }, icon('hand', { size: 40 })),
    el('h2', { style: 'margin:12px 0 4px' }, 'Who is using this phone?'),
    el('p', { class: 'muted tiny' }, 'Asked once. It labels every set you enter for someone else.')
  ));

  for (const p of state.profiles) {
    v.append(el('button', {
      class: 'btn block big', style: 'margin-bottom:10px',
      onClick: () => { saveDeviceOwner(p.name); state.owner = p.name; render(); },
    }, p.name));
  }

  v.append(busyButton('+ Someone else', 'Adding…', 'btn block', async () => {
    const name = await promptSheet('Add person', '', 'Name');
    if (!name) return;
    await S.addProfile(name);
    saveDeviceOwner(name);
    state.owner = name;
    toast(`${name} added`);
  }));
}

// Tab bar icons: index.html names them (data-icon), the modules draw them.
for (const n of document.querySelectorAll('[data-icon]')) n.replaceChildren(icon(n.dataset.icon, { size: 22 }));

/* ============================ settings ============================ */

/** Settings → Appearance. Dark unless light was picked. index.html applies it before first paint. */
const themeName = () => { try { return localStorage.getItem('gn.theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };

function applyTheme(t) {
  try { t === 'light' ? localStorage.setItem('gn.theme', 'light') : localStorage.removeItem('gn.theme'); } catch {}
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  // the browser's own bar (Android) follows the page
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f4f1f8' : '#08060d');
}

/** Reusable on/off row so every toggle reads and behaves identically. */
function toggleRow(label, hint, isOn, onToggle) {
  const btn = el('button', { class: 'btn sm', onClick: () => {
    const next = !isOn();
    onToggle(next);
    btn.textContent = next ? 'On' : 'Off';
    btn.classList.toggle('primary', next);
  } }, isOn() ? 'On' : 'Off');
  btn.classList.toggle('primary', isOn());

  return el('div', { class: 'row spread card', style: 'background:var(--panel-2)' },
    el('div', { class: 'grow' },
      el('div', {}, label),
      hint ? el('div', { class: 'tiny faint', style: 'margin-top:2px' }, hint) : null),
    btn
  );
}

function viewSettings(v) {
  v.append(el('h2', {}, 'Settings'));

  v.append(el('h3', {}, 'People'));
  v.append(el('div', { class: 'notice' },
    'Tap a name to see ', el('strong', {}, 'their log and history'), '. ',
    'Who a set is logged ', el('em', {}, 'for'), ' is chosen on the exercise screen, ',
    'so this never changes where your sets go.'));


  for (const p of state.profiles) {
    v.append(el('div', { class: 'card row spread' },
      el('button', {
        class: 'grow', style: 'background:none;border:0;text-align:left;font-weight:600;font-size:1.05rem',
        onClick: () => { setProfile(p.id); go('log'); },
      }, p.name),
      p.id === state.profileId ? el('span', { class: 'pill viewing-pill' }, 'viewing') : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onClick: async () => {
          const name = await promptSheet('Rename', p.name);
          if (name) { await S.renameProfile(p.id, name); toast('Renamed'); }
        } }, 'Edit'),
        el('button', { class: 'btn sm danger', onClick: async () => {
          const setCount = state.sets.filter((s) => s.profileId === p.id).length;
          const ok = await confirmSheet(`Delete ${p.name}?`,
            setCount ? `Their ${setCount} logged sets stay in the database but become orphaned.` : 'No sets logged yet.');
          if (!ok) return;
          await S.deleteProfile(p.id);
          if (state.profileId === p.id) setProfile(null);
          toast('Deleted');
        }, 'aria-label': `Delete ${p.name}` }, icon('x', { size: 16 }))
      )
    ));
  }

  v.append(busyButton('+ Add person', 'Adding…', 'btn primary block', async () => {
    const name = await promptSheet('Add person', '', 'Name');
    if (!name) return;
    const id = await S.addProfile(name);
    setProfile(id);
    toast(`${name} added`);
    go('log');
  }));

  // --- this device ---------------------------------------------------------
  v.append(el('h3', {}, 'This device'));
  v.append(el('div', { class: 'row spread card', style: 'background:var(--panel-2)' },
    el('span', { class: 'tiny muted grow' }, 'This phone belongs to ',
      el('strong', { style: 'color:var(--gold)' }, state.owner || '—')),
    el('button', { class: 'btn sm', onClick: () => {
      saveDeviceOwner(''); state.owner = null; render();
    } }, 'Change')
  ));

  v.append(toggleRow(
    'Count this device in usage stats',
    'Turn off on a laptop you test on, so only real use is counted',
    usageCounted,
    (on) => {
      try { on ? localStorage.removeItem('gn.noUsage') : localStorage.setItem('gn.noUsage', '1'); } catch {}
      // Takes effect from the next app load; a session already running finishes
      // rather than being cut off mid-record.
      toast(on ? 'Counted from the next reload' : 'Not counted from the next reload');
    }
  ));

  // --- appearance ----------------------------------------------------------
  v.append(el('h3', {}, 'Appearance'));
  v.append(el('div', { class: 'card', style: 'background:var(--panel-2)' },
    el('div', { style: 'margin-bottom:8px' }, 'Theme'),
    segmented([{ key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light (new)' }], themeName(), (t) => {
      applyTheme(t);
      render();
    }),
    el('div', { class: 'tiny faint', style: 'margin-top:8px' },
      'Light is new: if something is hard to read, say so')));

  // --- display -------------------------------------------------------------
  v.append(el('h3', {}, 'Display'));
  v.append(toggleRow(
    'Show rest between sets',
    'From one logged set to the next — includes the set itself, since only the end of a set is recorded',
    restOn,
    (on) => { try { localStorage.setItem('gn.showRest', on ? '1' : '0'); } catch {} }
  ));

  v.append(toggleRow(
    'Show progress chart on exercise screen',
    'The chart appears under the sets as soon as you pick an exercise',
    inlineChartOn,
    (on) => { try { localStorage.setItem('gn.inlineChart', on ? '1' : '0'); } catch {} }
  ));
  v.append(toggleRow(
    'Animate charts',
    'Lines draw in and dots drop into place when a chart opens',
    chartAnimOn,
    (on) => { try { localStorage.setItem('gn.chartAnim', on ? '1' : '0'); } catch {} }
  ));

  // --- search --------------------------------------------------------------
  v.append(el('h3', {}, 'Search'));
  v.append(toggleRow(
    'Most-done exercises first',
    'Ranks by how many days you two did each one in the last 2 weeks. Off: A–Z. Name matches still come first either way',
    searchFreqOn,
    (on) => { try { localStorage.setItem('gn.searchFreq', on ? '1' : '0'); } catch {} }
  ));
  v.append(toggleRow(
    'Put my usual pick first',
    'Type, tap a result, and next time the same words put it at the top, marked "your pick". Kept on this phone only',
    learnOn,
    (on) => { try { localStorage.setItem('gn.learnPicks', on ? '1' : '0'); } catch {} }
  ));
  const learned = phraseCount(loadPicks(), Date.now());
  v.append(el('button', { class: 'btn sm', style: 'margin:-2px 0 10px', onClick: () => go('picks') },
    `Show my picks (${learned.toLocaleString('en-US')}) ›`));

  // --- pro features --------------------------------------------------------
  v.append(el('h3', {}, 'Pro features'));
  v.append(toggleRow(
    'PR celebration',
    'A gold flash and a PR tag when a set beats your best: heavier, or more reps at a weight you have done',
    prOn,
    (on) => { try { localStorage.setItem('gn.prOn', on ? '1' : '0'); } catch {} }
  ));
  v.append(toggleRow(
    'Streak calendar',
    'Gym days on a grid at the top of History, with weekly streaks for both of you',
    streakOn,
    (on) => { try { localStorage.setItem('gn.streakOn', on ? '1' : '0'); } catch {} }
  ));
  v.append(toggleRow(
    'Smart next set',
    'Starts where you started last time, climbs back up, repeats after a hard set; reps show as a target. Off: copies your last set',
    smartOn,
    (on) => { try { localStorage.setItem('gn.smartNext', on ? '1' : '0'); } catch {} }
  ));
  const targetVal = el('span', { class: 'limit-val' }, `${weeklyTarget()} days`);
  const nudgeTarget = (dir) => {
    const next = parseTarget(weeklyTarget() + dir);
    try { localStorage.setItem('gn.weeklyTarget', String(next)); } catch {}
    targetVal.textContent = `${next} day${next === 1 ? '' : 's'}`;
  };
  v.append(el('div', { class: 'row spread card', style: 'background:var(--panel-2)' },
    el('div', { class: 'grow' },
      el('div', {}, 'Weekly target'),
      el('div', { class: 'tiny faint', style: 'margin-top:2px' }, 'Gym days a week that keep a streak going')),
    el('button', { class: 'btn sm', 'aria-label': 'Fewer days', onClick: () => nudgeTarget(-1) }, '−'),
    targetVal,
    el('button', { class: 'btn sm', 'aria-label': 'More days', onClick: () => nudgeTarget(1) }, '+')
  ));

  // --- rest timer ----------------------------------------------------------
  v.append(el('h3', {}, 'Rest timer'));
  v.append(toggleRow(
    'Live rest timer',
    'Counts up under the last set, turning red as it reaches the limit',
    liveRestOn,
    (on) => { try { localStorage.setItem('gn.liveRest', on ? '1' : '0'); } catch {} }
  ));
  const limitVal = el('span', { class: 'limit-val' }, formatRest(restLimit() * 1000));
  const nudgeLimit = (dir) => {
    const next = stepLimit(restLimit(), dir);
    try { localStorage.setItem('gn.restLimit', String(next)); } catch {}
    limitVal.textContent = formatRest(next * 1000);
  };
  v.append(el('div', { class: 'row spread card', style: 'background:var(--panel-2)' },
    el('div', { class: 'grow' },
      el('div', {}, 'Rest limit'),
      el('div', { class: 'tiny faint', style: 'margin-top:2px' }, 'Red, and a buzz, after this long')),
    el('button', { class: 'btn sm', 'aria-label': 'Shorter', onClick: () => nudgeLimit(-1) }, '−'),
    limitVal,
    el('button', { class: 'btn sm', 'aria-label': 'Longer', onClick: () => nudgeLimit(1) }, '+')
  ));
  if (vibrateSupported()) {
    v.append(toggleRow(
      'Vibrate at limit',
      'One buzz when your or your partner\'s rest passes the limit — only while the app is open and the screen is on',
      restBuzzOn,
      (on) => { try { localStorage.setItem('gn.restBuzz', on ? '1' : '0'); } catch {} if (on) buzzTest(); }
    ));
  } else {
    v.append(el('div', { class: 'row spread card', style: 'background:var(--panel-2);opacity:.6' },
      el('div', { class: 'grow' },
        el('div', {}, 'Vibrate at limit'),
        el('div', { class: 'tiny faint', style: 'margin-top:2px' },
          'Not supported by this browser — iOS has never shipped it')),
      el('span', { class: 'pill' }, 'N/A')
    ));
  }

  // --- alerts --------------------------------------------------------------
  v.append(el('h3', {}, 'Alerts'));
  v.append(toggleRow(
    'Notifications',
    'Pop-up toast when the other person logs a set',
    notifOn,
    (on) => { setNotif(on); }
  ));
  v.append(toggleRow(
    'Sound',
    'Play the tone with the toast',
    soundOn,
    (on) => { setSound(on); if (on) chime(); }   // also unlocks audio on iOS
  ));

  // Say plainly when the browser cannot do it, rather than offering a switch
  // that silently does nothing.
  if (vibrateSupported()) {
    v.append(toggleRow(
      'Vibrate',
      'Buzz with the toast — only while the app is open',
      vibrateOn,
      (on) => { setVibrate(on); if (on) buzzTest(); }
    ));
  } else {
    v.append(el('div', { class: 'row spread card', style: 'background:var(--panel-2);opacity:.6' },
      el('div', { class: 'grow' },
        el('div', {}, 'Vibrate'),
        el('div', { class: 'tiny faint', style: 'margin-top:2px' },
          'Not supported by this browser — iOS has never shipped it')),
      el('span', { class: 'pill' }, 'N/A')
    ));
  }

  v.append(el('div', { class: 'tiny faint', style: 'margin:-2px 0 4px' },
    'The Alerts tab keeps filling either way — these only control the interruption.'));

  v.append(el('div', { class: 'tiny faint', style: 'text-align:center;margin-top:30px;opacity:.7' },
    `BroSplit Pro · v${VERSION}`));

  v.append(el('button', { class: 'btn block danger', style: 'margin-top:26px', onClick: async () => {
    const ok = await confirmSheet('Forget key on this device?',
      'You will need to paste it again next time. Use this before handing the phone to anyone.',
      'Forget');
    if (ok) { clearKey(); location.reload(); }
  } }, 'Forget key on this device'));

}

/* ============================ today's log ============================ */

function groupIntoExercises(sets) {
  // Sets are flat; group by exercise preserving first-logged order.
  const order = [];
  const byEx = new Map();
  // When each set was LOGGED, not when the server received it. After an
  // offline session createdAt is the moment the phone reconnected, which
  // could show a basement workout out of order.
  const sorted = [...sets].sort(byTime);
  for (const s of sorted) {
    if (!byEx.has(s.exerciseId)) { byEx.set(s.exerciseId, []); order.push(s.exerciseId); }
    byEx.get(s.exerciseId).push(s);
  }
  return order.map((id) => ({ exerciseId: id, sets: byEx.get(id) }));
}

/**
 * Who typed a set someone else entered: a small outline phone and the name, in
 * faint ink. It used to be a gold "entered by X" pill, which shouted about the
 * least important thing on the row.
 *
 * A phone because that is literally what the field records — whose phone the
 * set was logged from. A person glyph would read as whose set it is, and a pen
 * would collide with the pencil edit button. Drawn as SVG rather than an emoji because
 * Android renders emoji in full colour, which defeats "mild".
 */
function enteredOn(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(NS, 'svg');
  icon.setAttribute('viewBox', '0 0 10 14');
  icon.setAttribute('class', 'by-icon');
  icon.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: 1, y: 1, width: 8, height: 12, rx: 1.8 })) body.setAttribute(k, v);
  const speaker = document.createElementNS(NS, 'line');
  for (const [k, v] of Object.entries({ x1: 4, x2: 6, y1: 10.6, y2: 10.6 })) speaker.setAttribute(k, v);
  icon.append(body, speaker);
  return el('span', { class: 'by', title: `Entered on ${name}'s phone` }, icon, name);
}

/** Settings → "Show time between sets". On by default — turning it off is the opt-out. */
const restOn = () => { try { return localStorage.getItem('gn.showRest') !== '0'; } catch { return true; } };

/** Settings → Pro features. Both on by default; the weekly target defaults to 4 days. */
const prOn     = () => { try { return localStorage.getItem('gn.prOn') !== '0'; } catch { return true; } };
const streakOn = () => { try { return localStorage.getItem('gn.streakOn') !== '0'; } catch { return true; } };
const weeklyTarget = () => { try { return parseTarget(localStorage.getItem('gn.weeklyTarget')); } catch { return parseTarget(null); } };

/*
 * PRs (js/pr.js): worked out from every set this phone holds, cached until the
 * data changes. A set that becomes a PR within two minutes of being logged is
 * celebrated: a gold flash on its row and a toast, for your sets and your
 * partner's as they arrive. Older ones just carry the tag.
 */
const PR_FLASH_MS = 1600;
const prs = { map: new Map(), recent: null, sets: null, flash: new Map() };

function prMap() {
  if (prs.recent === state.recent && prs.sets === state.sets) return prs.map;
  const held = heldSets();
  const byId = new Map(held.map((x) => [x.id, x]));
  const next = allPRs(held);
  const fresh = newPRs(prs.map, next, byId, Date.now());
  prs.map = next; prs.recent = state.recent; prs.sets = state.sets;
  if (fresh.length && prOn()) celebrate(fresh.map((id) => byId.get(id)));
  return next;
}

function celebrate(sets) {
  const now = Date.now();
  for (const x of sets) prs.flash.set(x.id, now);
  if (document.hidden) return;   // the tag stays; a toast nobody sees is pointless
  const x = sets[sets.length - 1];
  const who = state.profiles.find((p) => p.id === x.profileId)?.name;
  const forWhom = who && who !== state.owner ? ` for ${who}` : '';
  toast(`New PR${forWhom}: ${formatSetLoad(x)} ${formatEffortCompact(x)} on ${exerciseById(x.exerciseId)?.name || 'this exercise'}`, 'trophy');
}

const isPR = (x) => prOn() && prMap().has(x.id);

/** Every set this phone holds: the shared 90-day window plus the active profile's full history. */
function heldSets() {
  const byId = new Map();
  for (const x of [...state.recent, ...state.sets]) byId.set(x.id, x);
  return [...byId.values()];
}

/** Settings → Pro features → Smart next set. On by default. */
const smartOn = () => { try { return localStorage.getItem('gn.smartNext') !== '0'; } catch { return true; } };

/** Class and timing for a row whose set just became a PR, so a re-render mid-flash carries on. */
function prFlashAttrs(x) {
  const at = prs.flash.get(x.id);
  if (!at) return { cls: '', style: '' };
  const age = Date.now() - at;
  if (age > PR_FLASH_MS) { prs.flash.delete(x.id); return { cls: '', style: '' }; }
  return { cls: ' pr-flash', style: `--prd:-${age}ms` };
}
const joinStyle = (...parts) => parts.filter(Boolean).join(';') || null;

/** Settings → Rest timer. Both on by default; the limit defaults to 5:00. */
const liveRestOn = () => { try { return localStorage.getItem('gn.liveRest') !== '0'; } catch { return true; } };
const restBuzzOn = () => { try { return localStorage.getItem('gn.restBuzz') !== '0'; } catch { return true; } };
const restLimit  = () => { try { return parseLimit(localStorage.getItem('gn.restLimit')); } catch { return parseLimit(null); } };

/** "Resting 2:41" under the set someone is resting after. The ticker keeps it live. */
function restLiveRow(since) {
  const row = el('div', { class: 'rest-live', 'data-since': String(since), role: 'timer' },
    el('span', { class: 'rest-live-label' }, 'Resting'),
    el('span', { class: 'rest-live-time' }));
  paintRestLive(row, Date.now());
  return row;
}

// The current theme's grey, gold and red, read from the stylesheet so the
// timer always uses colours that were contrast-checked against its background.
const heatStops = () => {
  const cs = getComputedStyle(document.documentElement);
  return ['--faint', '--gold', '--bad'].map((v) => cs.getPropertyValue(v).trim());
};

function paintRestLive(row, now) {
  const elapsed = Math.max(0, now - Number(row.dataset.since));
  if (elapsed > LIVE_MAX_MS) { row.remove(); return; }
  const limit = restLimit();
  row.lastChild.textContent = formatRest(elapsed);
  row.style.setProperty('--heat', heatColor(restHeat(elapsed, limit), heatStops()));
  row.classList.toggle('over', elapsed >= limit * 1000);
}

// One buzz per set, remembered across reloads so reopening the app inside the
// buzz window does not buzz again.
const buzzedSets = (() => { try { return JSON.parse(localStorage.getItem('gn.restBuzzed') || '[]'); } catch { return []; } })();

/**
 * Buzz when either person on the exercise screen passes the limit, on whatever
 * screen is open — typing the other person's set is exactly when you would
 * miss a colour change.
 */
function checkRestBuzz(now) {
  if (!restBuzzOn() || !vibrateSupported() || !state.profiles.length) return;
  const { left, right } = layoutSides({
    profiles: state.profiles, owner: state.owner, rightId: localStorage.getItem('gn.rightSide'),
  });
  const today = S.todayKey();
  const limit = restLimit();
  for (const p of [left, right]) {
    if (!p) continue;
    const r = restingAfter(state.recent, { profileId: p.id, today, now });
    if (!r || buzzedSets.includes(r.set.id) || !shouldBuzz(r.elapsed, limit)) continue;
    // Not marked unless it fired: a hidden page can still buzz once it is back,
    // inside the window.
    if (buzzRest()) {
      buzzedSets.push(r.set.id);
      buzzedSets.splice(0, buzzedSets.length - 20);
      try { localStorage.setItem('gn.restBuzzed', JSON.stringify(buzzedSets)); } catch {}
    }
  }
}

/**
 * Appends each set's row in logging order, numbering working sets from 1 (a
 * warm-up shows W and takes no number). When enabled, puts the time since the
 * previous set between rows — every list that shows a day's sets goes through
 * here, so numbering and gaps behave the same everywhere.
 */
function appendSets(container, sets, makeRow) {
  const gaps = restOn() ? restGaps(sets) : [];
  let n = 0;
  sets.forEach((x, i) => {
    if (gaps[i] != null) {
      container.append(el('div', {
        class: 'rest-gap',
        title: 'Time since the previous set — includes the set itself, since only the end of a set is recorded',
      // "Rest:" — a bare "4:07" read as a time of day, not a duration.
      }, icon('timer', { size: 12, cls: 'rest-gap-icon' }), 'Rest: ' + formatRest(gaps[i])));
    }
    if (!x.warmup) n++;
    container.append(makeRow(x, n));
  });
}

function setLine(s, index, opts = {}) {
  // Tag only when the typist differs from whose record it is.
  const byOther = s.enteredBy && opts.ownerName && s.enteredBy !== opts.ownerName;
  const sup = SUPPORT[s.support] || SUPPORT.none;
  const load = el('span', { class: 'load' }, formatSetLoad(s));

  const main = el('div', { class: 'set-main' },
    el('div', { class: 'row wrap', style: 'gap:6px;align-items:baseline' },
      load,
      el('span', { class: 'muted' }, (s.metric === 'time' ? 'for ' : 'for ') + formatEffort(s)),
      s.support !== 'none' ? el('span', { class: 'tiny ' + sup.cls }, sup.label) : null,
      s.warmup ? el('span', { class: 'pill warmup' }, 'warm-up') : null,
      isPR(s) ? el('span', { class: 'tag tag-pr' }, 'PR') : null,
      byOther ? enteredOn(s.enteredBy) : null
    )
  );

  for (const d of s.drops || []) {
    main.append(el('div', { class: 'tiny drop' },
      '↳ then ' + formatLoad(d.weight, d.unit, s.perSide) + ' for ' + d.reps + (d.halfReps ? ` + ${d.halfReps} half` : '') + ' reps'));
  }
  if (s.comment) main.append(el('div', { class: 'cmt' }, s.comment));

  const fresh = freshAttrs(s);
  if (opts.showTime) {
    const at = setTime(s);
    if (at) main.append(el('div', { class: 'set-at' }, fmtTime(at, true)));
  }

  // A changed record says so — otherwise an edit is indistinguishable from the
  // original entry, and nobody can tell numbers were corrected after the fact.
  if (s.editedAt) {
    main.append(el('div', { class: 'set-at' }, `edited${s.editedBy ? ' by ' + s.editedBy : ''} · ${timeAgo(s.editedAt)}`));
  }

  const flash = prFlashAttrs(s);
  return el('div', { class: 'set-line' + fresh.cls + flash.cls, style: joinStyle(fresh.style, flash.style) },
    el('span', { class: 'set-no' }, s.warmup ? 'W' : `${index}.`),
    main,
    opts.onEdit ? el('button', { class: 'btn sm edit-btn', 'aria-label': 'Edit set', onClick: opts.onEdit }, icon('pencil', { size: 15 })) : null,
    opts.onDelete ? el('button', { class: 'btn sm danger', 'aria-label': 'Delete set', onClick: opts.onDelete }, icon('x', { size: 16 })) : null
  );
}

function viewLog(v) {
  const p = activeProfile();
  if (!p) {
    return v.append(el('div', { class: 'empty' },
      'No one selected.', el('br'),
      el('button', { class: 'btn primary', style: 'margin-top:14px', onClick: () => go('settings') }, 'Choose a person')));
  }

  const today = S.todayKey();
  const todaySets = state.sets.filter((s) => s.date === today);

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:12px' },
    el('h2', { style: 'margin:0' }, `${p.name} · Today`),
    el('span', { class: 'tiny faint' }, `${todaySets.length} set${todaySets.length === 1 ? '' : 's'}`)
  ));

  if (viewingSomeoneElse()) {
    v.append(el('div', { class: 'viewing-note' },
      `Viewing ${p.name}'s log · you are ${state.owner}`));
  }

  v.append(el('button', { class: 'btn primary block', style: 'margin-bottom:14px', onClick: () => go('search') },
    '+ Log a set'));

  if (!todaySets.length) {
    v.append(el('div', { class: 'empty' }, 'Nothing logged today.', el('br'), 'Hit the button above to start.'));
    return;
  }

  for (const grp of groupIntoExercises(todaySets)) {
    const ex = exerciseById(grp.exerciseId);
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'row spread', style: 'margin-bottom:6px' },
      el('strong', { class: 'grow' }, ex ? ex.name : '(deleted exercise)'),
      el('button', { class: 'btn sm', onClick: () => go('ex/' + grp.exerciseId) }, '+ set')
    ));

    appendSets(card, grp.sets, (s, n) => setLine(s, n, {
        ownerName: p.name,
        onEdit: () => go('edit/' + s.id),
        onDelete: async () => {
          if (await confirmSheet('Delete this set?', formatSetLoad(s) + ' for ' + formatEffort(s))) {
            await S.deleteSet(s.id); toast('Set deleted');
          }
        }
      }));
    v.append(card);
  }
}

/* ============================ exercise search ============================ */

/** Settings → Search → "Most-done exercises first". On by default. */
const searchFreqOn = () => { try { return localStorage.getItem('gn.searchFreq') !== '0'; } catch { return true; } };

// Days each exercise was trained in the last 2 weeks, both of you together —
// search ranks the ones you actually do above the ones you never touch. Off:
// name matches still come first, then muscle priority, then A-Z.
const recentUse = () => searchFreqOn() ? recentFrequency(state.recent, { today: S.todayKey(), days: 14 }) : null;

/** Settings → Search → "Put my usual pick first". On by default. Kept on this phone only. */
const learnOn = () => { try { return localStorage.getItem('gn.learnPicks') !== '0'; } catch { return true; } };
const loadPicks = () => { try { return parseStore(localStorage.getItem('gn.searchPicks')); } catch { return parseStore(null); } };

/** The exercise this phone's owner usually taps for what is typed, or null. */
const usualPick = (query) => (learnOn() ? learnedPick(loadPicks(), query, Date.now()) : null);

/** Remember a tap in the search results, under what was typed. */
function rememberPick(query, exerciseId) {
  if (!learnOn() || !query.trim()) return;
  try { localStorage.setItem('gn.searchPicks', JSON.stringify(recordPick(loadPicks(), query, exerciseId, Date.now()))); } catch {}
}

const savePicks = (store) => { try { localStorage.setItem('gn.searchPicks', JSON.stringify(store)); } catch {} };

/**
 * Settings → Search → Show my picks: what was typed, what was tapped, and a
 * delete on each phrase. The top exercise under a phrase is the one search
 * puts first for it.
 */
function viewPicks(v) {
  const list = listPicks(loadPicks(), Date.now());

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:4px' },
    // whose they are: each phone learns its own owner's habits
    el('h2', { class: 'grow', style: 'margin:0' }, state.owner ? `${state.owner}'s usual picks` : 'Usual picks on this phone'),
    el('button', { class: 'btn sm', onClick: () => (prevHash ? history.back() : go('settings')) }, 'Back')));
  v.append(el('div', { class: 'tiny faint', style: 'margin-bottom:14px' },
    'What you typed in search, and what you tapped. The top one comes first when you type those words. Kept on this phone only.'));

  if (!list.length) {
    v.append(el('div', { class: 'card empty' },
      learnOn() ? 'Nothing yet. Type in search and tap an exercise, and it shows up here.'
                : 'Nothing yet, and "Put my usual pick first" is off.'));
    return;
  }

  const name = (id) => exerciseById(id)?.name || 'Deleted exercise';
  const times = (n) => `${n.toLocaleString('en-US')} pick${n === 1 ? '' : 's'}`;

  v.append(el('div', { class: 'manage-list' }, ...list.map(({ phrase, picks, at }) => {
    const [top, ...rest] = picks;
    return el('div', { class: 'pick-row' },
      el('div', { class: 'grow' },
        el('div', { class: 'pick-phrase' }, `“${phrase}”`),
        el('div', { class: 'pick-main' }, '→ ' + name(top.id)),
        el('div', { class: 'meta' }, `${times(top.n)} · last ${timeAgo(at)}`),
        rest.length ? el('div', { class: 'pick-also' },
          'also ' + rest.map((r) => `${name(r.id)} (${r.n.toLocaleString('en-US')})`).join(', ')) : null),
      el('button', { class: 'btn sm danger', 'aria-label': `Delete “${phrase}”`, onClick: () => {
        savePicks(forgetPhrase(loadPicks(), phrase));
        toast(`Deleted “${phrase}”`);
        render();
      } }, 'Delete'));
  })));

  v.append(el('button', { class: 'btn block danger', style: 'margin-top:16px', onClick: async () => {
    if (!(await confirmSheet('Delete all your picks?',
      `${list.length.toLocaleString('en-US')} on this phone. Search goes back to its normal order.`, 'Delete all'))) return;
    try { localStorage.removeItem('gn.searchPicks'); } catch {}
    toast('All picks deleted');
    render();
  } }, 'Delete all'));
}

function viewSearch(v) {
  const input = el('input', { placeholder: 'Search — try "tricep" or "incline db"', autocomplete: 'off' });
  const results = el('div');

  const paint = () => {
    clear(results);
    const pinned = usualPick(input.value);
    const hits = searchExercises(state.exercises, input.value, { frequency: recentUse(), pinned });
    if (!hits.length) {
      results.append(el('div', { class: 'empty' }, 'No match.'));
    }
    for (const ex of hits.slice(0, 40)) {
      results.append(el('button', { class: 'result', onClick: () => { rememberPick(input.value, ex.id); go('ex/' + ex.id); } },
        el('div', { class: 'grow' },
          el('div', { class: 'name' }, ex.name),
          el('div', { class: 'row wrap', style: 'gap:4px;margin-top:4px' },
            // says why it jumped the queue
            ex.id === pinned ? el('span', { class: 'pill learned-pill' }, icon('rotate-ccw', { size: 11 }), 'your pick') : null,
            ...(ex.muscles || []).slice(0, 3).map((m, i) =>
              el('span', { class: 'pill' + (i === 0 ? ' primary-muscle' : '') }, m))
          )
        ),
        el('span', { class: 'tiny faint' }, (ex.allowedUnits || []).map((u) => UNITS[u]?.label).join('/')),
        el('span', { class: 'go' }, '›')
      ));
    }
  };

  input.addEventListener('input', paint);

  // "+" sits beside the search box rather than under the results: with 34
  // exercises the bottom of the list is a long scroll away on a phone.
  v.append(
    el('h2', {}, 'Pick an exercise'),
    el('div', { class: 'row' },
      el('div', { class: 'grow' }, input),
      el('button', {
        class: 'btn', style: 'min-width:var(--tap);padding:0;font-size:1.3rem;line-height:1',
        title: 'New exercise', 'aria-label': 'New exercise',
        onClick: () => go('exercises/new'),
      }, '+')
    ),
    el('div', { style: 'height:12px' }),
    results
  );

  paint();
  setTimeout(() => input.focus(), 30);
}

/* ============================ two-sided exercise view ============================ */

/** @deprecated use layoutSides() — kept only for the Log tab's own header. */
function myProfile() {
  return state.profiles.find((p) => p.name === state.owner) || activeProfile();
}

const setsFor = (profileId, exerciseId, date) => state.recent
  .filter((x) => x.profileId === profileId && x.exerciseId === exerciseId && x.date === date)
  .sort(byTime);

/**
 * One person's column. `header` replaces the plain name when this side is
 * selectable, so the picker sits ON the column it controls — floating it above
 * both columns made it read as a global switch, which is what confused things.
 */
/**
 * Tags for a set: warm-up, support level, drop. "No sup" is omitted — it is the
 * default, and printing it on every row would bury the ones that matter.
 */
function setTags(x) {
  const tags = [];
  if (isPR(x)) tags.push(el('span', { class: 'tag tag-pr' }, 'PR'));
  if (x.warmup) tags.push(el('span', { class: 'tag tag-warm' }, 'warm-up'));
  const sup = SUPPORT[x.support];
  if (sup && x.support !== 'none') {
    tags.push(el('span', { class: 'tag ' + (x.support === 'failure' ? 'tag-fail' : 'tag-sup') }, sup.label));
  }
  if ((x.drops || []).length) tags.push(el('span', { class: 'tag tag-drop' }, 'drop'));
  if (x.editedAt) tags.push(el('span', { class: 'tag tag-edited' }, 'edited'));
  return tags;
}

/**
 * One set in a half-width column.
 *
 * `rich` adds tags, drop detail and the comment — used for last time, which is
 * exactly where you have forgotten the context. A warm-up there without its
 * marker reads as a heavy working set; that is the confusion this exists to stop.
 * Today's rows stay compact: you entered them minutes ago and are scanning fast.
 */
function columnSetRow(x, n, { rich = false, onEdit = null } = {}) {
  const fresh = freshAttrs(x);
  const idx = el('span', { class: 'n' + (x.warmup ? ' n-warm' : '') }, x.warmup ? 'W' : String(n));
  const head = el('div', { class: 'tile-head' },
    idx,
    el('span', { class: 'load' }, formatSetLoad(x)),
    el('span', { class: 'muted' }, formatEffortCompact(x)),
    // today's rows are compact: a small mark instead of the full tag row
    !rich && isPR(x) ? el('span', { class: 'pr-mark' }, 'PR') : null,
    !rich && (x.drops || []).length ? el('span', { class: 'tiny drop' }, '\u2193') : null,
    onEdit ? el('span', { class: 'grow' }) : null,
    onEdit ? el('button', { class: 'btn sm edit-btn', 'aria-label': 'Edit set', onClick: onEdit }, icon('pencil', { size: 13 })) : null
  );

  const flash = prFlashAttrs(x);
  if (!rich) {
    return el('div', { class: 'side-set' + (x.warmup ? ' is-warm' : '') + fresh.cls + flash.cls, style: joinStyle(fresh.style, flash.style) }, head);
  }

  const tile = el('div', { class: 'tile' + (x.warmup ? ' is-warm' : '') + flash.cls, style: joinStyle(flash.style) }, head);

  const tags = setTags(x);
  if (tags.length) tile.append(el('div', { class: 'tile-tags' }, ...tags));

  for (const d of x.drops || []) {
    tile.append(el('div', { class: 'tile-drop' },
      '\u21b3 ' + formatLoad(d.weight, d.unit, x.perSide) + ' \u00d7' + d.reps + (d.halfReps ? `+${d.halfReps}h` : '')));
  }

  if (x.comment) tile.append(el('div', { class: 'tile-note' }, x.comment));
  return tile;
}

function sideColumn(profile, exerciseId, date, isMe, header) {
  const sets = setsFor(profile.id, exerciseId, date);
  const col = el('div', { class: 'side' + (isMe ? ' me' : '') });

  col.append(el('div', { class: 'side-head' },
    isMe
      ? el('span', { class: 'side-who grow' }, profile.name)
      : el('div', { class: 'grow' }, header || el('span', { class: 'side-who' }, profile.name)),
    isMe ? el('span', { class: 'side-tag' }, 'you') : null
  ));

  if (!sets.length) {
    col.append(el('div', { class: 'side-empty' }, 'no sets yet'));
  } else {
    // Edit right where you just logged it: a missed Failure tag or wrong unit
    // is usually caught here, seconds later. Returns to this screen after.
    appendSets(col, sets, (x, n) => columnSetRow(x, n, { onEdit: () => go('edit/' + x.id) }));
  }

  // Counting up under the last set, while this is the last thing they did.
  const live = liveRestOn() && restingAfter(state.recent, { profileId: profile.id, today: date, now: Date.now() });
  if (live && live.set.exerciseId === exerciseId) col.append(restLiveRow(live.since));

  col.append(el('button', { class: 'side-add', onClick: () => go(`set/${exerciseId}/${profile.id}`) },
    '+ add set'));

  // Inside the column rather than one shared block underneath: both people are
  // logged from this one phone, so both sides need their own previous numbers.
  const lt = lastSessionFor(state.recent, { exerciseId, profileId: profile.id, excludeDate: date });
  if (lt) {
    const box = el('div', { class: 'side-last' },
      el('div', { class: 'side-last-when' }, 'last \u00b7 ' + dayLabel(lt.date)));
    appendSets(box, lt.sets, (x, n) => columnSetRow(x, n, { rich: true }));
    col.append(box);
  } else {
    col.append(el('div', { class: 'side-last' },
      el('div', { class: 'side-last-when' }, 'no previous sets')));
  }
  return col;
}

/**
 * The screen after picking an exercise. Left is always you and never changes.
 * Right is whoever you select. Both columns are always full columns — an earlier
 * version collapsed the right one when that person had not trained yet, which
 * added a third name to the screen and hid the button it was meant to surface.
 */
function viewExercise(v, exerciseId) {
  const ex = exerciseById(exerciseId);
  if (!ex) return go('log');

  const date = S.todayKey();
  const { mode, left, right, options } = layoutSides({
    profiles: state.profiles,
    owner: state.owner,
    rightId: localStorage.getItem('gn.rightSide'),
  });
  if (mode === 'none' || !left) return go('settings');

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:2px' },
    el('strong', { class: 'grow', style: 'font-size:1.05rem' }, ex.name),
    el('button', { class: 'btn sm with-icon', onClick: () => go('progress/' + ex.id) }, icon('chart-line', { size: 16 }), 'Progress'),
    el('button', { class: 'btn sm', onClick: () => go('exercises/' + ex.id) }, 'Edit')
  ));
  v.append(el('div', { class: 'tiny faint', style: 'margin-bottom:12px' }, (ex.muscles || []).join(' \u2192 ')));

  if (mode === 'single') {
    v.append(sideColumn(left, exerciseId, date, true));
  } else {
    // With exactly one other person there is nothing to choose, so show a name.
    // With more, the column header becomes a <select> — compact enough to live
    // inside a half-width column, unlike a segmented control.
    let header = null;
    if (options.length > 1) {
      header = el('select', { class: 'side-pick', onChange: (e) => {
        localStorage.setItem('gn.rightSide', e.target.value);
        render();
      } }, ...options.map((p) => el('option', { value: p.id, selected: p.id === right.id }, p.name)));
    }
    v.append(el('div', { class: 'sides' },
      sideColumn(left, exerciseId, date, true),
      sideColumn(right, exerciseId, date, false, header)
    ));
  }

  // Side by side rather than stacked: one row of height back for the chart.
  v.append(el('div', { class: 'row', style: 'margin-top:14px' },
    el('button', { class: 'btn grow', onClick: () => go('search') }, 'Another exercise'),
    el('button', { class: 'btn grow', onClick: () => go('log') }, 'Done')
  ));

  // The chart right here, so progress is visible the moment an exercise is
  // picked. The Progress button above still opens the full page with its table.
  if (inlineChartOn()) {
    const people = mode === 'single' ? [left] : [left, right];
    v.append(el('div', { class: 'row spread inline-chart-head' },
      el('h3', { style: 'margin:0' }, 'Progress'),
      el('button', { class: 'btn sm', onClick: () => go('progress/' + exerciseId) }, 'Details ›')));
    appendProgressChart(v, ex, people, { inline: true });
  }
}

/* ============================ progress ============================ */

let progressSel = null;   // { exercise, key, date } — the tapped point

/** Settings → "Show progress chart on exercise screen". On by default. */
const inlineChartOn = () => { try { return localStorage.getItem('gn.inlineChart') !== '0'; } catch { return true; } };

/** Settings → "Animate charts". On by default. */
const chartAnimOn = () => { try { return localStorage.getItem('gn.chartAnim') !== '0'; } catch { return true; } };

// The chart last animated. Tapping a point or a resize re-renders the chart, and
// replaying the entrance on every tap would get old fast — so it plays only
// when a chart first appears or its metric changes. Cleared on leaving, so
// coming back plays it again.
let animatedKey = null;
let animatedAt = 0;          // 0 while the entrance waits to be seen (inline chart below the fold)
let chartWatch = null;       // the IntersectionObserver for that wait
const CHART_ANIM_MS = 2700;   // the 2.6s glide is the longest step; a rebuild inside it resumes

/**
 * Every set held for an exercise: the shared 90-day window for everyone, plus
 * the active profile's full history, de-duplicated by id.
 */
function chartPool(exerciseId) {
  const byId = new Map();
  for (const s of [...state.recent, ...state.sets]) if (s.exerciseId === exerciseId) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * Same two people as the exercise columns: left is you, right is whoever is
 * selected there. One line each on one plot, so they compare directly.
 */
/** You plus the selected right-hand person — the same two as the exercise columns. */
function chartPeople() {
  const { mode, left, right } = layoutSides({
    profiles: state.profiles, owner: state.owner, rightId: localStorage.getItem('gn.rightSide'),
  });
  if (mode === 'none') return null;
  return mode === 'single' ? [left] : [left, right];
}

/**
 * The metric toggle and chart card, shared by the Progress page and the
 * exercise screen so the two can never drift apart.
 *
 * `inline` is the exercise-screen version. A tap opens the full Progress page
 * on that day — the table and the day's sets live there. With no trend to draw
 * it shows a one-line hint instead of tiles, since the columns above it already
 * show that one session, and nothing at all for a brand-new exercise.
 *
 * @returns the buildProgress() result
 */
function appendProgressChart(v, ex, people, { inline = false } = {}) {
  const exerciseId = ex.id;
  const P = buildProgress({
    exercise: ex,
    people,
    pool: chartPool(exerciseId),
    metric: localStorage.getItem('gn.chartMetric'),
  });
  const { metric, metrics, series } = P;

  if (inline && P.layout !== 'chart') {
    if (P.layout === 'tiles') {
      v.append(el('div', { class: 'tiny faint inline-chart-hint' },
        icon('chart-line', { size: 14 }), ' A progress chart appears here after a second session.'));
    }
    return P;
  }

  // Top weight / Reps / Volume. Above the chart on the Progress page; below it
  // on the exercise screen, where the sets above already push the chart down
  // and the chart is what matters.
  const picker = metrics.length > 1 && el('div', { class: inline ? 'metric-pick below' : 'metric-pick' },
    segmented(metrics.map((k) => ({ key: k, label: CHART_METRICS[k].label })), metric, (k) => {
      localStorage.setItem('gn.chartMetric', k);
      progressSel = null;
      render();
    }));

  const card = el('div', { class: 'card chart-card' });
  if (picker && !inline) v.append(picker);
  v.append(card);
  if (picker && inline) v.append(picker);

  // The tapped point, if it belongs to this exercise. Inline never holds one:
  // a tap there opens the full page instead.
  const sel = !inline && progressSel && progressSel.exercise === exerciseId ? progressSel : null;

  // --- legend: shape + name in text colour; identity is never colour alone ---
  // Tiles already name each person beside the same swatch, so only the chart
  // needs a legend.
  if (series.length > 1 && P.layout === 'chart') {
    card.append(el('div', { class: 'legend' },
      ...series.map((s) => el('span', { class: 'legend-item' },
        el('span', { class: `swatch s-${s.key} ${s.marker}` }), s.name))));
  }

  if (P.layout === 'empty') {
    card.append(el('div', { class: 'empty' }, 'No sets logged yet.'));
  } else if (P.layout === 'tiles') {
    // One session is a number, not a trend: a lone dot on an axis says nothing.
    card.append(el('div', { class: 'tiles' }, ...series.map((s) => statTile(s))));
    card.append(el('div', { class: 'tiny faint', style: 'margin-top:10px;text-align:center' },
      'The chart appears after a second session.'));
  } else {
    const plot = el('div', { class: 'plot' });
    card.append(plot);
    // A rebuild during the entrance (a set syncing in, a quick tap) passes how
    // far along it is, so the new elements resume mid-animation rather than
    // snapping to the end or restarting. The inline and full-page charts are
    // separate entrances, so the key says which.
    const key = (inline ? 'inline|' : 'page|') + exerciseId + '|' + metric;
    // The exercise screen's chart often sits below a long list of last time's
    // sets, so its entrance played out of sight. Inline, it now waits, paused
    // on its first frame, until 90% of it is on screen, then plays once. (40%
    // let a chart peeking above the fold play while you were still reading the
    // sets.) A rebuild while it waits keeps waiting; one mid-entrance carries on.
    if (key !== animatedKey) { animatedKey = key; animatedAt = inline && chartAnimOn() ? 0 : Date.now(); }
    const waiting = animatedAt === 0;
    const elapsed = waiting ? 0 : Date.now() - animatedAt;
    const animate = chartAnimOn() && elapsed < CHART_ANIM_MS;
    chartWatch?.disconnect(); chartWatch = null;
    if (waiting) {
      plot.classList.add('paused');
      chartWatch = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        chartWatch?.disconnect(); chartWatch = null;
        if (animatedKey === key && animatedAt === 0) animatedAt = Date.now();
        plot.classList.remove('paused');
      }, { threshold: 0.9 });
      chartWatch.observe(plot);
    }
    drawChart(plot, {
      series, metric, selected: sel, animate, elapsed,
      axisTitle: P.axisTitle,
      integerAxis: P.integerAxis,
      onSelect: inline
        ? (k, p) => { progressSel = { exercise: exerciseId, key: k, date: p.date }; go('progress/' + exerciseId); }
        : (k, p) => {
            progressSel = sel && sel.key === k && sel.date === p.date ? null : { exercise: exerciseId, key: k, date: p.date };
            render();
          },
    });
  }

  // --- notes on what the numbers mean ---
  if (P.notes.length) card.append(el('div', { class: 'chart-notes' }, P.notes.join(' · ')));
  return P;
}

function viewProgress(v, exerciseId) {
  const ex = exerciseById(exerciseId);
  if (!ex) return go('log');
  const people = chartPeople();
  if (!people) return go('settings');

  // --- header ---
  v.append(el('div', { class: 'row spread', style: 'margin-bottom:2px' },
    el('strong', { class: 'grow', style: 'font-size:1.05rem' }, ex.name),
    // Back to wherever it was opened from: the exercise screen or the library.
    el('button', { class: 'btn sm', onClick: () => (prevHash ? history.back() : go('ex/' + exerciseId)) }, 'Back')
  ));
  v.append(el('div', { class: 'tiny faint', style: 'margin-bottom:12px' }, (ex.muscles || []).join(' → ')));

  const P = appendProgressChart(v, ex, people);
  const { metric, series } = P;
  const sel = progressSel && progressSel.exercise === exerciseId ? progressSel : null;

  // --- the tapped day, exactly as logged ---
  const hit = sel && series.find((s) => s.key === sel.key)?.points.find((p) => p.date === sel.date);
  if (hit) {
    const who = series.find((s) => s.key === sel.key).name;
    const box = el('div', { class: 'card' },
      el('div', { class: 'row spread', style: 'margin-bottom:6px' },
        el('strong', {}, `${who} · ${dayLabel(hit.date)}`),
        el('button', { class: 'btn sm', 'aria-label': 'Close', onClick: () => { progressSel = null; render(); } }, icon('x', { size: 16 }))));
    if (hit.suspect) {
      // The detector flags both directions, so name the unit that was logged.
      const logged = hit.top?.unit === 'lb' ? 'lb' : 'kg';
      const other = logged === 'kg' ? 'lb' : 'kg';
      box.append(el('div', { class: 'suspect-note' },
        `These numbers fit ${other} far better than ${logged} — probably the wrong unit was tapped. Tap the pencil on a set to correct it.`));
    }
    appendSets(box, hit.sets, (x, k) => columnSetRow(x, k, { rich: true, onEdit: () => go('edit/' + x.id) }));
    v.append(box);
  }

  // --- every value in a table, so nothing depends on tapping a dot ---
  // Chart only: on tiles it would print converted values beneath a tile that
  // shows the same set as logged, and the tiles already give every value.
  if (P.layout === 'chart') v.append(progressTable(series, metric));
}

function statTile(s) {
  const p = s.points[s.points.length - 1];
  return el('div', { class: `tile-stat s-${s.key}` },
    el('div', { class: 'tile-stat-who' }, el('span', { class: `swatch s-${s.key} ${s.marker}` }), s.name),
    p
      ? [el('div', { class: 'tile-stat-val' }, formatSetLoad(p.top) + ' ' + formatEffortCompact(p.top),
           p.suspect ? el('span', { class: 'suspect-mark', title: 'unit looks wrong' }, ' ?') : null),
         el('div', { class: 'tiny faint' }, dayLabel(p.date))]
      : el('div', { class: 'tiny faint', style: 'margin-top:6px' }, 'No sets yet'));
}

function progressTable(series, metric) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort().reverse();
  const cell = (s, d) => {
    const p = s.points.find((q) => q.date === d);
    // right-aligned like the numbers: left-aligned, the dash butted up against
    // the previous column's value and read as "34—"
    if (!p) return el('td', { class: 'num faint' }, '—');
    return el('td', { class: 'num' }, formatValue(p.value, metric),
      p.hollow ? el('span', { class: 'faint' }, ' ○') : null,
      p.suspect ? el('span', { class: 'suspect-mark', title: 'unit looks wrong' }, ' ?') : null);
  };
  return el('div', { class: 'card' },
    el('table', { class: 'ptable' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Day'), ...series.map((s) => el('th', { class: 'num' }, s.name)))),
      el('tbody', {}, ...dates.map((d) => el('tr', {},
        el('td', {}, dayLabel(d)), ...series.map((s) => cell(s, d)))))));
}

// The chart is drawn to the measured width, so redraw when the width changes.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (route()[0] === 'progress') render(); }, 150);
});

/* ============================ log a set ============================ */

/** Thin wrapper over the tested pure lookup. */
const lastTime = (exerciseId, excludeDate, profileId) =>
  lastSessionFor(state.recent, { exerciseId, profileId, excludeDate });

/**
 * The set form. With `existing` it edits that set instead of adding one: same
 * layout, prefilled, gold, and saving only the fields edits.js allows.
 */
function viewLogSet(v, exerciseId, profileId, existing = null) {
  const editing = !!existing;
  const ex = exerciseById(exerciseId);
  // The target is explicit in the URL now, not read from a global selector.
  // That is what makes dropping the confirm in the two-sided view safe.
  const p = resolveTarget(state.profiles, profileId, state.profileId);
  if (!ex || !p) return go('log');

  const today = S.todayKey();
  const draft = editing ? draftFromSet(existing) : S.blankSet(ex);
  const onBehalf = !!(state.owner && p.name !== state.owner);
  // An edit returns to wherever it was opened from (Log, History, a chart).
  const back = editing
    ? () => (prevHash ? history.back() : go('log'))
    : () => go('ex/' + exerciseId);

  // Smart next set (js/nextset.js): weight from where this person started last
  // time and the ladder they climbed; reps left empty with the target as a
  // hint, because the log must say what happened, not what was planned.
  // Off, or with nothing to go on: carry the last set forward as before.
  // Never when editing: the set already has its numbers.
  const todays = setsFor(p.id, exerciseId, today);
  const smart = !editing && smartOn() ? suggestNext({ sets: heldSets(), profileId: p.id, exerciseId, today }) : null;
  const prev = editing || smart?.primary ? null : todays[todays.length - 1] || lastTime(exerciseId, today, p.id)?.sets?.slice(-1)[0];
  if (smart?.primary) {
    const x = smart.primary;
    draft.weight = x.weight; draft.unit = x.unit;
    draft.perSide = x.perSide; draft.unilateral = x.unilateral;
    draft.warmup = x.warmup; draft.reps = null;
  } else if (prev) {
    draft.weight = prev.weight; draft.unit = prev.unit;
    draft.perSide = prev.perSide; draft.unilateral = prev.unilateral;
    draft.reps = prev.reps; draft.seconds = prev.seconds || 0;
  }

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:2px' },
    el('strong', { class: 'grow', style: 'font-size:1.02rem' }, ex.name),
    el('button', { class: 'btn sm', onClick: back }, 'Back')
  ));
  v.append(el('div', { class: 'tiny faint', style: 'margin-bottom:12px' }, (ex.muscles || []).join(' → ')));

  // --- today's sets for this person ---
  if (todays.length && !editing) {
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'tiny faint', style: 'margin-bottom:4px' }, 'Today so far'));
    appendSets(card, todays, (s, n) => setLine(s, n, {
      ownerName: p.name,
      onEdit: () => go('edit/' + s.id),
      onDelete: async () => { if (await confirmSheet('Delete this set?')) { await S.deleteSet(s.id); toast('Deleted'); } }
    }));
    v.append(card);
  }

  /* ---------------- the form ---------------- */
  const form = el('div', { class: 'card' + (editing ? ' edit-form' : '') });

  if (editing) {
    const at = setTime(existing);
    form.append(el('div', { class: 'edit-banner' },
      el('span', { class: 'edit-banner-icon' }, icon('pencil', { size: 22 })),
      el('div', {},
        el('strong', {}, `Editing ${p.name}'s set`),
        el('div', { class: 'tiny' }, dayLabel(existing.date) + (at ? ' at ' + fmtTime(at) : ''),
          existing.editedAt ? ` · last edited by ${existing.editedBy || 'someone'}` : ''))));
  } else {
    // Always name the target, in every flow. A label that appears only sometimes
    // is a label nobody reads — and this is now the only thing carrying it.
    form.append(el('div', { class: 'forwho' + (onBehalf ? ' other' : '') },
      el('span', { class: 'tiny' }, 'Adding a set for'),
      el('strong', {}, p.name),
      onBehalf ? el('span', { class: 'tiny' }, `· not ${state.owner}`) : null
    ));
  }

  const timed = draft.metric === 'time';
  const loaded = !draft.bodyweight;   // bodyweight work has no weight to enter

  const weight = stepper({
    value: draft.weight, step: stepFor(draft.unit), min: 0, decimals: 2,
    onChange: (val) => { draft.weight = val; },
  });

  // Reps or a duration, never both. 5s steps, because 1s would make a 90s plank
  // eighteen taps.
  const effort = timed
    ? stepper({ value: draft.seconds, step: TIME_STEP, min: 0, decimals: 0,
                onChange: (val) => { draft.seconds = val; } })
    : stepper({ value: draft.reps, step: 1, min: 0, decimals: 0, hint: smart?.primary?.reps ?? null,
                onChange: (val) => { draft.reps = val; } });

  // Live readout, so 90 reads as 1:30 without waiting for the set to save.
  const clock = timed ? el('div', { class: 'clock' }, formatDuration(draft.seconds)) : null;
  if (timed) effort.node.addEventListener('input', () => { clock.textContent = formatDuration(effort.get()); });

  // Changing unit retunes the step and, when adding, snaps the value onto the
  // new grid so switching kg -> lb cannot leave you on 17.5 lb.
  //
  // Not when editing. The point of an edit is usually "the wrong unit was
  // tapped": the number was right, the label was wrong. Snapping would quietly
  // change it — a 12.5 kg mistake corrected to lb would become 15 lb.
  const units = [...new Set([...(ex.allowedUnits || ['block']), draft.unit])]; // keep a since-removed unit
  const unitOpts = units.map((u) => ({ key: u, label: UNITS[u]?.label || u }));
  const unitRow = el('div');
  const paintUnits = () => {
    clear(unitRow).append(segmented(unitOpts, draft.unit, (k) => {
      draft.unit = k;
      weight.setStep(stepFor(k));
      if (!editing) {
        const snapped = snapTo(weight.get(), k);
        weight.set(snapped);
        draft.weight = snapped;
      }
      paintUnits();
    }));
  };
  paintUnits();

  if (loaded) {
    form.append(el('div', { class: 'row' },
      el('div', { class: 'grow' }, field('Weight', weight.node)),
      el('div', { class: 'grow' }, field('Unit', unitRow))
    ));
  } else {
    form.append(el('div', { class: 'tiny faint', style: 'margin-bottom:10px' }, 'Bodyweight — no load to record'));
  }

  form.append(field(timed ? 'Hold time (seconds)' : 'Reps', effort.node));
  if (clock) form.append(clock);

  // The suggestion's reason, and its two options as tap-to-fill chips.
  if (smart) {
    const box = el('div', { class: 'suggest' });
    const basis = smart.sessions ? ` · based on ${smart.sessions.toLocaleString('en-US')} session${smart.sessions === 1 ? '' : 's'}` : '';
    box.append(el('div', { class: 'suggest-why' }, smart.reason, el('span', { class: 'faint' }, basis)));
    const chips = el('div', { class: 'suggest-chips' });
    const apply = (x, chip) => {
      draft.unit = x.unit; weight.setStep(stepFor(x.unit)); paintUnits();
      draft.weight = x.weight; weight.set(x.weight);
      draft.reps = x.reps; effort.set(x.reps);
      draft.perSide = x.perSide; draft.unilateral = x.unilateral; draft.warmup = x.warmup;
      // the toggles below show the draft; keep them in step
      for (const b of form.querySelectorAll('button')) {
        const key = { 'kg/side': 'perSide', 'Each side': 'unilateral', 'Warm-up': 'warmup' }[b.textContent];
        if (key) b.classList.toggle('primary', !!draft[key]);
      }
      for (const c of chips.children) c.classList.toggle('on', c === chip);
    };
    const chip = (x, label) => {
      const c = el('button', { type: 'button', class: 'chip-sug', onClick: () => apply(x, c) },
        el('small', {}, label),
        el('strong', {}, `${formatLoad(x.weight, x.unit, x.perSide)} × ${x.reps}`));
      return c;
    };
    if (smart.primary) chips.append(chip(smart.primary, smart.primary.warmup ? 'Warm-up' : 'Suggested'));
    if (smart.alt) chips.append(chip(smart.alt, smart.alt.label));
    if (chips.children.length) box.append(chips);
    form.append(box);
  }

  /* ---------------- the rest of the set ----------------
     These were briefly hidden behind a "More options" toggle, on the assumption
     that most sets are weight and reps only. The WhatsApp log says otherwise:
     65.5% of recorded sets carry an annotation — form, support, struggle. So the
     toggle was an extra tap on the majority case, not the minority. Everything
     stays visible. */
  const halfInput  = el('input', { type: 'number', inputmode: 'numeric', value: draft.halfReps || '' });
  const commentBox = el('textarea', { placeholder: 'Form, struggle, spotter, banter…' });
  commentBox.value = draft.comment || '';

  // One tap per note instead of typing between sets. Built once and only
  // re-lit afterwards: rebuilding on every tap would snap the sideways-scrolled
  // row back to its start mid-use. A lit chip tapped again takes its note out.
  const chipBtns = QUICK_NOTES.map((q) => [q, el('button', {
    type: 'button', class: 'chip-q',
    onClick: () => { commentBox.value = toggleNote(commentBox.value, q); lightChips(); },
  }, q)]);
  const lightChips = () => { for (const [q, b] of chipBtns) b.classList.toggle('on', hasNote(commentBox.value, q)); };
  lightChips();
  commentBox.addEventListener('input', lightChips);
  const chipsRow = el('div', { class: 'chips', role: 'group', 'aria-label': 'Quick notes' }, ...chipBtns.map(([, b]) => b));

  const supportRow = el('div');
  const paintSupport = () => {
    clear(supportRow).append(segmented(
      Object.values(SUPPORT).map((x) => ({ key: x.key, label: x.label })),
      draft.support, (k) => { draft.support = k; paintSupport(); }));
  };
  paintSupport();

  const toggle = (labelText, key, hint, guard = null) => {
    const btn = el('button', { type: 'button', class: 'btn sm', onClick: async () => {
      const next = !draft[key];
      // Per side and each side are set on the exercise, and a wrong flip
      // silently halves or doubles the set. Leaving the exercise's setting asks
      // first; going back to it does not.
      if (guard && next !== guard.base &&
          !(await confirmSheet('Change from the exercise setting?',
            guard.say(next) + ' To change it for every set, edit the exercise instead.',
            'Change for this set', 'primary'))) return;
      draft[key] = next;
      btn.classList.toggle('primary', draft[key]);
    } }, labelText);
    btn.classList.toggle('primary', draft[key]);
    return el('div', { class: 'grow' }, btn, hint ? el('div', { class: 'tiny faint', style: 'margin-top:3px' }, hint) : null);
  };

  // --- drop sets: "#8 for 7 THEN #5 for 8" is one set, not two ---
  const dropsWrap = el('div');
  const paintDrops = () => {
    clear(dropsWrap);
    draft.drops.forEach((d, i) => {
      dropsWrap.append(el('div', { class: 'card', style: 'background:var(--panel-2);margin-bottom:10px' },
        el('div', { class: 'row spread', style: 'margin-bottom:8px' },
          el('span', { class: 'tiny faint' }, `Drop ${i + 1}`),
          el('button', { class: 'btn sm danger', 'aria-label': `Remove drop ${i + 1}`, onClick: () => { draft.drops.splice(i, 1); paintDrops(); } }, icon('x', { size: 16 }))
        ),
        el('div', { class: 'row' },
          el('div', { class: 'grow' }, field('Weight', stepper({
            value: d.weight, step: stepFor(d.unit), min: 0, decimals: 2,
            onChange: (val) => { d.weight = val; },
          }).node)),
          el('div', { class: 'grow' }, field('Unit',
            segmented(unitOpts, d.unit, (k) => { d.unit = k; paintDrops(); })))
        ),
        el('div', { class: 'row' },
          el('div', { class: 'grow' }, field('Reps', stepper({
            value: d.reps, step: 1, min: 0, decimals: 0,
            onChange: (val) => { d.reps = val; },
          }).node)),
          el('div', { class: 'grow' }, field('Half reps', el('input', {
            type: 'number', inputmode: 'numeric', value: d.halfReps || '',
            onInput: (e) => { d.halfReps = parseInt(e.target.value) || 0; } })))
        )
      ));
    });
    dropsWrap.append(el('button', { class: 'btn sm', onClick: () => {
      const last = draft.drops[draft.drops.length - 1];
      draft.drops.push({ weight: 0, unit: last ? last.unit : draft.unit, reps: 0, halfReps: 0 });
      paintDrops();
    } }, '+ Drop'));
  };
  paintDrops();

  if (!timed) form.append(field('Half reps', halfInput));

  form.append(
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      loaded ? toggle('kg/side', 'perSide', 'weight per side', {
        base: !!ex.perSideDefault,
        say: (on) => on
          ? `${ex.name} is set up for the total weight. Count it per side for this set?`
          : `${ex.name} is set up for weight per side ("15 kg each side"). Count the total for this set?`,
      }) : null,
      toggle('Each side', 'unilateral', timed ? 'held each side' : 'reps per side', {
        base: !!ex.unilateralDefault,
        say: (on) => on
          ? `${ex.name} is set up for ${timed ? 'one hold' : 'reps with both sides together'}. Count each side separately for this set?`
          : `${ex.name} is set up for ${timed ? 'a hold on each side' : 'reps on each side'} ("12 reps each side"). Count both sides together for this set?`,
      }),
      toggle('Warm-up', 'warmup', 'excluded from PRs')
    ),
    field('Support', supportRow),
    field('Comment', commentBox),
    chipsRow
  );
  if (!timed && loaded) form.append(el('h3', {}, 'Drop set'), dropsWrap);

  // Steppers, unit buttons and toggles change the draft without firing 'input',
  // so typing alone missed most of the form: a set arriving from the other
  // phone mid-tap would rebuild the screen and reset it.
  for (const ev of ['input', 'change', 'pointerdown', 'click']) {
    form.addEventListener(ev, () => { formDirty = true; });
  }
  v.append(form);

  // The numbers as they stand in the form — shared by adding and editing.
  const formValues = () => {
    const w = loaded ? weight.get() : 0;
    const e = effort.get();
    return {
      w, e,
      fields: {
        ...draft,
        weight: w,
        reps: timed ? 0 : e,
        seconds: timed ? e : 0,
        halfReps: timed ? 0 : (parseInt(halfInput.value) || 0),
        comment: commentBox.value.trim(),
        drops: (timed || !loaded) ? [] : draft.drops.filter((d) => d.reps > 0),
      },
    };
  };

  if (editing) {
    v.append(busyButton('Save changes', 'Saving…', 'btn gold block', async () => {
      const { e, fields } = formValues();
      if (e <= 0) return toast(timed ? 'Need a hold time' : 'Enter the reps you did');

      // editPatch keeps only the editable fields, so when the set was logged,
      // who logged it and on which phone all survive untouched.
      const patch = editPatch(fields, { by: state.owner || null, deviceId: currentDeviceId(), now: Date.now() });
      if (!changedFields(existing, patch).length) {
        toast('Nothing changed');
        formDirty = false;
        return back();
      }
      await S.saveSet(existing.id, patch);
      toast('Set updated');
      formDirty = false;
      back();
    }));
    // Red and explicit: this screen changes a record, so leaving it must not
    // read like a save.
    v.append(el('button', { class: 'btn danger block', style: 'margin-top:8px', onClick: back },
      'Cancel without saving'));
    return;
  }

  v.append(busyButton('Save set', 'Adding…', 'btn primary block', async () => {
    const { e, fields } = formValues();
    if (e <= 0) return toast(timed ? 'Need a hold time' : 'Enter the reps you did');

    // No confirm here: the target came from the URL and is named at the top of
    // this form, so there is no silent global selection left to get wrong.
    await S.addSet({
      ...fields,
      profileId: p.id,
      exerciseId: ex.id,
      date: today,
      // enteredBy is only as honest as the device-owner setting — sets typed on
      // one phone while it was configured as someone else record that someone
      // else. deviceId is the physical fact underneath, so the two can be
      // compared and a mislabelled batch spotted.
      enteredBy: state.owner || null,
      deviceId: currentDeviceId(),
      loggedAt: Date.now(),   // client clock: correct offline, and instant
    });
    tracker?.logged();
    toast(`Set logged for ${p.name}`);
    formDirty = false;
    back();
  }));

  // Red and explicit, like the edit screen: this only leaves, and a neutral
  // "Done" read as a save — sets were lost thinking it had kept them.
  v.append(el('button', { class: 'btn danger block', style: 'margin-top:8px', onClick: back },
    'Cancel without saving'));
}

/**
 * Edit an existing set. Looked up from what this phone already holds: the
 * shared 90-day window, plus the active profile's full history.
 */
function viewEditSet(v, setId) {
  const set = [...state.recent, ...state.sets].find((s) => s.id === setId);
  if (!set) {
    v.append(el('div', { class: 'empty' },
      'That set isn\'t loaded on this phone.', el('br'),
      el('span', { class: 'tiny' }, 'It may be older than 90 days, or was deleted.'), el('br'),
      el('button', { class: 'btn', style: 'margin-top:14px', onClick: () => go('log') }, 'Back to Log')));
    return;
  }
  if (!exerciseById(set.exerciseId)) {
    v.append(el('div', { class: 'empty' }, 'The exercise for this set was deleted, so it can\'t be edited.'));
    return;
  }
  viewLogSet(v, set.exerciseId, set.profileId, set);
}

/* ============================ history ============================ */

function viewHistory(v) {
  const p = activeProfile();
  if (!p) return v.append(el('div', { class: 'empty' }, 'Pick a person first.'));

  const byDate = new Map();
  for (const s of state.sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  v.append(el('h2', {}, `${p.name} · History`));
  if (streakOn()) v.append(streakCard(p));
  if (!dates.length) return v.append(el('div', { class: 'empty' }, 'Nothing logged yet.'));

  for (const date of dates) {
    const sets = byDate.get(date);
    const working = sets.filter((s) => !s.warmup);

    // Tonnage only counts sets we can actually compare — block machines are excluded
    // rather than silently treated as kilograms.
    let kg = 0, comparable = 0;
    for (const s of working) {
      const v = setVolumeKg(s);
      if (v !== null) { kg += v; comparable++; }
    }

    // First and last logged times bound the session. Sorted because a set can
    // arrive out of order when two phones sync after being offline.
    const stamps = sets.map(setTime).filter(Boolean).sort((a, b) => a - b);
    const first = stamps[0] || null;
    const last  = stamps[stamps.length - 1] || null;

    const card = el('div', { class: 'card', id: 'day-' + date });
    card.append(el('div', { class: 'row spread' },
      el('strong', {}, dayLabel(date) + (first ? ` at ${fmtTime(first)}` : '')),
      el('span', { class: 'tiny faint' }, `${working.length} sets`)
    ));

    if (first && last && last > first) {
      card.append(el('div', { class: 'tiny muted', style: 'margin-top:2px' },
        `${fmtTime(first)} → ${fmtTime(last)}`,
        el('span', { class: 'faint' }, `  ·  ${fmtSpan(last - first)}`)));
    }

    if (comparable) {
      card.append(el('div', { class: 'tiny muted', style: 'margin-top:2px' },
        `${Math.round(kg).toLocaleString('en-US')} kg total volume` +
        (comparable < working.length ? ` · ${working.length - comparable} block-based sets excluded` : '')));
    }

    const names = groupIntoExercises(sets).map((g) => exerciseById(g.exerciseId)?.name || '?');
    card.append(el('div', { class: 'tiny faint', style: 'margin-top:6px' }, names.join(' · ')));

    const detail = el('div', { style: 'display:none' });
    for (const grp of groupIntoExercises(sets)) {
      detail.append(el('div', { style: 'margin-top:10px' },
        el('div', { class: 'tiny muted' }, exerciseById(grp.exerciseId)?.name || '(deleted)')));
      appendSets(detail, grp.sets, (s, n) => setLine(s, n, { ownerName: p.name, showTime: true, onEdit: () => go('edit/' + s.id) }));
    }
    card.append(el('button', { class: 'btn sm', style: 'margin-top:8px', onClick: (e) => {
      const open = detail.style.display !== 'none';
      detail.style.display = open ? 'none' : 'block';
      e.target.textContent = open ? 'Show sets' : 'Hide sets';
    } }, 'Show sets'), detail);

    v.append(card);
  }
}

/**
 * Settings → Pro features → Streak calendar. A GitHub-style grid per person:
 * columns are weeks, rows Monday to Sunday, deeper colour on bigger days. The
 * person whose History this is comes first, and their days open in the list
 * below; the partner's are for comparison.
 */
function streakCard(p) {
  const all = heldSets();
  const today = S.todayKey();
  const target = weeklyTarget();
  const people = [p, ...(chartPeople() || []).filter((o) => o && o.id !== p.id)].slice(0, 2);
  const card = el('div', { class: 'card streak-card' });
  const weeksTxt = (n) => `${n.toLocaleString('en-US')} week${n === 1 ? '' : 's'}`;
  const MON = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });

  people.forEach((who, i) => {
    const days = gymDays(all, who.id);
    const weeks = grid(days, { today });
    const st = streaks(days, { today, target });
    const series = i === 0 ? 'me' : 'them';

    // a label where a month starts; the first column only if its month runs on,
    // or its label would run into the next one ("Jul Aug")
    const months = el('div', { class: 'streak-months' }, ...weeks.map((w, k) => {
      const show = k === 0 ? weeks[1] && MON(weeks[1].start) === MON(w.start) : MON(w.start) !== MON(weeks[k - 1].start);
      return el('span', {}, show ? MON(w.start) : '');
    }));
    const cells = el('div', { class: 'streak-grid' }, ...weeks.flatMap((w) => w.days.map((d) => {
      const own = i === 0 && d.count;
      const label = `${who.name}, ${dayLabel(d.date)}: ${d.count ? `${d.count.toLocaleString('en-US')} sets` : 'no sets'}`;
      return el(own ? 'button' : 'span', {
        class: `streak-cell s-${series} l${d.level}` + (d.future ? ' future' : '') + (d.date === today ? ' today' : ''),
        title: label, 'aria-label': own ? label : null, type: own ? 'button' : null,
        onClick: own ? () => openDay(d.date) : null,
      });
    })));

    card.append(el('div', { class: 'streak-person' },
      el('div', { class: 'streak-who' },
        el('span', { class: `swatch dot s-${series}` }), el('strong', {}, who.name)),
      el('div', { class: 'streak-body' },
        el('div', { class: 'streak-days' }, ...['M', '', 'W', '', 'F', '', ''].map((t) => el('span', {}, t))),
        el('div', {}, months, cells)),
      el('div', { class: 'tiny muted streak-stats' },
        `This week: ${st.thisWeek} of ${target} days · Streak: ${weeksTxt(st.current)} · Best: ${weeksTxt(st.best)}`)));
  });
  card.append(el('div', { class: 'tiny faint', style: 'margin-top:8px' },
    `A week counts toward a streak with ${target} or more gym days. Change it in Settings.`));
  return card;
}

/** From the streak grid: bring that day's card into view and open it. */
function openDay(date) {
  const card = document.getElementById('day-' + date);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const btn = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Show sets');
  if (btn) btn.click();
  card.classList.remove('day-pulse'); void card.offsetWidth; card.classList.add('day-pulse');
}

/* ============================ exercise pool ============================ */

function viewExercisePool(v) {
  const input = el('input', { placeholder: 'Filter…', autocomplete: 'off' });
  const list = el('div', { class: 'manage-list' });

  const paint = () => {
    clear(list);
    const hits = searchExercises(state.exercises, input.value, { frequency: recentUse(), pinned: usualPick(input.value) });
    if (!hits.length) {
      list.append(el('div', { class: 'empty tiny' }, 'No match.'));
      return;
    }
    for (const ex of hits) {
      // Two sibling buttons, not one row-button: a chart button nested inside a button is
      // invalid HTML, and its tap would fall through to Edit.
      list.append(el('div', { class: 'manage-row' },
        el('button', { class: 'manage-main', onClick: () => go('exercises/' + ex.id) },
          el('div', { class: 'grow' },
            el('div', { class: 'name' }, ex.name),
            el('div', { class: 'meta' },
              (ex.muscles || []).join(' · ') +
              '   ·   ' + (ex.allowedUnits || []).map((u) => UNITS[u]?.label).join('/'))
          ),
          el('span', { class: 'edit-tag' }, 'Edit')
        ),
        el('button', {
          class: 'manage-chart', title: 'Progress', 'aria-label': `Progress for ${ex.name}`,
          onClick: () => go('progress/' + ex.id),
        }, icon('chart-line', { size: 20 }))
      ));
    }
  };
  input.addEventListener('input', paint);

  v.append(el('div', { class: 'row spread', style: 'margin-bottom:10px' },
    el('h2', { style: 'margin:0' }, 'Exercises'),
    el('span', { class: 'tiny faint' }, `${state.exercises.length} defined`)
  ));

  // The rows below look like the logging picker did, so say plainly what they do.
  v.append(el('div', { class: 'notice' },
    'This is the library — tapping an exercise edits its definition. ',
    el('strong', {}, 'To log a set, use the Log tab.')));

  v.append(
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('div', { class: 'grow' }, input),
      el('button', {
        class: 'btn', style: 'min-width:var(--tap);padding:0;font-size:1.3rem;line-height:1',
        title: 'New exercise', 'aria-label': 'New exercise',
        onClick: () => go('exercises/new'),
      }, '+')
    ),
    list
  );
  paint();
}

function viewExerciseEditor(v, id) {
  const isNew = id === 'new';
  const src = isNew ? S.blankExercise() : exerciseById(id);
  if (!src) return go('exercises');
  const ex = JSON.parse(JSON.stringify({ ...S.blankExercise(), ...src }));
  delete ex.id;

  v.append(el('h2', {}, isNew ? 'New exercise' : 'Edit exercise'));

  const nameInput = el('input', { value: ex.name, placeholder: 'e.g. Overhead tricep extension (rope)' });
  v.append(field('Name', nameInput));

  // --- ordered muscles: position 1 is the dominant one and drives search rank ---
  const musclesWrap = el('div');
  const paintMuscles = () => {
    clear(musclesWrap);
    ex.muscles.forEach((m, i) => {
      musclesWrap.append(el('div', { class: 'row', style: 'margin-bottom:6px' },
        el('span', { class: 'pill' + (i === 0 ? ' primary-muscle' : ''), style: 'min-width:30px;text-align:center' }, `${i + 1}`),
        el('span', { class: 'grow' }, m),
        el('button', { class: 'btn sm', disabled: i === 0, onClick: () => {
          [ex.muscles[i - 1], ex.muscles[i]] = [ex.muscles[i], ex.muscles[i - 1]]; paintMuscles();
        } }, '↑'),
        el('button', { class: 'btn sm', disabled: i === ex.muscles.length - 1, onClick: () => {
          [ex.muscles[i + 1], ex.muscles[i]] = [ex.muscles[i], ex.muscles[i + 1]]; paintMuscles();
        } }, '↓'),
        el('button', { class: 'btn sm danger', 'aria-label': `Remove ${m}`, onClick: () => { ex.muscles.splice(i, 1); paintMuscles(); } }, icon('x', { size: 16 }))
      ));
    });

    const picker = el('select', {},
      el('option', { value: '' }, '+ add muscle…'),
      ...MUSCLES.filter((m) => !ex.muscles.includes(m)).map((m) => el('option', { value: m }, m))
    );
    picker.addEventListener('change', () => {
      if (picker.value) { ex.muscles.push(picker.value); paintMuscles(); }
    });
    musclesWrap.append(picker);
  };
  paintMuscles();
  v.append(el('h3', {}, 'Muscles — first is dominant'), musclesWrap);

  // --- how it is counted ---
  // Above units deliberately: whether an exercise is timed decides whether a
  // weight is even relevant, so it is the first question.
  const metricWrap = el('div');
  const paintMetric = () => {
    clear(metricWrap).append(
      segmented(Object.values(METRICS).map((m) => ({ key: m.key, label: m.label })),
        ex.metric === 'time' ? 'time' : 'reps',
        (k) => { ex.metric = k; paintMetric(); paintUnits(); }),
      el('div', { class: 'tiny faint', style: 'margin-top:5px' },
        ex.metric === 'time'
          ? 'Counted in seconds — planks, dead hangs, any held position.'
          : 'Counted in repetitions.')
    );
  };

  const bwWrap = el('div');
  const paintBw = () => {
    const btn = el('button', { class: 'btn' + (ex.bodyweight ? ' primary' : ''), onClick: () => {
      ex.bodyweight = !ex.bodyweight; paintBw(); paintUnits();
    } }, ex.bodyweight ? 'Bodyweight' : 'Uses weight');
    clear(bwWrap).append(btn, el('div', { class: 'tiny faint', style: 'margin-top:5px' },
      ex.bodyweight ? 'No weight field on the set form.' : 'A weight is recorded for every set.'));
  };

  // --- units ---
  const unitsWrap = el('div');
  const paintUnits = () => {
    clear(unitsWrap);
    if (ex.bodyweight) {
      unitsWrap.append(el('div', { class: 'tiny faint' }, 'Not used — this exercise records no weight.'));
      return;
    }
    const row = el('div', { class: 'row wrap' });
    for (const u of Object.values(UNITS)) {
      const on = ex.allowedUnits.includes(u.key);
      row.append(el('button', { class: 'btn sm' + (on ? ' primary' : ''), onClick: () => {
        if (on) {
          if (ex.allowedUnits.length === 1) return toast('Need at least one unit');
          ex.allowedUnits = ex.allowedUnits.filter((k) => k !== u.key);
        } else ex.allowedUnits.push(u.key);
        if (!ex.allowedUnits.includes(ex.defaultUnit)) ex.defaultUnit = ex.allowedUnits[0];
        paintUnits();
      } }, u.name));
    }
    unitsWrap.append(row);
    unitsWrap.append(el('div', { class: 'tiny faint', style: 'margin:8px 0 4px' }, 'Default'));
    unitsWrap.append(segmented(
      ex.allowedUnits.map((k) => ({ key: k, label: UNITS[k].label })),
      ex.defaultUnit, (k) => { ex.defaultUnit = k; paintUnits(); }));
  };
  paintUnits();
  paintMetric();
  paintBw();

  v.append(el('h3', {}, 'How is it counted?'), metricWrap);
  v.append(el('h3', {}, 'Load'), bwWrap);
  // Units are irrelevant to a bodyweight exercise, so the section disappears
  // rather than sitting there inert.
  const unitsSection = el('div', {}, el('h3', {}, 'Units of measure'), unitsWrap);
  v.append(unitsSection);

  const mkToggle = (labelText, key, hint) => {
    const btn = el('button', { class: 'btn' + (ex[key] ? ' primary' : ''), onClick: () => {
      ex[key] = !ex[key]; btn.classList.toggle('primary', ex[key]);
    } }, labelText);
    return el('div', { style: 'margin-bottom:8px' }, btn, el('div', { class: 'tiny faint', style: 'margin-top:3px' }, hint));
  };
  v.append(el('h3', {}, 'Defaults'));
  if (!ex.bodyweight) {
    v.append(mkToggle('Weight is per side', 'perSideDefault', 'Z-bar, bench, leg press — "15 kg each side"'));
  }
  v.append(mkToggle(
    ex.metric === 'time' ? 'Held each side' : 'Reps are per side',
    'unilateralDefault',
    ex.metric === 'time' ? 'Side plank — timed per side' : 'Single-arm work — "12 reps each side"'));

  const aliasInput = el('input', { value: (ex.aliases || []).join(', '), placeholder: 'db press, incline db' });
  v.append(el('h3', {}, 'Search aliases'), aliasInput,
    el('div', { class: 'tiny faint', style: 'margin-top:4px' }, 'Comma separated. Old spellings from the chat log go here.'));

  v.append(el('div', { style: 'height:18px' }));
  v.append(busyButton(isNew ? 'Create' : 'Save', 'Saving…', 'btn primary block', async () => {
    ex.name = nameInput.value.trim();
    if (!ex.name) return toast('Name required');
    ex.aliases = aliasInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (isNew) { const newId = await S.addExercise(ex); toast('Created'); go('ex/' + newId); }
    else { await S.saveExercise(id, ex); toast('Saved'); history.back(); }
  }));

  if (!isNew) {
    v.append(el('button', { class: 'btn danger block', style: 'margin-top:8px', onClick: async () => {
      const used = state.sets.filter((s) => s.exerciseId === id).length;
      const ok = await confirmSheet('Delete exercise?',
        used ? `${used} logged sets reference it and will show as "(deleted exercise)".` : 'Not used in any set yet.');
      if (!ok) return;
      await S.deleteExercise(id); toast('Deleted'); go('exercises');
    } }, 'Delete exercise'));
  }

  v.append(el('button', { class: 'btn block', style: 'margin-top:8px', onClick: () => history.back() }, 'Cancel'));
}

/* ============================ unlock gate ============================ */

/**
 * Shown when no API key is stored on this device. The key lives only in this
 * browser's localStorage — it is not in the repo, so the public source alone
 * gets an attacker nothing.
 */
function showUnlock(message) {
  hideSplash();
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';

  const input = el('input', {
    type: 'password', placeholder: 'Paste the key', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });

  const err = el('div', { class: 'tiny', style: 'color:var(--bad);min-height:18px;margin-top:8px' }, message || '');

  const unlock = async () => {
    const raw = input.value.trim();
    if (!raw) return;
    const { apiKey, owner } = parseAccessKey(raw);
    if (!apiKey) return;
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      initFirebase(apiKey);
      await ready();
      saveKey(apiKey);
      if (owner) saveDeviceOwner(owner);
      location.reload();
    } catch (e) {
      clearKey();
      btn.disabled = false;
      btn.textContent = 'Unlock';
      err.textContent = isKeyError(e)
        ? 'That key was rejected. Check for a missing character.'
        : 'Could not reach Firebase — check your connection.';
    }
  };

  const btn = el('button', { class: 'btn primary block', onClick: unlock }, 'Unlock');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });

  clear(viewEl()).append(el('div', { style: 'max-width:380px;margin:12vh auto 0;text-align:center' },
    el('div', { class: 'hero-icon' }, icon('dumbbell', { size: 44 })),
    el('h2', { style: 'margin:14px 0 6px' }, 'BroSplit'),
    el('p', { class: 'muted tiny', style: 'margin:0 0 20px' },
      'This device needs the access key once. Paste it and it stays in this browser.'),
    el('p', { class: 'tiny faint', style: 'margin:-12px 0 16px' },
      `Add ${KEY_DELIMITER}YourName to the end so the app knows whose phone this is.`),
    input, err,
    el('div', { style: 'height:12px' }),
    btn
  ));
  setTimeout(() => input.focus(), 50);
}

/* ============================ boot ============================ */

async function boot() {
  paintSplashVersion();
  paintSync();

  const key = getStoredKey();
  if (!key) return showUnlock();

  splashStage('connecting…');
  initFirebase(key);
  try {
    await ready();
  } catch (e) {
    if (isKeyError(e)) { clearKey(); return showUnlock('Stored key is no longer valid.'); }
    throw e;
  }

  splashStage('loading exercises…');
  await S.ensureSeedProfiles(SEED_PROFILES);
  const n = await S.seedExercises(SEED_EXERCISES);
  if (n) toast(`Seeded ${n} exercises`);

  splashStage('almost there…');

  S.watchProfiles((rows) => {
    state.profiles = rows;
    state.loaded.profiles = true;

    // state.sets holds the full history of the ACTIVE profile only, and
    // lastTime() reads it. So "me" must be the active profile by default, or
    // my own history is invisible on my own side of the exercise view.
    const mine = rows.find((r) => r.name === state.owner);
    const stored = rows.some((r) => r.id === state.profileId);
    if (mine && !stored) setProfile(mine.id);
    else if (!stored && rows.length) setProfile(rows[0].id);
    else renderFromData();
  });

  S.watchExercises((rows) => {
    state.exercises = rows;
    state.loaded.exercises = true;
    renderFromData();
  });

  if (state.profileId) setProfile(state.profileId);
}

boot().catch((err) => {
  console.error(err);
  hideSplash();
  clear(viewEl()).append(el('div', { class: 'empty' },
    'Could not connect to Firebase.', el('br'),
    el('span', { class: 'tiny' }, err.message)));
});
