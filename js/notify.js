// Nudge when the other person logs something.
//
// No polling: store.js watches Firestore over a live socket, so this only has to
// decide whether a given arrival is worth a sound.

const SOUND_PREF   = 'gn.sound';
const NOTIF_PREF   = 'gn.notif';
const VIBE_PREF    = 'gn.vibrate';
const SOUND_FILE   = 'sounds/notify.mp3'; // optional — synthesised if absent
const MIN_GAP_MS   = 15000;               // never more than one chime per 15s

let lastPlayed = 0;
let audioCtx = null;
let fileOk = null;   // null = untried, true = plays, false = fall back to synth
let toneEl = null;   // one preloaded element, reused

export const soundOn  = () => { try { return localStorage.getItem(SOUND_PREF) !== '0'; } catch { return true; } };
export const setSound = (on) => { try { localStorage.setItem(SOUND_PREF, on ? '1' : '0'); } catch {} };

// Independent of sound: notifications off silences the toast AND the tone,
// while mute keeps the toast and drops only the tone. The Alerts feed always
// fills either way — it is history, not an interruption.
export const notifOn  = () => { try { return localStorage.getItem(NOTIF_PREF) !== '0'; } catch { return true; } };
export const setNotif = (on) => { try { localStorage.setItem(NOTIF_PREF, on ? '1' : '0'); } catch {} };

/** iOS Safari has never shipped the Vibration API, so this is false on iPhone. */
export const vibrateSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const vibrateOn  = () => { try { return localStorage.getItem(VIBE_PREF) !== '0'; } catch { return true; } };
export const setVibrate = (on) => { try { localStorage.setItem(VIBE_PREF, on ? '1' : '0'); } catch {} };

/**
 * Short double buzz. Returns false when it could not have fired, so the caller
 * can tell "off" from "unsupported" from "page was hidden".
 *
 * The spec has user agents drop vibration requests while the document is
 * hidden, so this is inherently a foreground-only signal — including in
 * browsers that keep audio alive in the background.
 */
export function buzz() {
  if (!vibrateOn() || !vibrateSupported()) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  try { return navigator.vibrate([60, 40, 60]); } catch { return false; }
}

/** One short pulse, for confirming the toggle in settings. */
export function buzzTest() {
  if (!vibrateSupported()) return false;
  try { return navigator.vibrate(120); } catch { return false; }
}

/** Rising fifth (A5 → E6). Pleasant, short, audible over gym noise. */
function synthChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    for (const [freq, offset] of [[880, 0], [1318.51, 0.09]]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.5);
    }
  } catch { /* audio unavailable — the toast still shows */ }
}

/**
 * Plays sounds/notify.mp3 when you drop one in, otherwise the built-in chime.
 * Drop-in replacement: no code change needed to swap the tone.
 *
 * The element is built once and reused. Constructing a fresh Audio per chime
 * means the first one waits on the download, which on gym wifi is the chime you
 * actually miss. Rewinding is safe because chime() allows only one per 15s, so
 * two can never overlap.
 */
function playTone() {
  if (fileOk === false) return synthChime();
  if (!toneEl) {
    toneEl = new Audio(SOUND_FILE);
    toneEl.preload = 'auto';
    toneEl.volume = 0.5;
  }
  try { toneEl.currentTime = 0; } catch { /* not loaded yet */ }
  toneEl.play().then(() => { fileOk = true; })
               .catch(() => { fileOk = false; synthChime(); });
}

/** Warm the cache and satisfy iOS's "audio needs a user gesture" rule. */
export function primeAudio() {
  if (fileOk === false || toneEl) return;
  toneEl = new Audio(SOUND_FILE);
  toneEl.preload = 'auto';
  toneEl.volume = 0.5;
  toneEl.load();
}

/**
 * Tone + buzz together, sharing one rate limit so a burst of sets can't turn
 * into a stutter of pulses.
 */
export function chime() {
  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return false;
  lastPlayed = now;
  if (soundOn()) playTone();
  buzz();
  return true;
}
