// Live updates: the bookkeeping behind "a set logged on the other phone shows
// up here". The live listener does the work while its connection is alive; a
// cheap poll every few seconds is the safety net for when it is not. These are
// the pure parts, tested in test/sync.test.mjs. Spec: docs/sync-reliability-spec.md.

import { timeOf } from './rest.js';

export const POLL_MS = 10_000;          // safety-net poll, only while the app is visible
export const LIVE_WINDOW_MS = 30_000;   // "Synced" means the server answered this recently
export const STALE_HIDDEN_MS = 120_000; // hidden this long: assume the connection died
export const AWAY_AFTER_MS = 60_000;    // a set this old when it arrives is "while you were away"
export const POLL_TIMEOUT_MS = 8_000;   // a poll with no answer by then: the connection is stuck
export const RECONNECT_GAP_MS = 30_000; // at most one forced reconnect per this long

/** Server time a set was stored, in ms, or null while its write is still pending. */
export function createdMs(s) {
  const c = s?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6);
  return typeof c === 'number' ? c : null;
}

/** The poll's cursor: the newest server time among the sets held. */
export function newestCreated(sets) {
  let best = null;
  for (const s of sets) { const t = createdMs(s); if (t != null && (best == null || t > best)) best = t; }
  return best;
}

/**
 * The listener's view plus whatever the poll found that it has not delivered.
 * A polled set is dropped once the listener has it, or once the listener holds
 * anything newer — then it is caught up, and a set it lacks was deleted.
 *
 * @returns { recent, extras }
 */
export function reconcile(listened, extras) {
  const have = new Set(listened.map((s) => s.id));
  const newest = newestCreated(listened) ?? -Infinity;
  const keep = extras.filter((s) => !have.has(s.id) && (createdMs(s) ?? Infinity) > newest);
  return { recent: keep.length ? [...listened, ...keep] : listened, extras: keep };
}

/** Add or replace by id. */
export function mergeSets(sets, incoming) {
  const byId = new Map(sets.map((s) => [s.id, s]));
  for (const s of incoming) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * Sets worth an alert on this phone: today's, typed on another phone. By
 * deviceId, the physical fact; the typist's name is only the fallback for sets
 * from versions before deviceId existed.
 */
export function fromOtherPhone(sets, { deviceId, owner, today }) {
  return sets.filter((x) => x.date === today &&
    (x.deviceId ? x.deviceId !== deviceId : !!x.enteredBy && x.enteredBy !== owner));
}

/**
 * The toast. "While you were away" when they came in while the app was hidden,
 * or are old by the time they arrive (the connection had dropped).
 */
export function alertText(sets, { away = false, now = Date.now(), exerciseName = () => null } = {}) {
  const late = sets.every((s) => { const t = timeOf(s); return t != null && now - t > AWAY_AFTER_MS; });
  const who = [...new Set(sets.map((s) => s.enteredBy).filter(Boolean))];
  let msg;
  if (sets.length === 1) msg = `${who[0] || 'Someone'} logged ${exerciseName(sets[0].exerciseId) || 'a set'}`;
  else if (who.length === 1) msg = `${who[0]} logged ${sets.length.toLocaleString('en-US')} sets`;
  else msg = `${sets.length.toLocaleString('en-US')} new sets logged`;
  return (away || late ? 'While you were away: ' : '') + msg;
}

/** The top-bar dot: 'live' (server answered lately), 'wait' (online, not yet), 'off'. */
export function syncState({ online, lastServerAt, now }) {
  if (!online) return 'off';
  return lastServerAt && now - lastServerAt <= LIVE_WINDOW_MS ? 'live' : 'wait';
}

/** Retry delay after the listener fails: 2s, 4s, 8s … capped at a minute. */
export const backoff = (attempt) => Math.min(60_000, 2000 * 2 ** Math.max(0, attempt));
