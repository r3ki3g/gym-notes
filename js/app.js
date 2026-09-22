import { ready, initFirebase, getStoredKey, saveKey, clearKey, isKeyError,
         parseAccessKey, getDeviceOwner, saveDeviceOwner, KEY_DELIMITER } from './firebase.js';
import * as S from './store.js';
import { SEED_EXERCISES, SEED_PROFILES } from './seed.js';
import { searchExercises, MUSCLES } from './search.js';
import { layoutSides, resolveTarget, lastSessionFor } from './sides.js';
import { UNITS, formatLoad, formatSetLoad, formatReps, formatEffort, formatDuration, setVolumeKg,
         SUPPORT, METRICS, TIME_STEP, stepFor, snapTo } from './units.js';
import { el, clear, toast, confirmSheet, promptSheet, segmented, field, dayLabel, timeAgo, stampMs, busyButton, stepper, fmtTime, fmtSpan } from './ui.js';
import { VERSION } from './version.js';
import { parseBrowser, createTracker, sessionId, FLUSH_MS } from './usage.js';
import { chime, soundOn, setSound, notifOn, setNotif, primeAudio,
         vibrateOn, setVibrate, vibrateSupported, buzzTest } from './notify.js';

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

window.addEventListener('hashchange', () => {
  formDirty = false;
  tracker?.screen(route()[0] || 'log');
  render();
});

// "5s ago" has to keep counting. Only ticks while the Alerts tab is open, so it
// costs nothing the rest of the time.
setInterval(() => { if (route()[0] === 'alerts') render(); }, 15000);

/**
 * Re-render triggered by a Firestore snapshot rather than by navigation.
 * Skipped while the set form holds unsaved input; the next explicit render
 * (save, or leaving the screen) picks the new data up.
 */
function renderFromData() {
  if (route()[0] === 'set' && formDirty) return;
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
    b.classList.toggle('active', b.dataset.route === tab);
    b.onclick = () => go(b.dataset.route);

    if (b.dataset.route === 'alerts') {
      b.querySelector('.tab-dot')?.remove();
      // Presence, not a count — the number read as clutter on a 5-tab bar.
      if (unreadAlerts().length) b.append(el('span', { class: 'tab-dot' }));
    }
  }
}

function paintSync(online) {
  const s = document.getElementById('sync');
  s.className = 'sync ' + (online ? 'on' : 'off');
  const label = online ? 'Synced' : 'Offline';
  s.querySelector('.sync-label').textContent = label;
  s.title = label;   // the text is hidden on narrow screens; the dot needs a name
}
window.addEventListener('online',  () => paintSync(true));
window.addEventListener('offline', () => paintSync(false));

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
}

// Bad signal in the gym means a first-ever load can hang on auth. Never leave
// someone staring at an animation with no explanation.
const splashFailsafe = setTimeout(() => {
  if (splashDone) return;
  splashStage('still trying — check your connection', true);
}, 12000);

/* ============================ render ============================ */

function render() {
  paintTopbar();
  formDirty = false;
  if (state.loaded.profiles && state.owner) { startRecentWatch(); primeAudio(); startUsage(); }
  const v = clear(viewEl());
  const [tab, arg, arg2] = route();

  if (!state.loaded.profiles || !state.loaded.exercises) {
    return v.append(el('div', { class: 'empty' }, 'Loading…'));
  }
  hideSplash();   // real content is on screen now

  // Device identity is required before anything can be logged, so a set is
  // never written without knowing who typed it.
  if (!state.owner) return viewWhoAmI(v);

  switch (tab) {
    case 'alerts':    return viewAlerts(v);
    case 'settings':
    case 'profiles':  return viewSettings(v);
    case 'search':    return viewSearch(v);
    case 'set':       return viewLogSet(v, arg, arg2);
    case 'history':   return viewHistory(v);
    case 'ex':        return viewExercise(v, arg);
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
function startRecentWatch() {
  const since = S.daysAgoKey(HISTORY_DAYS);
  if (recentSince === since) return;
  recentSince = since;
  unsubRecent();

  unsubRecent = S.watchRecent(since, ({ all, added }) => {
    state.recent = all;

    // Your own sets are not news, and pre-identity sets can't be attributed.
    const today = S.todayKey();
    const theirs = added.filter((x) =>
      x.date === today && x.enteredBy && x.enteredBy !== state.owner);
    if (!theirs.length) return renderFromData();

    if (notifOn()) {
      const who = [...new Set(theirs.map((x) => x.enteredBy))];
      let msg;
      if (theirs.length === 1) {
        const ex = exerciseById(theirs[0].exerciseId);
        msg = `💪 ${who[0]} logged ${ex ? ex.name : 'a set'}`;
      } else if (who.length === 1) {
        msg = `💪 ${who[0]} logged ${theirs.length} sets`;
      } else {
        msg = `💪 ${theirs.length} new sets logged`;
      }
      toast(msg);
      chime();        // self-limiting: at most one tone per 15s
    }
    renderFromData();
  });
}

/* ============================ usage tracking ============================ */

let tracker = null;
let usageId = null;
let usageBrowser = '';
let usageStartedAt = 0;
let usageTimer = null;

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

function startUsage() {
  if (tracker) return;

  // Brave reports a Chrome user-agent with no token of its own; the only signal
  // is navigator.brave, and it is async, so the label is corrected on arrival.
  usageBrowser = parseBrowser(navigator.userAgent);
  navigator.brave?.isBrave?.().then((yes) => {
    if (yes) usageBrowser = parseBrowser(navigator.userAgent, { brave: true });
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
      el('div', { class: 'feed-icon' }, '💪'),
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
    el('div', { style: 'font-size:2.4rem' }, '👋'),
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

/* ============================ settings ============================ */

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
        } }, '✕')
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
  const sorted = [...sets].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  for (const s of sorted) {
    if (!byEx.has(s.exerciseId)) { byEx.set(s.exerciseId, []); order.push(s.exerciseId); }
    byEx.get(s.exerciseId).push(s);
  }
  return order.map((id) => ({ exerciseId: id, sets: byEx.get(id) }));
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
      byOther ? el('span', { class: 'pill by' }, 'entered by ' + s.enteredBy) : null
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

  return el('div', { class: 'set-line' + fresh.cls, style: fresh.style || null },
    el('span', { class: 'set-no' }, s.warmup ? 'W' : `${index}.`),
    main,
    opts.onDelete ? el('button', { class: 'btn sm danger', onClick: opts.onDelete }, '✕') : null
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

    let n = 0;
    for (const s of grp.sets) {
      if (!s.warmup) n++;
      card.append(setLine(s, n, {
        ownerName: p.name,
        onDelete: async () => {
          if (await confirmSheet('Delete this set?', formatSetLoad(s) + ' for ' + formatEffort(s))) {
            await S.deleteSet(s.id); toast('Set deleted');
          }
        }
      }));
    }
    v.append(card);
  }
}

/* ============================ exercise search ============================ */

function viewSearch(v) {
  const input = el('input', { placeholder: 'Search — try "tricep" or "incline db"', autocomplete: 'off' });
  const results = el('div');

  const paint = () => {
    clear(results);
    const hits = searchExercises(state.exercises, input.value);
    if (!hits.length) {
      results.append(el('div', { class: 'empty' }, 'No match.'));
    }
    for (const ex of hits.slice(0, 40)) {
      results.append(el('button', { class: 'result', onClick: () => go('ex/' + ex.id) },
        el('div', { class: 'grow' },
          el('div', { class: 'name' }, ex.name),
          el('div', { class: 'row wrap', style: 'gap:4px;margin-top:4px' },
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
  .sort((a, b) => (a.loggedAt || stampMs(a.createdAt) || 0) - (b.loggedAt || stampMs(b.createdAt) || 0));

/**
 * One person's column. `header` replaces the plain name when this side is
 * selectable, so the picker sits ON the column it controls — floating it above
 * both columns made it read as a global switch, which is what confused things.
 */
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
    let n = 0;
    for (const x of sets) {
      if (!x.warmup) n++;
      const fresh = freshAttrs(x);
      col.append(el('div', { class: 'side-set' + fresh.cls, style: fresh.style || null },
        el('span', { class: 'n' }, x.warmup ? 'W' : String(n)),
        el('span', { class: 'load' }, formatSetLoad(x)),
        el('span', { class: 'muted' }, '\u00d7' + (x.metric === 'time'
          ? formatDuration(x.seconds)
          : x.reps + (x.halfReps ? `+${x.halfReps}h` : ''))),
        (x.drops || []).length ? el('span', { class: 'tiny drop' }, '\u2193') : null
      ));
    }
  }

  col.append(el('button', { class: 'side-add', onClick: () => go(`set/${exerciseId}/${profile.id}`) },
    '+ add set'));

  // Inside the column rather than one shared block underneath: both people are
  // logged from this one phone, so both sides need their own previous numbers.
  const lt = lastSessionFor(state.recent, { exerciseId, profileId: profile.id, excludeDate: date });
  if (lt) {
    const box = el('div', { class: 'side-last' },
      el('div', { class: 'side-last-when' }, 'last · ' + dayLabel(lt.date)));
    for (const x of lt.sets) {
      box.append(el('div', { class: 'side-last-set' },
        el('span', { class: 'load' }, formatSetLoad(x)),
        el('span', { class: 'muted' }, '×' + (x.metric === 'time'
          ? formatDuration(x.seconds)
          : x.reps + (x.halfReps ? `+${x.halfReps}h` : '')))
      ));
    }
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

  v.append(el('button', { class: 'btn block', style: 'margin-top:14px', onClick: () => go('search') },
    'Another exercise'));
  v.append(el('button', { class: 'btn block', style: 'margin-top:8px', onClick: () => go('log') }, 'Done'));
}

/* ============================ log a set ============================ */

/** Thin wrapper over the tested pure lookup. */
const lastTime = (exerciseId, excludeDate, profileId) =>
  lastSessionFor(state.recent, { exerciseId, profileId, excludeDate });

function viewLogSet(v, exerciseId, profileId) {
  const ex = exerciseById(exerciseId);
  // The target is explicit in the URL now, not read from a global selector.
  // That is what makes dropping the confirm in the two-sided view safe.
  const p = resolveTarget(state.profiles, profileId, state.profileId);
  if (!ex || !p) return go('log');

  const today = S.todayKey();
  const draft = S.blankSet(ex);
  const onBehalf = !!(state.owner && p.name !== state.owner);
  const back = () => go('ex/' + exerciseId);

  // Carry the last set's load forward — you almost always repeat or nudge it.
  const todays = setsFor(p.id, exerciseId, today);
  const prev = todays[todays.length - 1] || lastTime(exerciseId, today, p.id)?.sets?.slice(-1)[0];
  if (prev) {
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
  if (todays.length) {
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'tiny faint', style: 'margin-bottom:4px' }, 'Today so far'));
    let n = 0;
    todays.forEach((s) => { if (!s.warmup) n++; card.append(setLine(s, n, {
      ownerName: p.name,
      onDelete: async () => { if (await confirmSheet('Delete this set?')) { await S.deleteSet(s.id); toast('Deleted'); } }
    })); });
    v.append(card);
  }

  /* ---------------- the form ---------------- */
  const form = el('div', { class: 'card' });

  // Always name the target, in every flow. A label that appears only sometimes
  // is a label nobody reads — and this is now the only thing carrying it.
  form.append(el('div', { class: 'forwho' + (onBehalf ? ' other' : '') },
    el('span', { class: 'tiny' }, 'Adding a set for'),
    el('strong', {}, p.name),
    onBehalf ? el('span', { class: 'tiny' }, `· not ${state.owner}`) : null
  ));

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
    : stepper({ value: draft.reps, step: 1, min: 0, decimals: 0,
                onChange: (val) => { draft.reps = val; } });

  // Live readout, so 90 reads as 1:30 without waiting for the set to save.
  const clock = timed ? el('div', { class: 'clock' }, formatDuration(draft.seconds)) : null;
  if (timed) effort.node.addEventListener('input', () => { clock.textContent = formatDuration(effort.get()); });

  // Changing unit retunes the step and snaps the current value onto its grid,
  // so switching kg -> lb cannot leave you on 17.5 lb.
  const unitOpts = (ex.allowedUnits || ['block']).map((u) => ({ key: u, label: UNITS[u].label }));
  const unitRow = el('div');
  const paintUnits = () => {
    clear(unitRow).append(segmented(unitOpts, draft.unit, (k) => {
      draft.unit = k;
      weight.setStep(stepFor(k));
      const snapped = snapTo(weight.get(), k);
      weight.set(snapped);
      draft.weight = snapped;
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

  /* ---------------- the rest of the set ----------------
     These were briefly hidden behind a "More options" toggle, on the assumption
     that most sets are weight and reps only. The WhatsApp log says otherwise:
     65.5% of recorded sets carry an annotation — form, support, struggle. So the
     toggle was an extra tap on the majority case, not the minority. Everything
     stays visible. */
  const halfInput  = el('input', { type: 'number', inputmode: 'numeric', value: draft.halfReps || '' });
  const commentBox = el('textarea', { placeholder: 'Form, struggle, spotter, banter…' });

  const supportRow = el('div');
  const paintSupport = () => {
    clear(supportRow).append(segmented(
      Object.values(SUPPORT).map((x) => ({ key: x.key, label: x.label })),
      draft.support, (k) => { draft.support = k; paintSupport(); }));
  };
  paintSupport();

  const toggle = (labelText, key, hint) => {
    const btn = el('button', { type: 'button', class: 'btn sm', onClick: () => {
      draft[key] = !draft[key];
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
          el('button', { class: 'btn sm danger', onClick: () => { draft.drops.splice(i, 1); paintDrops(); } }, '✕')
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
      loaded ? toggle('kg/side', 'perSide', 'weight per side') : null,
      toggle('Each side', 'unilateral', timed ? 'held each side' : 'reps per side'),
      toggle('Warm-up', 'warmup', 'excluded from PRs')
    ),
    field('Support', supportRow),
    field('Comment', commentBox)
  );
  if (!timed && loaded) form.append(el('h3', {}, 'Drop set'), dropsWrap);

  form.addEventListener('input',  () => { formDirty = true; });
  form.addEventListener('change', () => { formDirty = true; });
  v.append(form);

  v.append(busyButton('Save set', 'Adding…', 'btn primary block', async () => {
    const w = loaded ? weight.get() : 0;
    const e = effort.get();
    if (e <= 0) return toast(timed ? 'Need a hold time' : 'Need at least one rep');

    // No confirm here: the target came from the URL and is named at the top of
    // this form, so there is no silent global selection left to get wrong.
    await S.addSet({
      ...draft,
      profileId: p.id,
      exerciseId: ex.id,
      date: today,
      weight: w,
      reps: timed ? 0 : e,
      seconds: timed ? e : 0,
      halfReps: timed ? 0 : (parseInt(halfInput.value) || 0),
      comment: commentBox.value.trim(),
      enteredBy: state.owner || null,
      loggedAt: Date.now(),   // client clock: correct offline, and instant
      drops: (timed || !loaded) ? [] : draft.drops.filter((d) => d.reps > 0),
    });
    tracker?.logged();
    toast(`Set logged for ${p.name}`);
    formDirty = false;
    back();
  }));

  v.append(el('button', { class: 'btn block', style: 'margin-top:8px', onClick: back }, 'Done'));
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

    const card = el('div', { class: 'card' });
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
      let n = 0;
      grp.sets.forEach((s) => { if (!s.warmup) n++; detail.append(setLine(s, n, { ownerName: p.name, showTime: true })); });
    }
    card.append(el('button', { class: 'btn sm', style: 'margin-top:8px', onClick: (e) => {
      const open = detail.style.display !== 'none';
      detail.style.display = open ? 'none' : 'block';
      e.target.textContent = open ? 'Show sets' : 'Hide sets';
    } }, 'Show sets'), detail);

    v.append(card);
  }
}

/* ============================ exercise pool ============================ */

function viewExercisePool(v) {
  const input = el('input', { placeholder: 'Filter…', autocomplete: 'off' });
  const list = el('div', { class: 'manage-list' });

  const paint = () => {
    clear(list);
    const hits = searchExercises(state.exercises, input.value);
    if (!hits.length) {
      list.append(el('div', { class: 'empty tiny' }, 'No match.'));
      return;
    }
    for (const ex of hits) {
      list.append(el('button', { class: 'manage-row', onClick: () => go('exercises/' + ex.id) },
        el('div', { class: 'grow' },
          el('div', { class: 'name' }, ex.name),
          el('div', { class: 'meta' },
            (ex.muscles || []).join(' · ') +
            '   ·   ' + (ex.allowedUnits || []).map((u) => UNITS[u]?.label).join('/'))
        ),
        el('span', { class: 'edit-tag' }, 'Edit')
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
        el('button', { class: 'btn sm danger', onClick: () => { ex.muscles.splice(i, 1); paintMuscles(); } }, '✕')
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
    el('div', { style: 'font-size:2.6rem' }, '🏋️'),
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
  paintSync(navigator.onLine);

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
