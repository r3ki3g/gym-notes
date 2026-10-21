// Streak calendar: gym days on a GitHub-style grid, and weekly streaks. A
// streak counts weeks, not days: rest days are part of training and must not
// break it. Pure, tested in test/streak.test.mjs. Spec: docs/pro-features-spec.md.

export const TARGET_DEFAULT = 4;   // days a week, chosen by the users
export const WEEKS_SHOWN = 13;

const D = (iso) => new Date(iso + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** Monday of the week the date is in. */
export function weekStart(s) {
  const dow = (D(s).getUTCDay() + 6) % 7;   // Monday 0 … Sunday 6
  return addDays(s, -dow);
}

/** A stored target, or the default; always 1–7. */
export function parseTarget(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(7, Math.max(1, n)) : TARGET_DEFAULT;
}

/** Sets per day for one person: Map date -> count (warm-ups count; it was a gym day). */
export function gymDays(sets, profileId) {
  const out = new Map();
  for (const s of sets) if (s.profileId === profileId && s.date) out.set(s.date, (out.get(s.date) || 0) + 1);
  return out;
}

/** 0 none, 1 light, 2 medium, 3 big day, by sets logged. */
export const level = (n) => (!n ? 0 : n < 10 ? 1 : n < 20 ? 2 : 3);

/**
 * The grid: WEEKS_SHOWN columns, oldest first, each Monday→Sunday.
 * @returns [{ start, days: [{ date, count, level, future }] }]
 */
export function grid(days, { today, weeks = WEEKS_SHOWN }) {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(first, 7 * w);
    out.push({ start, days: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const count = days.get(date) || 0;
      return { date, count, level: level(count), future: date > today };
    }) });
  }
  return out;
}

/**
 * This week's days, the current streak and the best, in weeks that hit the
 * target. The week in progress never breaks a streak; it adds to it once the
 * target is reached.
 */
export function streaks(days, { today, target }) {
  const perWeek = new Map();
  for (const d of days.keys()) if (d <= today) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) || 0) + 1);
  const thisWeekStart = weekStart(today);
  const thisWeek = perWeek.get(thisWeekStart) || 0;
  if (!perWeek.size) return { thisWeek, current: 0, best: 0 };

  const firstWeek = [...perWeek.keys()].sort()[0];
  let run = 0, best = 0, current = 0;
  for (let w = firstWeek; w <= thisWeekStart; w = addDays(w, 7)) {
    const hit = (perWeek.get(w) || 0) >= target;
    if (w === thisWeekStart) { current = hit ? run + 1 : run; best = Math.max(best, current); break; }
    run = hit ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { thisWeek, current, best };
}
