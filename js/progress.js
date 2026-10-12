// Progress charts: turning logged sets into one point per training day.
//
// Pure — no DOM, no Firestore — so every rule below is tested in
// test/progress.test.mjs. The rules come from docs/graphs-spec.md, which was
// written after running them against the live data on 10/12/26.

import { UNITS } from './units.js';
import { byTime } from './rest.js';

const LB_PER_KG = 1 / UNITS.lb.perKg;

/**
 * What a chart can show for an exercise.
 *   reps exercises:  Top weight · Reps · Volume
 *   bodyweight:      Reps only — there is no weight to plot
 *   timed:           Longest hold · Total time
 */
export const CHART_METRICS = {
  weight:  { key: 'weight',  label: 'Top weight' },
  reps:    { key: 'reps',    label: 'Reps' },
  volume:  { key: 'volume',  label: 'Volume' },
  longest: { key: 'longest', label: 'Longest hold' },
  total:   { key: 'total',   label: 'Total time' },
};

export function metricsFor(exercise) {
  if (exercise?.metric === 'time') return ['longest', 'total'];
  if (exercise?.bodyweight) return ['reps'];
  return ['weight', 'reps', 'volume'];
}

/** w in `from` expressed in `to`, or null when the two cannot be compared. */
export function convert(w, from, to) {
  if (from === to) return w;
  if (from === 'block' || to === 'block') return null; // a stack position is not a mass
  const kg = from === 'lb' ? w * UNITS.lb.perKg : w;
  return to === 'lb' ? kg * LB_PER_KG : kg;
}

/**
 * One unit for the whole chart, shared by both people so they sit on one axis.
 *   only one unit logged  -> that unit
 *   kg and lb mixed       -> kg (the rule chosen for dumbbells, which mix)
 *   blocks                -> '#', never converted: the number only means
 *                            something on that one machine
 * Blocks and mass in one exercise never happens in the data; if it ever does,
 * the larger family wins and the rest are reported as excluded, not guessed.
 */
export function chartUnit(sets) {
  const units = sets.map((s) => s.unit).filter(Boolean);
  if (!units.length) return { unit: null, excluded: 0 };
  const blocks = units.filter((u) => u === 'block').length;
  const mass = units.length - blocks;
  if (blocks && mass) {
    return blocks >= mass ? { unit: 'block', excluded: mass } : { unit: massUnit(units), excluded: blocks };
  }
  return { unit: blocks ? 'block' : massUnit(units), excluded: 0 };
}

function massUnit(units) {
  const m = new Set(units.filter((u) => u !== 'block'));
  return m.size === 1 ? [...m][0] : 'kg';
}

const repsOf = (s) => (s.reps || 0) + (s.halfReps || 0) * 0.5;

/**
 * Flags sets that look logged in the wrong unit: the value fits this person's
 * usual load far better when read as the OTHER unit. Written for 09/21/26,
 * when 65/75/75 lb dumbbells went in as kg — about 165 lb per hand, which
 * would draw a 60% collapse in two days. Needs a few sets to know "usual".
 */
export function suspectIds(sets) {
  const mass = sets.filter((s) => (s.unit === 'kg' || s.unit === 'lb') && !s.warmup);
  if (mass.length < 4) return new Set();
  const asKg = (s) => convert(s.weight, s.unit, 'kg');
  const sorted = mass.map(asKg).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return new Set();
  const out = new Set();
  for (const s of mass) {
    const v = asKg(s);
    const other = convert(s.weight, s.unit === 'kg' ? 'lb' : 'kg', 'kg');
    if (Math.abs(other - median) / median < 0.25 && Math.abs(v - median) / median > 0.6) out.add(s.id);
  }
  return out;
}

/**
 * One point per training day for one person.
 *
 * @param sets   this person's sets for this exercise
 * @param opts.metric  a key of CHART_METRICS
 * @param opts.unit    the shared chart unit from chartUnit()
 * @returns points sorted oldest first:
 *   { date, value, top, sets, hollow, suspect }
 *   `top` is the set the value came from; `sets` is the whole day, warm-ups
 *   included, for the tap-to-inspect detail.
 */
export function dailySeries(sets, { metric, unit }) {
  const suspects = suspectIds(sets);
  const byDay = new Map();
  for (const s of sets) {
    if (!byDay.has(s.date)) byDay.set(s.date, []);
    byDay.get(s.date).push(s);
  }

  const points = [];
  for (const [date, day] of byDay) {
    // Warm-ups are excluded from every metric but stay in `sets` for the detail.
    const working = day.filter((s) => !s.warmup);
    if (!working.length) continue;

    const value = metricValue(working, metric, unit);
    if (value == null) continue;

    const top = topSet(working, metric, unit);
    points.push({
      date,
      value,
      top,
      sets: day.slice().sort(byTime),
      // Assisted reps make the number less trustworthy; failure does not.
      hollow: !!top && (top.support === 'supported' || top.support === 'light'),
      suspect: working.some((s) => suspects.has(s.id)),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** The set a day is judged by: heaviest, then most reps. Drops are ignored — they are lighter by design. */
function topSet(working, metric, unit) {
  if (metric === 'longest' || metric === 'total') {
    return working.reduce((a, b) => ((b.seconds || 0) > (a.seconds || 0) ? b : a));
  }
  let best = null, bestW = -Infinity;
  for (const s of working) {
    const w = s.bodyweight ? 0 : convert(s.weight || 0, s.unit, unit);
    if (w == null) continue;
    if (w > bestW || (w === bestW && repsOf(s) > repsOf(best))) { best = s; bestW = w; }
  }
  return best;
}

function metricValue(working, metric, unit) {
  if (metric === 'longest') return Math.max(...working.map((s) => s.seconds || 0)) || null;
  if (metric === 'total')   return working.reduce((n, s) => n + (s.seconds || 0), 0) || null;

  const top = topSet(working, metric, unit);
  if (!top) return null;

  if (metric === 'reps') return repsOf(top);
  if (metric === 'weight') {
    // Per side is plotted as logged ("15 kg / side"): it is never mixed within
    // one exercise, so the axis label carries it instead of doubling every value.
    return top.bodyweight ? null : round1(convert(top.weight, top.unit, unit));
  }
  if (metric === 'volume') {
    let v = 0;
    for (const s of working) {
      const w = convert(s.weight || 0, s.unit, unit);
      if (w == null) continue;
      const side = s.perSide ? 2 : 1; // total load moved, as History counts it
      v += w * side * repsOf(s);
      for (const d of s.drops || []) {
        const dw = convert(d.weight || 0, d.unit, unit);
        if (dw != null) v += dw * side * ((d.reps || 0) + (d.halfReps || 0) * 0.5);
      }
    }
    return Math.round(v);
  }
  return null;
}

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Axis title for the y-axis. */
export function axisLabel(metric, unit, perSide) {
  const u = unit === 'block' ? '#' : unit;
  if (metric === 'weight') return u + (perSide ? ' / side' : '');
  if (metric === 'reps')   return 'reps';
  if (metric === 'volume') return `${u} × reps`;
  return 'time';
}

/**
 * "Nice" y-axis bounds and ticks with padding. Not forced to zero: a line chart
 * may start above it, and 20 -> 25 kg would look flat on a 0-25 axis.
 */
export function niceAxis(values, { ticks = 4, integer = false } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) { lo -= Math.max(1, Math.abs(lo) * 0.1); hi += Math.max(1, Math.abs(hi) * 0.1); }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad); hi += pad;

  const raw = (hi - lo) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // Half a weight block or half a rep is meaningless on an axis, so integer
  // scales drop the 2.5 step and never go below 1. The first render showed a
  // blocks axis reading 7.5, 12.5, 17.5.
  let step = (integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const out = [];
  for (let t = min; t <= max + step / 2; t += step) out.push(Math.round(t * 1000) / 1000);
  return { min, max, ticks: out };
}

/**
 * Which x positions get a date label without colliding. Greedy left to right,
 * always keeping the last one so the most recent session is labelled.
 * @param xs  pixel x positions, ascending
 */
export function labelledIndexes(xs, minGap) {
  if (!xs.length) return [];
  const keep = [0];
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[keep[keep.length - 1]] >= minGap) keep.push(i);
  const last = xs.length - 1;
  if (keep[keep.length - 1] !== last) {
    // Make room for the newest label by dropping whatever crowds it.
    while (keep.length && xs[last] - xs[keep[keep.length - 1]] < minGap) keep.pop();
    keep.push(last);
  }
  return keep;
}

/** Days between two ISO dates, for a real calendar x-axis. */
export function dayIndex(iso, originIso) {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(originIso + 'T00:00:00Z')) / 86400000);
}

/**
 * Everything the progress screen shows, decided without touching the DOM.
 *
 * @param exercise  the exercise definition
 * @param people    [{ id, name }] — left (you) first, then the selected other
 * @param pool      every held set for this exercise
 * @param metric    requested metric; falls back to the first one offered
 * @returns {{ metric, metrics, unit, excluded, perSide, timed, series,
 *             layout: 'empty'|'tiles'|'chart', axisTitle, notes }}
 */
export function buildProgress({ exercise, people, pool, metric }) {
  const metrics = metricsFor(exercise);
  if (!metrics.includes(metric)) metric = metrics[0];

  // A timed exercise charts its timed sets; everything else its rep sets.
  const timed = exercise?.metric === 'time';
  const relevant = pool
    .filter((s) => people.some((p) => p.id === s.profileId))
    .filter((s) => (s.metric === 'time') === timed);

  const { unit, excluded } = chartUnit(relevant.filter((s) => !s.bodyweight));
  const perSide = relevant.some((s) => s.perSide);

  const series = people.map((p, i) => ({
    key: i === 0 ? 'me' : 'them',
    name: p.name,
    marker: i === 0 ? 'dot' : 'diamond',
    points: dailySeries(relevant.filter((s) => s.profileId === p.id), { metric, unit }),
  }));

  const total = series.reduce((n, s) => n + s.points.length, 0);
  const most  = Math.max(0, ...series.map((s) => s.points.length));
  // One session is a number, not a trend: a lone dot on an axis says nothing.
  const layout = !total ? 'empty' : most < 2 ? 'tiles' : 'chart';

  const notes = [];
  const suspect = series.some((s) => s.points.some((p) => p.suspect));
  if (layout === 'tiles') {
    // A tile shows the top set exactly as logged — nothing converted, no rings
    // or dots — so chart-only notes would contradict what is on screen.
    if (relevant.some((s) => s.warmup)) notes.push('warm-ups excluded');
    if (suspect) notes.push('? marks a value whose unit looks wrong');
    return result();
  }
  if (relevant.some((s) => s.warmup)) notes.push('warm-ups excluded');
  if (metric === 'reps' && !exercise?.bodyweight) notes.push('reps at the heaviest set');
  if (metric === 'volume' && relevant.some((s) => (s.drops || []).length)) notes.push('drop sets included');
  // only where the plotted numbers ARE weights — on a reps chart it reads as if
  // the rep counts had been altered
  if ((metric === 'weight' || metric === 'volume') && unit === 'kg' && relevant.some((s) => s.unit === 'lb')) notes.push('lb converted to kg');
  if (perSide && metric === 'weight') notes.push('weight per side, as logged');
  if (series.some((s) => s.points.some((p) => p.hollow))) notes.push('○ assisted reps');
  if (suspect) notes.push('dashed ring: unit looks wrong');
  if (excluded) notes.push(`${excluded} set${excluded === 1 ? '' : 's'} in another unit family left out`);

  return result();

  function result() {
    return {
      metric, metrics, unit, excluded, perSide, timed, series, layout, notes,
      axisTitle: timed ? 'time' : axisLabel(metric, unit, perSide),
      // Blocks are stack positions and reps are counts: whole numbers only.
      integerAxis: metric === 'reps' || unit === 'block',
    };
  }
}

/**
 * Total length of a polyline through [x, y] points. The line draw-in animates
 * stroke-dashoffset from this value down to 0, so it has to be exact — too
 * short and the line ends early, too long and it lingers.
 */
export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

/**
 * When a dot starts to drop, in ms, so dots arrive left to right a steady beat
 * after the line draws past them. `x` and the plot bounds are pixels.
 *
 * `spread` matches the line's 900ms draw, which runs at an even pace: the first
 * cut used an ease-out line with a 620ms spread, so the line outran the dots and
 * the gap grew from nothing on the left to ~0.8s on the right.
 */
export function revealDelay(x, left, width, { start = 60, spread = 840 } = {}) {
  const f = width > 0 ? Math.min(1, Math.max(0, (x - left) / width)) : 0;
  return Math.round(start + f * spread);
}
