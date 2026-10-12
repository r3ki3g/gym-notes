// Time between consecutive sets.
//
// Not true rest: only a set's END is recorded (when it is logged), so the gap
// between two log entries is the rest PLUS the time the second set took. That
// is the honest number available, and it is labelled as time between sets.
//
// Pure, tested in test/rest.test.mjs.

/**
 * When a set was logged, in ms. `loggedAt` is the client clock and is written
 * since 1.1.0; older sets only have the server's `createdAt`, which arrives as
 * a Firestore Timestamp in the app and a plain { seconds } object in tests.
 */
export function timeOf(s) {
  if (s?.loggedAt) return s.loggedAt;
  const c = s?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  return null;
}

/** Oldest first, by when each set was logged. Sets with no time sort first. */
export const byTime = (a, b) => (timeOf(a) || 0) - (timeOf(b) || 0);

/**
 * Gap before each set, in ms, for a list already in time order; null for the
 * first set, for any set missing a time, and for a negative gap — which only
 * happens when two phones' clocks disagree by a few seconds, and is better left
 * blank than shown as nonsense.
 */
export function restGaps(sets) {
  return sets.map((s, i) => {
    if (i === 0) return null;
    const a = timeOf(sets[i - 1]), b = timeOf(s);
    if (a == null || b == null) return null;
    const gap = b - a;
    return gap >= 0 ? gap : null;
  });
}

/** 45s -> "0:45", 160s -> "2:40", 725s -> "12:05", over an hour -> "1h 05m". */
export function formatRest(ms) {
  const secs = Math.max(0, Math.round((ms || 0) / 1000));
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
