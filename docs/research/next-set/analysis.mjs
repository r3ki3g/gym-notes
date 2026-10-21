// BroSplit next-set suggestion: data analysis + rule backtest.
// Usage: node analysis.mjs [path/to/data.json] > analysis-output.md
// Plain Node, no dependencies. Prints markdown tables to stdout.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(process.argv[2] || join(here, 'data.json'), 'utf8'));

// ---------- formatting helpers (org rules: MM/DD/YY, thousands commas, % to 1 dp) ----------
const fmtN = (x, dp = 0) => (x == null || Number.isNaN(x) ? '-' : Number(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const pctv = (x) => (x == null || Number.isNaN(x) ? '-' : (x >= 0 ? '+' : '') + (100 * x).toFixed(1) + '%');
const sgn = (x, dp = 1) => (x == null || Number.isNaN(x) ? '-' : (x > 0 ? '+' : '') + fmtN(x, dp));
const mdDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`;
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const quant = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')].join('\n');
const out = (...x) => console.log(...x);
const h = (t) => out('\n## ' + t + '\n');
const h3 = (t) => out('\n### ' + t + '\n');

// ---------- model ----------
const LB = 0.4536;
const EX = Object.fromEntries(data.exercises.map((e) => [e.id, e]));
const PN = Object.fromEntries(data.profiles.map((p) => [p.id, p.name]));
const PEOPLE = ['Prabhashwara', 'Chamuth'];
const t = (s) => s.loggedAt ?? s.createdAt;
const isTimed = (s) => s.metric === 'time' || /plank/i.test(EX[s.exerciseId]?.name || '');
const fam = (u) => (u === 'block' ? 'block' : 'kg'); // kg and lb are one family (compare in kg)
const load = (w, u) => (u === 'lb' ? w * LB : w); // kg for kg/lb, block number for block
const stepOf = (u) => (u === 'block' ? 1 : u === 'kg' ? 2.5 : 5);
const stepKg = (u) => (u === 'block' ? 1 : u === 'kg' ? 2.5 : 5 * LB);
// difference b - a in steps (a, b: {weight, unit}); same unit -> exact unit steps; mixed kg/lb -> kg diff / 2.5
const stepsDiff = (a, b) => {
  if (fam(a.unit) !== fam(b.unit)) return NaN;
  if (a.unit === b.unit) return (b.weight - a.weight) / stepOf(a.unit);
  return (load(b.weight, b.unit) - load(a.weight, a.unit)) / 2.5;
};
const sameW = (a, b) => { const d = stepsDiff(a, b); return a.unit === b.unit ? d === 0 : Math.abs(d) < 0.3; };
const within1 = (a, b) => { const d = stepsDiff(a, b); return a.unit === b.unit ? Math.abs(d) <= 1 : Math.abs(d) <= 1.2; };
const cls = (d) => (Number.isNaN(d) ? 'n/a' : d > 0.3 ? 'heavier' : d < -0.3 ? 'lighter' : 'same');
const relPct = (a, b) => { const la = load(a.weight, a.unit), lb = load(b.weight, b.unit); return la > 0 ? (lb - la) / la : NaN; };
const roundToStep = (w, unit) => { const st = stepOf(unit); return Math.max(0, Math.round(w / st) * st); };

const all = data.sets
  .filter((s) => !isTimed(s))
  .map((s) => ({ ...s, person: PN[s.profileId], ex: EX[s.exerciseId]?.name || s.exerciseId, ts: t(s) }))
  .sort((a, b) => a.ts - b.ts || a.createdAt - b.createdAt);
const timedDropped = data.sets.length - all.length;

// sessions: person+exercise+date
const sessKey = (s) => `${s.person}|${s.exerciseId}|${s.date}`;
const sessions = new Map();
for (const s of all) { const k = sessKey(s); if (!sessions.has(k)) sessions.set(k, { key: k, person: s.person, exerciseId: s.exerciseId, ex: s.ex, date: s.date, sets: [] }); sessions.get(k).sets.push(s); }
for (const ss of sessions.values()) {
  ss.work = ss.sets.filter((s) => !s.warmup);
  ss.warm = ss.sets.filter((s) => s.warmup);
  ss.sets.forEach((s, i) => { s.idxInSess = i; s.sess = ss; });
  ss.work.forEach((s, i) => { s.workIdx = i; });
  ss.top = ss.work.reduce((b, s) => (!b || load(s.weight, s.unit) > load(b.weight, b.unit) + 1e-9 || (Math.abs(load(s.weight, s.unit) - load(b.weight, b.unit)) < 1e-9 && s.reps > b.reps) ? s : b), null);
  ss.firstWork = ss.work[0] || null;
  ss.lastWork = ss.work[ss.work.length - 1] || null;
  ss.lastAny = ss.sets[ss.sets.length - 1];
  ss.startTs = ss.sets[0].ts;
}
// previous session links
const byPE = new Map();
for (const ss of [...sessions.values()].sort((a, b) => a.startTs - b.startTs)) {
  const k = ss.person + '|' + ss.exerciseId;
  if (!byPE.has(k)) byPE.set(k, []);
  const arr = byPE.get(k);
  ss.prev = arr[arr.length - 1] || null;
  ss.prevAll = [...arr];
  ss.n = arr.length; // 0-based session index for this person+exercise
  arr.push(ss);
}
// exercise order within the day per person
const dayOrder = new Map();
for (const ss of sessions.values()) { const k = ss.person + '|' + ss.date; if (!dayOrder.has(k)) dayOrder.set(k, []); dayOrder.get(k).push(ss); }
for (const arr of dayOrder.values()) { arr.sort((a, b) => a.startTs - b.startTs); arr.forEach((ss, i) => { ss.order = i + 1; ss.dayCount = arr.length; }); }

const work = all.filter((s) => !s.warmup);
const sessList = [...sessions.values()];
const per = (fn) => [...PEOPLE.map((p) => [p, fn(p)]), ['Both', fn(null)]];
const who = (p) => (x) => !p || x.person === p;

// ===================================================================================
h('0. Dataset');
{
  const dates = [...new Set(all.map((s) => s.date))].sort();
  out(`Sets analysed: ${fmtN(all.length)} (dropped ${timedDropped} timed plank sets). Working sets: ${fmtN(work.length)}, warm-ups: ${fmtN(all.length - work.length)}.`);
  out(`Gym days: ${dates.length} (${mdDate(dates[0])} to ${mdDate(dates[dates.length - 1])}). Person-exercise sessions: ${sessList.length}.`);
  const rows = per((p) => {
    const S = all.filter(who(p)), W = S.filter((s) => !s.warmup), ss = sessList.filter(who(p));
    const pe = new Set(ss.map((x) => x.exerciseId));
    const pe3 = [...byPE.entries()].filter(([k, v]) => (!p || k.startsWith(p + '|')) && v.length >= 3).length;
    return [fmtN(S.length), fmtN(W.length), ss.length, pe.size, pe3, new Set(S.map((s) => s.date)).size];
  }).map(([p, r]) => [p, ...r]);
  out(table(['Person', 'Sets', 'Working', 'Sessions', 'Exercises', 'Exercises with 3+ sessions', 'Days'], rows));
}

// ===================================================================================
h('1. First working set vs previous session');
{
  const rows = [];
  const detail = [];
  for (const ss of sessList) {
    if (!ss.firstWork || !ss.prev || !ss.prev.lastWork) continue;
    const f = ss.firstWork, pl = ss.prev.lastWork, pt = ss.prev.top, pf = ss.prev.firstWork;
    // what the current app would prefill for this first working set: last set today (incl. warm-up) else prev session last set (any)
    const todayBefore = ss.sets.filter((s) => s.ts < f.ts || (s.ts === f.ts && s.idxInSess < f.idxInSess));
    const prefill = todayBefore.length ? todayBefore[todayBefore.length - 1] : ss.prev.lastAny;
    detail.push({ person: ss.person, f, pl, pt, pf, prefill, hadWarm: todayBefore.length > 0 });
  }
  const summarize = (refName, getRef) => per((p) => {
    const D = detail.filter(who(p));
    const ds = D.map((x) => ({ st: stepsDiff(getRef(x), x.f), pc: relPct(getRef(x), x.f), dr: x.f.reps - getRef(x).reps }));
    const c = { lighter: 0, same: 0, heavier: 0 };
    ds.forEach((x) => c[cls(x.st)]++);
    const lighter = ds.filter((x) => cls(x.st) === 'lighter');
    return [D.length, `${c.lighter} (${pct(c.lighter, D.length)})`, `${c.same} (${pct(c.same, D.length)})`, `${c.heavier} (${pct(c.heavier, D.length)})`,
      sgn(median(ds.map((x) => x.st))), pctv(median(ds.map((x) => x.pc))), lighter.length ? sgn(median(lighter.map((x) => x.st))) : '-', sgn(median(ds.map((x) => x.dr)))];
  }).map(([p, r]) => [p, ...r]);
  const head = ['Person', 'n', 'Lighter', 'Same', 'Heavier', 'Median diff (steps)', 'Median diff (%)', 'Median when lighter (steps)', 'Median reps diff'];
  h3('1a. First working set vs previous session LAST working set');
  out(table(head, summarize('last', (x) => x.pl)));
  h3('1b. First working set vs previous session BEST (top) working set');
  out(table(head, summarize('top', (x) => x.pt)));
  h3('1c. First working set vs previous session FIRST working set');
  out(table(head, summarize('first', (x) => x.pf)));
  h3('1d. Would the current prefill have been right for the first working set?');
  out('Prefill = last set today (a warm-up if one was logged) else last set of previous session, as the app does now.\n');
  out(table(['Person', 'n', 'Weight exact', 'Weight within 1 step', 'Reps exact', 'Weight+reps exact', 'Reps MAE', 'Prefill came from today\'s warm-up'],
    per((p) => {
      const D = detail.filter(who(p));
      const we = D.filter((x) => sameW(x.prefill, x.f)).length, w1 = D.filter((x) => within1(x.prefill, x.f)).length;
      const re = D.filter((x) => x.prefill.reps === x.f.reps).length, both = D.filter((x) => sameW(x.prefill, x.f) && x.prefill.reps === x.f.reps).length;
      return [D.length, pct(we, D.length), pct(w1, D.length), pct(re, D.length), pct(both, D.length), fmtN(mean(D.map((x) => Math.abs(x.prefill.reps - x.f.reps))), 2), D.filter((x) => x.hadWarm).length];
    }).map(([p, r]) => [p, ...r])));
  const dw = detail.filter((x) => x.hadWarm), dn = detail.filter((x) => !x.hadWarm);
  out(`\nSplit: when a warm-up was logged first today the prefill was the warm-up and matched the weight ${dw.filter((x) => sameW(x.prefill, x.f)).length} of ${dw.length} times (${pct(dw.filter((x) => sameW(x.prefill, x.f)).length, dw.length)}); with no warm-up it was last session's last set and matched ${dn.filter((x) => sameW(x.prefill, x.f)).length} of ${dn.length} (${pct(dn.filter((x) => sameW(x.prefill, x.f)).length, dn.length)}).`);
  // step distribution vs prev top
  h3('1e. Distribution: first working set minus previous top set (steps), both people');
  const bins = {};
  for (const x of detail) { const st = stepsDiff(x.pt, x.f); const b = Number.isNaN(st) ? 'n/a' : st <= -6 ? '<= -6' : st >= 1 ? '>= +1' : String(Math.round(st)); bins[b] = (bins[b] || 0) + 1; }
  const order = ['<= -6', '-5', '-4', '-3', '-2', '-1', '0', '>= +1'];
  out(table(['Steps vs prev top', ...order], [['Sessions', ...order.map((k) => bins[k] || 0)]]));
  const ratio = detail.map((x) => load(x.f.weight, x.f.unit) / load(x.pt.weight, x.pt.unit)).filter((r) => Number.isFinite(r));
  out(`\nFirst working load / previous top load: median ${pctv(median(ratio) - 1)} (IQR ${pctv(quant(ratio, 0.25) - 1)} to ${pctv(quant(ratio, 0.75) - 1)}), n=${ratio.length}.`);
  const fam2 = (f) => detail.filter((x) => fam(x.f.unit) === f).map((x) => load(x.f.weight, x.f.unit) / load(x.pt.weight, x.pt.unit)).filter(Number.isFinite);
  out(`By unit family: machine blocks median ${pctv(median(fam2('block')) - 1)} (n=${fam2('block').length}); dumbbells/plates (kg, lb) median ${pctv(median(fam2('kg')) - 1)} (n=${fam2('kg').length}).`);
}

// ===================================================================================
h('2. Within a session');
{
  h3('2a. Working sets per exercise per session');
  out(table(['Person', 'Sessions', 'Mean', 'Median', '1', '2', '3', '4', '5+'], per((p) => {
    const S = sessList.filter(who(p)).filter((s) => s.work.length);
    const c = (k) => S.filter((s) => (k === 5 ? s.work.length >= 5 : s.work.length === k)).length;
    return [S.length, fmtN(mean(S.map((s) => s.work.length)), 2), median(S.map((s) => s.work.length)), ...[1, 2, 3, 4, 5].map((k) => `${c(k)} (${pct(c(k), S.length)})`)];
  }).map(([p, r]) => [p, ...r])));

  const trans = [];
  for (const ss of sessList) for (let i = 1; i < ss.work.length; i++) {
    const a = ss.work[i - 1], b = ss.work[i];
    trans.push({ person: ss.person, a, b, i, st: stepsDiff(a, b), dr: b.reps - a.reps, gap: (b.loggedAt && a.loggedAt) ? (b.loggedAt - a.loggedAt) / 60000 : NaN, last: i === ss.work.length - 1 });
  }
  h3('2b. Consecutive working sets: weight direction');
  out(table(['Person', 'Transitions', 'Up', 'Same', 'Down', 'Median step when up', 'Median step when down'], per((p) => {
    const T = trans.filter(who(p)); const c = { heavier: 0, same: 0, lighter: 0 }; T.forEach((x) => c[cls(x.st)]++);
    return [T.length, `${c.heavier} (${pct(c.heavier, T.length)})`, `${c.same} (${pct(c.same, T.length)})`, `${c.lighter} (${pct(c.lighter, T.length)})`,
      sgn(median(T.filter((x) => cls(x.st) === 'heavier').map((x) => x.st))), sgn(median(T.filter((x) => cls(x.st) === 'lighter').map((x) => x.st)))];
  }).map(([p, r]) => [p, ...r])));
  h3('2c. By position (set k -> set k+1, working sets, both people)');
  out(table(['Transition', 'n', 'Up', 'Same', 'Down', 'Reps diff when same weight (mean)', 'Reps diff when up (mean)'], [1, 2, 3, 4].map((i) => {
    const T = trans.filter((x) => (i === 4 ? x.i >= 4 : x.i === i)); const c = { heavier: 0, same: 0, lighter: 0 }; T.forEach((x) => c[cls(x.st)]++);
    return [i === 4 ? '4 -> 5+' : `${i} -> ${i + 1}`, T.length, pct(c.heavier, T.length), pct(c.same, T.length), pct(c.lighter, T.length),
      sgn(mean(T.filter((x) => cls(x.st) === 'same').map((x) => x.dr)), 2), sgn(mean(T.filter((x) => cls(x.st) === 'heavier').map((x) => x.dr)), 2)];
  })));
  h3('2d. Reps change between consecutive working sets');
  out(table(['Person', 'Same weight: n', 'reps same', 'reps down', 'reps up', 'mean diff', 'Weight up: n', 'mean reps diff', 'reps same', 'Weight down: n', 'mean reps diff'], per((p) => {
    const T = trans.filter(who(p)); const S = T.filter((x) => cls(x.st) === 'same'), U = T.filter((x) => cls(x.st) === 'heavier'), D = T.filter((x) => cls(x.st) === 'lighter');
    return [S.length, pct(S.filter((x) => x.dr === 0).length, S.length), pct(S.filter((x) => x.dr < 0).length, S.length), pct(S.filter((x) => x.dr > 0).length, S.length), sgn(mean(S.map((x) => x.dr)), 2),
      U.length, sgn(mean(U.map((x) => x.dr)), 2), pct(U.filter((x) => x.dr === 0).length, U.length), D.length, sgn(mean(D.map((x) => x.dr)), 2)];
  }).map(([p, r]) => [p, ...r])));
  h3('2e. Where the top set sits and the final back-off set');
  out(table(['Person', 'Sessions with 2+ working sets', 'Top set is last set', 'Last set lighter than previous set (back-off)', 'Back-off set reps (median)', 'Back-off drop vs top (median steps)'], per((p) => {
    const S = sessList.filter(who(p)).filter((s) => s.work.length >= 2);
    const topLast = S.filter((s) => load(s.lastWork.weight, s.lastWork.unit) >= load(s.top.weight, s.top.unit) - 1e-9).length;
    const bo = S.filter((s) => cls(stepsDiff(s.work[s.work.length - 2], s.lastWork)) === 'lighter');
    return [S.length, `${topLast} (${pct(topLast, S.length)})`, `${bo.length} (${pct(bo.length, S.length)})`, median(bo.map((s) => s.lastWork.reps)), sgn(median(bo.map((s) => stepsDiff(s.top, s.lastWork))))];
  }).map(([p, r]) => [p, ...r])));
  h3('2f. What the next set does, by the state after the previous working set');
  const hardS = (x) => x.support !== 'none' || x.halfReps > 0 || x.drops.length > 0 || (/supp?ed|supported|struggl|compromised|sacrifice|help on/i.test(x.comment || '') && !/no sup/i.test(x.comment || ''));
  const st = (x) => { const top = x.a.sess.prev?.top; const rel = !top ? 'no previous session' : stepsDiff(x.a, top) > 0.3 ? 'below last top' : 'at/above last top'; return `${rel}, ${hardS(x.a) ? 'hard set' : 'clean set'}`; };
  const groups = {}; for (const x of trans) { const k = st(x); (groups[k] = groups[k] || []).push(x); }
  const extra = { 'previous set under 12 reps': trans.filter((x) => x.a.reps < 12), 'previous set 12+ reps': trans.filter((x) => x.a.reps >= 12) };
  out(table(['State after previous working set', 'n', 'Next up', 'Next same', 'Next down'], [...Object.entries(groups).sort(), ...Object.entries(extra)].map(([k, T]) => { const c = { heavier: 0, same: 0, lighter: 0 }; T.forEach((x) => c[cls(x.st)]++); return [k, T.length, pct(c.heavier, T.length), pct(c.same, T.length), pct(c.lighter, T.length)]; })));
  const ub = trans.filter((x) => cls(x.st) === 'heavier' && x.a.sess.prev?.top && stepsDiff(x.a, x.a.sess.prev.top) > 0.3);
  const onUsed = ub.filter((x) => x.a.sess.prev.work.some((w) => sameW(w, x.b))).length, onTop = ub.filter((x) => sameW(x.a.sess.prev.top, x.b)).length;
  out(`\nWhen they went up while still below last session's top (${ub.length} sets), the new weight was one they had used last session in ${onUsed} (${pct(onUsed, ub.length)}) and exactly last session's top in ${onTop} (${pct(onTop, ub.length)}).`);
  const ups = trans.filter((x) => cls(x.st) === 'heavier' && x.a.unit === 'block' && x.b.unit === 'block');
  const sc = {}; ups.forEach((x) => { const k = Math.min(4, Math.round(x.st)); sc[k] = (sc[k] || 0) + 1; });
  out(`Size of an upward jump on machine blocks (n=${ups.length}): +1 step ${pct(sc[1] || 0, ups.length)}, +2 ${pct(sc[2] || 0, ups.length)}, +3 ${pct(sc[3] || 0, ups.length)}, +4 or more ${pct(sc[4] || 0, ups.length)}. Median jump: Prabhashwara ${sgn(median(trans.filter((x) => cls(x.st) === 'heavier' && x.person === 'Prabhashwara').map((x) => x.st)))} steps, Chamuth ${sgn(median(trans.filter((x) => cls(x.st) === 'heavier' && x.person === 'Chamuth').map((x) => x.st)))}.`);
  globalThis.__trans = trans;
}

// ===================================================================================
h('3. Warm-ups');
{
  out(table(['Person', 'Sessions', 'Starts with flagged warm-up', 'Warm-up load vs first working set (median %)', 'IQR', 'Warm-up reps (median)', 'Unflagged ramp: first working set <= 70% of session top'], per((p) => {
    const S = sessList.filter(who(p)).filter((s) => s.work.length);
    const W = S.filter((s) => s.sets[0].warmup);
    const r = W.map((s) => { const a = load(s.warm[s.warm.length - 1].weight, s.warm[s.warm.length - 1].unit), b = load(s.firstWork.weight, s.firstWork.unit); return b > 0 ? a / b - 1 : NaN; }).filter(Number.isFinite);
    const noW = S.filter((s) => !s.warm.length && s.work.length >= 2);
    const ramp = noW.filter((s) => load(s.firstWork.weight, s.firstWork.unit) <= 0.7 * load(s.top.weight, s.top.unit));
    return [S.length, `${W.length} (${pct(W.length, S.length)})`, pctv(median(r)), `${pctv(quant(r, 0.25))} to ${pctv(quant(r, 0.75))}`, median(W.map((s) => s.warm[0].reps)), `${ramp.length} of ${noW.length} (${pct(ramp.length, noW.length)})`];
  }).map(([p, r]) => [p, ...r])));
  // warm-up usage over time
  const dates = [...new Set(all.map((s) => s.date))].sort();
  out('\nFlagged warm-up rate by day (sessions starting with a warm-up / sessions):\n');
  out(table(['Day', ...dates.map(mdDate)], [['Rate', ...dates.map((d) => { const S = sessList.filter((s) => s.date === d && s.work.length); const W = S.filter((s) => s.sets[0].warmup); return `${W.length}/${S.length}`; })]]));
  const sessWithPrev = sessList.filter((s) => s.prev && s.work.length);
  const wPrev = sessWithPrev.filter((s) => s.sets[0].warmup).length, wNew = sessList.filter((s) => !s.prev && s.work.length && s.sets[0].warmup).length, nNew = sessList.filter((s) => !s.prev && s.work.length).length;
  {
    const S2 = sessList.filter((s) => s.prev && s.work.length);
    const a = S2.filter((s) => s.prev.sets[0].warmup), b = S2.filter((s) => !s.prev.sets[0].warmup);
    const aw = a.filter((s) => s.sets[0].warmup), bw = b.filter((s) => s.sets[0].warmup);
    const sameWU = aw.filter((s) => sameW(s.prev.sets[0], s.sets[0])).length;
    out(`\nHabit persistence: opened with a warm-up after opening with one last session ${aw.length} of ${a.length} (${pct(aw.length, a.length)}); after not doing one ${bw.length} of ${b.length} (${pct(bw.length, b.length)}). Same warm-up weight as last time: ${sameWU} of ${aw.length} (${pct(sameWU, aw.length)}).`);
  }
  out(`\nWarm-up rate when the exercise was done before: ${pct(wPrev, sessWithPrev.length)} (${wPrev}/${sessWithPrev.length}); first time on the exercise: ${pct(wNew, nNew)} (${wNew}/${nNew}).`);
}

// ===================================================================================
h('4. Session-to-session progression (person+exercise with 3+ sessions)');
{
  const rows = [];
  const pairs = [];
  for (const [k, arr] of byPE) {
    const S = arr.filter((s) => s.top);
    for (let i = 1; i < S.length; i++) pairs.push({ person: S[i].person, a: S[i - 1], b: S[i], st: stepsDiff(S[i - 1].top, S[i].top), dr: S[i].top.reps - S[i - 1].top.reps, days: (Date.parse(S[i].date) - Date.parse(S[i - 1].date)) / 864e5 });
    if (S.length < 3) continue;
    const st = stepsDiff(S[0].top, S[S.length - 1].top);
    const weeks = (Date.parse(S[S.length - 1].date) - Date.parse(S[0].date)) / (7 * 864e5);
    rows.push([S[0].person, S[0].ex.slice(0, 44), S.length, S.map((s) => `${fmtN(s.top.weight, s.top.weight % 1 ? 1 : 0)}${s.top.unit === 'block' ? 'b' : s.top.unit}x${s.top.reps}${s.top.support === 'failure' ? 'F' : ''}`).join(' -> '), sgn(st), sgn(st / (S.length - 1), 2), sgn(weeks ? st / weeks : NaN, 2)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]);
  out(table(['Person', 'Exercise', 'Sessions', 'Top set per session (F = failure)', 'Total change (steps)', 'Steps / session', 'Steps / week'], rows));
  const s3 = rows.map((r) => Number(String(r[5]).replace('+', '')));
  out(`\nMedian progression across these ${rows.length} series: ${sgn(median(s3), 2)} steps per session; ${rows.filter((r) => Number(String(r[4]).replace('+', '')) > 0).length} of ${rows.length} series ended above where they started.`);
  h3('4b. Consecutive-session pairs (top set): double-progression check');
  const c = (f) => pairs.filter(f);
  out(table(['Person', 'Pairs', 'Top weight up', 'of which reps down', 'Same top weight', 'of which reps up', 'of which reps same', 'Top weight down', 'Median days between'], per((p) => {
    const P = pairs.filter(who(p)); const up = P.filter((x) => cls(x.st) === 'heavier'), same = P.filter((x) => cls(x.st) === 'same'), dn = P.filter((x) => cls(x.st) === 'lighter');
    return [P.length, `${up.length} (${pct(up.length, P.length)})`, pct(up.filter((x) => x.dr < 0).length, up.length), `${same.length} (${pct(same.length, P.length)})`, pct(same.filter((x) => x.dr > 0).length, same.length), pct(same.filter((x) => x.dr === 0).length, same.length), `${dn.length} (${pct(dn.length, P.length)})`, median(P.map((x) => x.days))];
  }).map(([p, r]) => [p, ...r])));
  out(`\nMedian top-set change per consecutive session: ${sgn(median(pairs.map((x) => x.st)))} steps (mean ${sgn(mean(pairs.map((x) => x.st)), 2)}), n=${pairs.length}.`);
  globalThis.__pairs = pairs;
  h3('4c. Rep ranges (working sets, full reps)');
  const hiRep = (s) => /calf|wrist|shrug/i.test(s.ex);
  out(table(['Person', 'Working sets', '% exactly 12', '% 10-14', '% <= 8', '% >= 16', 'P10', 'Median', 'P90', 'Excl. calf/wrist/shrug: % 10-14'], per((p) => {
    const W = work.filter(who(p)); const r = W.map((s) => s.reps); const W2 = W.filter((s) => !hiRep(s));
    return [W.length, pct(r.filter((x) => x === 12).length, r.length), pct(r.filter((x) => x >= 10 && x <= 14).length, r.length), pct(r.filter((x) => x <= 8).length, r.length), pct(r.filter((x) => x >= 16).length, r.length), quant(r, 0.1), median(r), quant(r, 0.9), pct(W2.filter((s) => s.reps >= 10 && s.reps <= 14).length, W2.length)];
  }).map(([p, r]) => [p, ...r])));
  out('\nEven rep counts: ' + per((p) => { const W = work.filter(who(p)); const e = W.filter((s) => s.reps % 2 === 0).length; return `${e} of ${W.length} (${pct(e, W.length)})`; }).map(([p, r]) => `${p} ${r}`).join('; ') + '. Odd counts are mostly failure-tagged or half-rep sets.');
}

// ===================================================================================
h('5. Effort signals');
{
  const cat = (c) => {
    if (!c) return null;
    if (/supp?ed|supported|help on the way/i.test(c) && !/no sup/i.test(c)) return 'Partner-assisted last reps (comment)';
    if (/struggl|compromised|sacrifice/i.test(c)) return 'Struggled / form broke (comment)';
    if (/slow|eccentric|controlled/i.test(c)) return 'Slow / controlled reps (comment)';
    if (/hurt|pain/i.test(c) && !/no wrist hurt/i.test(c)) return 'Pain (comment)';
    if (/easy|ezz|good form|enjoyed|better than|chad|no sup/i.test(c)) return 'Easy / good (comment)';
    return 'Other comment';
  };
  const signals = [
    ['Tagged failure', (s) => s.support === 'failure'],
    ['Tagged supported', (s) => s.support === 'supported'],
    ['Half reps > 0', (s) => s.halfReps > 0],
    ['Has drop-set', (s) => s.drops.length > 0],
    ['Partner-assisted last reps (comment)', (s) => cat(s.comment) === 'Partner-assisted last reps (comment)'],
    ['Struggled / form broke (comment)', (s) => cat(s.comment) === 'Struggled / form broke (comment)'],
    ['Slow / controlled reps (comment)', (s) => cat(s.comment) === 'Slow / controlled reps (comment)'],
    ['Easy / good (comment)', (s) => cat(s.comment) === 'Easy / good (comment)'],
    ['Pain (comment)', (s) => cat(s.comment) === 'Pain (comment)'],
    ['No signal at all', (s) => s.support === 'none' && !s.halfReps && !s.drops.length && !s.comment],
  ];
  const rows = [];
  for (const [name, f] of signals) {
    const S = work.filter(f);
    const nxt = S.map((s) => s.sess.work[s.workIdx + 1]).map((n, i) => n && { a: S[i], b: n }).filter(Boolean);
    const isLast = S.filter((s) => s.workIdx === s.sess.work.length - 1).length;
    const c = { heavier: 0, same: 0, lighter: 0 }; nxt.forEach((x) => c[cls(stepsDiff(x.a, x.b))]++);
    const sameW = nxt.filter((x) => cls(stepsDiff(x.a, x.b)) === 'same');
    // next session: first working set and top vs this set
    const ns = S.map((s) => { const nsess = sessList.find((z) => z.prev === s.sess); return nsess && nsess.top ? { a: s, top: nsess.top, first: nsess.firstWork } : null; }).filter(Boolean);
    rows.push([name, S.length, `${isLast} (${pct(isLast, S.length)})`, nxt.length, pct(c.heavier, nxt.length), pct(c.same, nxt.length), pct(c.lighter, nxt.length), sgn(mean(sameW.map((x) => x.b.reps - x.a.reps)), 2), ns.length, sgn(median(ns.map((x) => stepsDiff(x.a, x.top)))), sgn(median(ns.map((x) => x.top.reps - x.a.reps)))]);
  }
  out(table(['Signal (working sets)', 'n', 'Was last set', 'Has next set', 'Next: up', 'Next: same', 'Next: down', 'Reps diff if same weight', 'Next session exists', 'Next-session top vs this set (median steps)', 'Next-session top reps vs this (median)'], rows));
  h3('5b. Failure tagging by person and set position');
  out(table(['Person', 'Working sets', 'Tagged failure', 'Failure on top set of session', 'Failure on a set that was not the last', 'Sessions with any failure'], per((p) => {
    const W = work.filter(who(p)); const F = W.filter((s) => s.support === 'failure'); const S = sessList.filter(who(p)).filter((s) => s.work.length);
    return [W.length, `${F.length} (${pct(F.length, W.length)})`, pct(F.filter((s) => s.sess.top === s).length, F.length), pct(F.filter((s) => s.workIdx < s.sess.work.length - 1).length, F.length), `${S.filter((s) => s.work.some((x) => x.support === 'failure')).length} (${pct(S.filter((s) => s.work.some((x) => x.support === 'failure')).length, S.length)})`];
  }).map(([p, r]) => [p, ...r])));
  out(`\nReps on failure-tagged sets: median ${median(work.filter((s) => s.support === 'failure').map((s) => s.reps))}; untagged: median ${median(work.filter((s) => s.support === 'none').map((s) => s.reps))}.`);
  // next session after a session whose top set was failure vs not
  h3('5c. Next session on the same exercise, by whether the previous top set was tagged failure');
  const nx = sessList.filter((s) => s.prev && s.prev.top && s.top);
  const grp = (f) => nx.filter((s) => f(s.prev.top));
  out(table(['Previous top set', 'n', 'Top weight up', 'Same', 'Down', 'Median steps', 'First working set vs prev top (median steps)'], [['Tagged failure', grp((x) => x.support === 'failure')], ['Not failure', grp((x) => x.support !== 'failure')]].map(([n, S]) => {
    const st = S.map((s) => stepsDiff(s.prev.top, s.top));
    return [n, S.length, pct(st.filter((x) => cls(x) === 'heavier').length, S.length), pct(st.filter((x) => cls(x) === 'same').length, S.length), pct(st.filter((x) => cls(x) === 'lighter').length, S.length), sgn(median(st)), sgn(median(S.map((s) => stepsDiff(s.prev.top, s.firstWork))))];
  })));
  h3('5d. Comment text used (working + warm-up sets)');
  const cc = {}; for (const s of all) if (s.comment) { const k = cat(s.comment); cc[k] = cc[k] || []; cc[k].push(s.comment); }
  out(table(['Category', 'Count', 'Examples'], Object.entries(cc).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length, [...new Set(v)].slice(0, 4).map((x) => '"' + x.replace(/\|/g, '/') + '"').join(', ')])));
  const slow = work.filter((s) => cat(s.comment) === 'Slow / controlled reps (comment)');
  out(`\n"Slow / controlled" sets that were lighter than the previous working set (back-off): ${slow.filter((s) => s.workIdx > 0 && cls(stepsDiff(s.sess.work[s.workIdx - 1], s)) === 'lighter').length} of ${slow.length}.`);
}

// ===================================================================================
h('6. Rest time between sets');
{
  const gaps = [];
  for (const ss of sessList) for (let i = 1; i < ss.sets.length; i++) {
    const a = ss.sets[i - 1], b = ss.sets[i];
    if (!a.loggedAt || !b.loggedAt) continue;
    const g = (b.loggedAt - a.loggedAt) / 60000;
    gaps.push({ person: ss.person, a, b, g, st: stepsDiff(a, b), dr: b.reps - a.reps });
  }
  const ok = gaps.filter((x) => x.g <= 20);
  out(`Gaps between consecutive sets (same person, exercise, day, loggedAt only): ${gaps.length}; ${gaps.length - ok.length} over 20 min ignored; ${ok.filter((x) => x.g < 1).length} under 1 min (likely logged in a batch, not real rest).\n`);
  out(table(['Person', 'n', 'P10 (min)', 'P25', 'Median', 'P75', 'P90', '% under 1 min'], per((p) => {
    const G = ok.filter(who(p)).map((x) => x.g);
    return [G.length, fmtN(quant(G, 0.1), 1), fmtN(quant(G, 0.25), 1), fmtN(median(G), 1), fmtN(quant(G, 0.75), 1), fmtN(quant(G, 0.9), 1), pct(G.filter((x) => x < 1).length, G.length)];
  }).map(([p, r]) => [p, ...r])));
  h3('6b. Rest before a set at the same weight (working -> working) vs reps change');
  const sw = ok.filter((x) => !x.a.warmup && !x.b.warmup && cls(x.st) === 'same' && x.g >= 1);
  const buckets = [[1, 3, '1-3 min'], [3, 5, '3-5 min'], [5, 7, '5-7 min'], [7, 20.01, '7-20 min']];
  out(table(['Rest', 'n', 'Reps held or up', 'Reps down', 'Mean reps diff'], buckets.map(([lo, hi, n]) => {
    const B = sw.filter((x) => x.g >= lo && x.g < hi);
    return [n, B.length, pct(B.filter((x) => x.dr >= 0).length, B.length), pct(B.filter((x) => x.dr < 0).length, B.length), sgn(mean(B.map((x) => x.dr)), 2)];
  })));
  const up = ok.filter((x) => !x.a.warmup && !x.b.warmup && cls(x.st) === 'heavier' && x.g >= 1);
  out(`\nMedian rest before a heavier set: ${fmtN(median(up.map((x) => x.g)), 1)} min (n=${up.length}); before a same-weight set: ${fmtN(median(sw.map((x) => x.g)), 1)} min (n=${sw.length}); after a failure-tagged set: ${fmtN(median(ok.filter((x) => x.a.support === 'failure' && x.g >= 1).map((x) => x.g)), 1)} min (n=${ok.filter((x) => x.a.support === 'failure' && x.g >= 1).length}).`);
}

// ===================================================================================
h('7. Day-level fatigue and spacing');
{
  const S = sessList.filter((s) => s.prev && s.prev.top && s.top);
  out('Top set vs the previous session on the same exercise, by the exercise\'s position in that person\'s day.\n');
  const pos = [[1, 2, '1st-2nd'], [3, 4, '3rd-4th'], [5, 6, '5th-6th'], [7, 99, '7th+']];
  out(table(['Position in day', 'n', 'Top above prev', 'Same', 'Below', 'Median steps vs prev top', 'First working set vs prev top (median steps)'], pos.map(([lo, hi, n]) => {
    const B = S.filter((s) => s.order >= lo && s.order <= hi); const st = B.map((s) => stepsDiff(s.prev.top, s.top));
    return [n, B.length, pct(st.filter((x) => cls(x) === 'heavier').length, B.length), pct(st.filter((x) => cls(x) === 'same').length, B.length), pct(st.filter((x) => cls(x) === 'lighter').length, B.length), sgn(median(st)), sgn(median(B.map((s) => stepsDiff(s.prev.top, s.firstWork))))];
  })));
  // position effect may be confounded: exercise mix differs by position
  h3('7b. Per person per day: exercises with top set above / same / below previous session');
  const days = new Map();
  for (const s of S) { const k = s.person + '|' + s.date; if (!days.has(k)) days.set(k, { person: s.person, date: s.date, up: 0, same: 0, down: 0, n: 0 }); const d = days.get(k); d.n++; d[{ heavier: 'up', same: 'same', lighter: 'down' }[cls(stepsDiff(s.prev.top, s.top))]]++; }
  const dl = [...days.values()].filter((d) => d.n >= 2).sort((a, b) => a.date.localeCompare(b.date) || a.person.localeCompare(b.person));
  out(table(['Day', 'Person', 'Exercises with a previous session', 'Up', 'Same', 'Down', 'Read'], dl.map((d) => [mdDate(d.date), d.person, d.n, d.up, d.same, d.down, d.down > d.n / 2 ? 'below-par day' : d.up > d.n / 2 ? 'strong day' : 'mixed'])));
  out(`\nDays (person-days with 2+ comparable exercises) where most exercises were below the previous session: ${dl.filter((d) => d.down > d.n / 2).length} of ${dl.length}; where most were above: ${dl.filter((d) => d.up > d.n / 2).length}.`);
  h3('7c. Days between sessions of the same exercise');
  const gaps = sessList.filter((s) => s.prev).map((s) => (Date.parse(s.date) - Date.parse(s.prev.date)) / 864e5);
  out(table(['Person', 'n', 'Min', 'P25', 'Median', 'P75', 'Max'], per((p) => { const G = sessList.filter(who(p)).filter((s) => s.prev).map((s) => (Date.parse(s.date) - Date.parse(s.prev.date)) / 864e5); return [G.length, Math.min(...G), quant(G, 0.25), median(G), quant(G, 0.75), Math.max(...G)]; }).map(([p, r]) => [p, ...r])));
  const gb = [[1, 3, '1-3 days'], [4, 7, '4-7 days'], [8, 99, '8+ days']];
  out('\n' + table(['Gap since last session', 'n', 'Top above prev', 'Same', 'Below', 'Median steps vs prev top'], gb.map(([lo, hi, n]) => {
    const B = S.filter((s) => { const g = (Date.parse(s.date) - Date.parse(s.prev.date)) / 864e5; return g >= lo && g <= hi; }); const st = B.map((s) => stepsDiff(s.prev.top, s.top));
    return [n, B.length, pct(st.filter((x) => cls(x) === 'heavier').length, B.length), pct(st.filter((x) => cls(x) === 'same').length, B.length), pct(st.filter((x) => cls(x) === 'lighter').length, B.length), sgn(median(st))];
  })));
}

// ===================================================================================
h('8. The two people side by side');
{
  const shared = [...new Set(sessList.map((s) => s.exerciseId))].filter((id) => PEOPLE.every((p) => sessList.some((s) => s.person === p && s.exerciseId === id && s.top)));
  const ratios = [];
  for (const id of shared) {
    for (const d of [...new Set(sessList.filter((s) => s.exerciseId === id).map((s) => s.date))]) {
      const a = sessList.find((s) => s.person === 'Prabhashwara' && s.exerciseId === id && s.date === d), b = sessList.find((s) => s.person === 'Chamuth' && s.exerciseId === id && s.date === d);
      if (a?.top && b?.top) { const la = load(a.top.weight, a.top.unit), lb = load(b.top.weight, b.top.unit); if (la > 0 && lb > 0) ratios.push({ ex: EX[id].name, fam: fam(a.top.unit), r: la / lb }); }
    }
  }
  out(`Same exercise, same day (${ratios.length} pairs): Prabhashwara's top load / Chamuth's top load median ${fmtN(median(ratios.map((x) => x.r)), 2)}x (machine blocks ${fmtN(median(ratios.filter((x) => x.fam === 'block').map((x) => x.r)), 2)}x, n=${ratios.filter((x) => x.fam === 'block').length}; dumbbells/plates ${fmtN(median(ratios.filter((x) => x.fam === 'kg').map((x) => x.r)), 2)}x, n=${ratios.filter((x) => x.fam === 'kg').length}).`);
  const trans = globalThis.__trans, pairs = globalThis.__pairs;
  out('\n' + table(['Metric', 'Prabhashwara', 'Chamuth'], [
    ['Working sets', ...PEOPLE.map((p) => work.filter(who(p)).length)],
    ['Median working reps', ...PEOPLE.map((p) => median(work.filter(who(p)).map((s) => s.reps)))],
    ['Working sets at exactly 12 reps', ...PEOPLE.map((p) => pct(work.filter(who(p)).filter((s) => s.reps === 12).length, work.filter(who(p)).length))],
    ['Working sets tagged failure', ...PEOPLE.map((p) => pct(work.filter(who(p)).filter((s) => s.support === 'failure').length, work.filter(who(p)).length))],
    ['Working sets with a comment', ...PEOPLE.map((p) => pct(work.filter(who(p)).filter((s) => s.comment).length, work.filter(who(p)).length))],
    ['Working sets with a drop-set', ...PEOPLE.map((p) => pct(work.filter(who(p)).filter((s) => s.drops.length).length, work.filter(who(p)).length))],
    ['Sessions starting with flagged warm-up', ...PEOPLE.map((p) => { const S = sessList.filter(who(p)).filter((s) => s.work.length); return pct(S.filter((s) => s.sets[0].warmup).length, S.length); })],
    ['Mean working sets / session', ...PEOPLE.map((p) => fmtN(mean(sessList.filter(who(p)).filter((s) => s.work.length).map((s) => s.work.length)), 2))],
    ['Within-session: weight up', ...PEOPLE.map((p) => { const T = trans.filter(who(p)); return pct(T.filter((x) => cls(x.st) === 'heavier').length, T.length); })],
    ['Within-session: same weight', ...PEOPLE.map((p) => { const T = trans.filter(who(p)); return pct(T.filter((x) => cls(x.st) === 'same').length, T.length); })],
    ['Session to session: top weight up', ...PEOPLE.map((p) => { const P = pairs.filter(who(p)); return pct(P.filter((x) => cls(x.st) === 'heavier').length, P.length); })],
    ['Session to session: median top change (steps)', ...PEOPLE.map((p) => sgn(median(pairs.filter(who(p)).map((x) => x.st))))],
    ['Sets entered by this person', ...PEOPLE.map((p) => all.filter(who(p)).filter((s) => s.enteredBy === p).length)],
  ]));
}

// ===================================================================================
h('9. Data quality');
{
  const noLog = data.sets.filter((s) => !s.loggedAt);
  out(table(['Issue', 'Count', 'Note'], [
    ['Sets without loggedAt (createdAt used)', noLog.length, 'all on ' + [...new Set(noLog.map((s) => mdDate(s.date)))].join(', ')],
    ['Edited sets (editedAt)', data.sets.filter((s) => s.editedAt).length, data.sets.filter((s) => s.editedAt).map((s) => `${mdDate(s.date)} ${EX[s.exerciseId].name.slice(0, 24)} ${s.weight}${s.unit}`).join('; ')],
    ['Timed plank sets (dropped)', timedDropped, 'reps=60 used as seconds, no metric field'],
    ['Sessions mixing kg and lb dumbbells', sessList.filter((s) => new Set(s.sets.map((x) => x.unit).filter((u) => u !== 'block')).size > 1).length, 'compared in kg (lb x 0.4536)'],
    ['Drop-set legs logged in a different unit than the main set', all.filter((s) => s.drops.some((d) => d.unit !== s.unit)).length, ''],
    ['Sets entered by Prabhashwara', all.filter((s) => s.enteredBy === 'Prabhashwara').length, 'he logs for both; gaps include typing for the partner'],
    ['Consecutive same-person same-exercise sets under 1 min apart', (() => { let n = 0; for (const ss of sessList) for (let i = 1; i < ss.sets.length; i++) if (ss.sets[i].loggedAt && ss.sets[i - 1].loggedAt && ss.sets[i].loggedAt - ss.sets[i - 1].loggedAt < 60000) n++; return n; })(), 'batch / catch-up logging'],
    ['Person+exercise pairs with only 1 session', [...byPE.values()].filter((v) => v.length === 1).length + ' of ' + byPE.size, 'no history to suggest from'],
  ]));
}

// ===================================================================================
// BACKTEST
// For every working set (target), predict {unit, weight, reps} from strictly earlier sets
// of the same person on the same exercise (plus, for cold start, the partner's sets).
// ===================================================================================
h('10. Backtest');
const before = (x, s) => x.ts < s.ts || (x.ts === s.ts && x.date === s.date && x.idxInSess < s.idxInSess);
const ctx = (s) => {
  const today = s.sess.sets.filter((x) => before(x, s));
  const todayWork = today.filter((x) => !x.warmup);
  return { s, today, todayWork, prevSess: s.sess.prev, past: s.sess.prevAll, k: todayWork.length, a: todayWork[todayWork.length - 1] };
};
const P = (w, unit, reps) => ({ weight: Math.max(0, w), unit, reps });
const copy = (x, reps = x.reps) => P(x.weight, x.unit, reps);
const plus = (x, n, reps) => P(x.weight + n * stepOf(x.unit), x.unit, reps);
const T12 = 12;
const HARD_RE = /supp?ed|supported|struggl|compromised|sacrifice|help on/i;
const isHard = (x) => x.support !== 'none' || x.halfReps > 0 || x.drops.length > 0 || (HARD_RE.test(x.comment || '') && !/no sup/i.test(x.comment || ''));

// ----- first working set of the session (no working set yet today) -----
const FIRST = {
  'F0 app: last set today (warm-up if logged) else last set of last session': (c) => { const src = c.today.length ? c.today[c.today.length - 1] : c.prevSess?.lastAny; return src && copy(src); },
  'F1 last session last working set': (c) => c.prevSess?.lastWork && copy(c.prevSess.lastWork),
  'F2 last session top set': (c) => c.prevSess?.top && copy(c.prevSess.top),
  'F3 last session top -1 step, 12 reps': (c) => c.prevSess?.top && plus(c.prevSess.top, -1, T12),
  'F4 last session top -10%, 12 reps': (c) => c.prevSess?.top && P(roundToStep(c.prevSess.top.weight * 0.9, c.prevSess.top.unit), c.prevSess.top.unit, T12),
  'F5 last session top -20%, 12 reps': (c) => c.prevSess?.top && P(roundToStep(c.prevSess.top.weight * 0.8, c.prevSess.top.unit), c.prevSess.top.unit, T12),
  'F6 last session first working set (weight and reps)': (c) => c.prevSess?.firstWork && copy(c.prevSess.firstWork),
  'F7 last session first working set, 12 reps': (c) => c.prevSess?.firstWork && copy(c.prevSess.firstWork, T12),
  'F8 last session 2nd working set, 12 reps': (c) => { const w = c.prevSess?.work; return w?.length ? copy(w[Math.min(1, w.length - 1)], T12) : null; },
  'F9 last first working set; +1 step if it was clean with 12+ reps; 12 reps': (c) => { const f = c.prevSess?.firstWork; if (!f) return null; return !isHard(f) && f.reps >= T12 && c.prevSess.work.length > 1 && stepsDiff(f, c.prevSess.top) > 0.3 ? plus(f, 1, T12) : copy(f, T12); },
};
// ----- later working sets (at least one working set today); a = previous working set today -----
const HARD_DROP = 0; // reps change after a hard set when holding weight (0 and -2 backtest the same; see 10i)
const holdReps = (a, hardDrop = HARD_DROP) => Math.max(1, a.reps - (isHard(a) ? hardDrop : 0));
const upReps = (a) => (a.reps >= T12 ? T12 : a.reps);
const nextHigherUsedLastTime = (c) => {
  const w = c.prevSess?.work || []; const a = c.a;
  const hi = w.filter((x) => fam(x.unit) === fam(a.unit) && load(x.weight, x.unit) > load(a.weight, a.unit) + 0.3).sort((x, y) => load(x.weight, x.unit) - load(y.weight, y.unit));
  return hi[0] || null;
};
const NEXT = {
  'N0 app: same as previous set': (c) => copy(c.a),
  'N1 +1 step if previous set clean with 12+ reps, else hold': (c) => (!isHard(c.a) && c.a.reps >= T12 ? plus(c.a, 1, upReps(c.a)) : copy(c.a, holdReps(c.a))),
  'N2 replay last session k-th working set (else hold)': (c) => { const w = c.prevSess?.work; return w && w[c.k] ? copy(w[c.k]) : copy(c.a); },
  'N3 climb: if clean and below last top, jump to next weight used last time; else hold': (c) => {
    if (!isHard(c.a) && c.prevSess?.top && stepsDiff(c.a, c.prevSess.top) > 0.3) { const nx = nextHigherUsedLastTime(c); if (nx) return copy(nx, upReps(c.a)); }
    if (!c.prevSess && !isHard(c.a) && c.a.reps >= T12 && c.k === 1) return plus(c.a, 1, upReps(c.a));
    return copy(c.a, holdReps(c.a));
  },
  'N4 climb straight to last top if clean and below it; else hold': (c) => {
    if (!isHard(c.a) && c.prevSess?.top && stepsDiff(c.a, c.prevSess.top) > 0.3) return copy(c.prevSess.top, upReps(c.a));
    if (!c.prevSess && !isHard(c.a) && c.a.reps >= T12 && c.k === 1) return plus(c.a, 1, upReps(c.a));
    return copy(c.a, holdReps(c.a));
  },
};
const ENGINE = (opts = {}) => (s, c) => {
  if (!c.todayWork.length) {
    if (!c.prevSess) { const w = c.today[c.today.length - 1]; return w ? P(w.weight * 2, w.unit, T12) : null; } // cold start after a warm-up: ~2x warm-up (warm-ups run ~50% of first working load)
    return FIRST[opts.first || 'F7 last session first working set, 12 reps'](c);
  }
  return NEXT[opts.next || 'N3 climb: if clean and below last top, jump to next weight used last time; else hold'](c);
};
const ENGINES = {
  'B0 current app (F0 + N0)': (s, c) => (c.todayWork.length ? NEXT['N0 app: same as previous set'](c) : FIRST['F0 app: last set today (warm-up if logged) else last set of last session'](c)),
  'E1 = F7 + N3 (open at last session first set x12; climb to last session weights; hold after hard set)': ENGINE(),
  'E2 = F7 + N4 (open at last first set; climb straight to last top)': ENGINE({ next: 'N4 climb straight to last top if clean and below it; else hold' }),
  'E3 = F8 + N3 (open at last session 2nd set)': ENGINE({ first: 'F8 last session 2nd working set, 12 reps' }),
  'E4 = F7 + N1 (open at last first set; +1 step after any clean 12)': (s, c) => (c.todayWork.length ? NEXT['N1 +1 step if previous set clean with 12+ reps, else hold'](c) : FIRST['F7 last session first working set, 12 reps'](c)),
};

const scoreW = (pred, s) => ({ ok: pred && fam(pred.unit) === fam(s.unit), we: pred && sameW(pred, s), w1: pred && within1(pred, s), re: pred && pred.reps === s.reps, r2: pred && Math.abs(pred.reps - s.reps) <= 2, ae: pred ? Math.abs(pred.reps - s.reps) : NaN });
const score = (rule, T) => {
  let n = 0, we = 0, w1 = 0, re = 0, r2 = 0, ae = 0, both = 0;
  for (const s of T) { const p = rule(s, ctx(s)); if (!p) continue; const r = scoreW(p, s); n++; we += !!r.we; w1 += !!r.w1; re += !!r.re; r2 += !!r.r2; ae += r.ae; both += !!(r.we && r.r2); }
  return { n, we, w1, re, r2, mae: ae / n, both };
};
const fmtScore = (sc) => [sc.n, pct(sc.we, sc.n), pct(sc.w1, sc.n), pct(sc.re, sc.n), pct(sc.r2, sc.n), fmtN(sc.mae, 2), pct(sc.both, sc.n)];
const head = ['Rule', 'n', 'Weight exact', 'Weight within 1 step', 'Reps exact', 'Reps within 2', 'Reps MAE', 'Weight exact + reps within 2'];

const withPrev = work.filter((s) => s.sess.prev);
const firstT = withPrev.filter((s) => s.workIdx === 0);
const laterT = withPrev.filter((s) => s.workIdx > 0);
const coldLater = work.filter((s) => !s.sess.prev && s.workIdx > 0);
out(`Targets: every working set predicted only from sets logged before it. Main pool = ${fmtN(withPrev.length)} working sets in sessions that have a previous session on the same exercise ` +
  `(${firstT.length} first working sets + ${laterT.length} later sets). A further ${coldLater.length} later sets in first-ever sessions test the within-session logic without history. ` +
  `Weight exact = same unit and number (kg vs lb counts as exact when within 0.75 kg); within 1 step = at most 1 step off (block 1, kg 2.5, lb 5; mixed kg/lb compared in kg with a 2.5 kg step).`);

h3('10a. First working set of a session (n=' + firstT.length + ')');
out(table(head, Object.entries(FIRST).map(([n, f]) => [n, ...fmtScore(score((s, c) => f(c), firstT))])));
{
  const repR = {
    'always 12': () => T12,
    'last session first working set reps': (c) => c.prevSess?.firstWork?.reps,
    'last session last set reps (app)': (c) => c.prevSess?.lastAny?.reps,
    'median of the person\'s working reps on this exercise so far': (c) => Math.round(median(c.past.flatMap((z) => z.work.map((x) => x.reps)))),
  };
  out('\nReps alone for the first working set:\n');
  out(table(['Reps rule', 'n', 'Exact', 'Within 2', 'MAE'], Object.entries(repR).map(([n, f]) => {
    let k = 0, e = 0, w = 0, m = 0; for (const s of firstT) { const r = f(ctx(s)); if (r == null || Number.isNaN(r)) continue; k++; if (r === s.reps) e++; if (Math.abs(r - s.reps) <= 2) w++; m += Math.abs(r - s.reps); }
    return [n, k, pct(e, k), pct(w, k), fmtN(m / k, 2)];
  })));
}
h3('10b. Later working sets, 2nd onward (n=' + laterT.length + ' with a previous session; n=' + coldLater.length + ' in first-ever sessions)');
out(table([...head, 'First-ever sessions: weight exact', 'within 1', 'reps MAE'], Object.entries(NEXT).map(([n, f]) => { const a = score((s, c) => f(c), laterT), b = score((s, c) => f(c), coldLater); return [n, ...fmtScore(a), pct(b.we, b.n), pct(b.w1, b.n), fmtN(b.mae, 2)]; })));
{
  out('\nReps alone for later sets (the "told the actual weight direction" rows peek at the answer and are only an upper bound):\n');
  const repR = {
    'same as previous set (app)': (c) => c.a.reps,
    'always 12': () => T12,
    'previous reps, -1 after a hard set': (c) => holdReps(c.a, 1),
    'previous reps, -2 after a hard set': (c) => holdReps(c.a, 2),
    'told direction: up -> min(prev, 12) else previous reps': (c, s) => (cls(stepsDiff(c.a, s)) === 'heavier' ? upReps(c.a) : c.a.reps),
    'told direction: up -> min(prev, 12) else prev -1 after hard set': (c, s) => (cls(stepsDiff(c.a, s)) === 'heavier' ? upReps(c.a) : holdReps(c.a, 1)),
  };
  out(table(['Reps rule', 'n', 'Exact', 'Within 2', 'MAE'], Object.entries(repR).map(([n, f]) => {
    let k = 0, e = 0, w = 0, m = 0; for (const s of laterT) { const r = f(ctx(s), s); k++; if (r === s.reps) e++; if (Math.abs(r - s.reps) <= 2) w++; m += Math.abs(r - s.reps); }
    return [n, k, pct(e, k), pct(w, k), fmtN(m / k, 2)];
  })));
}
{
  const climb = laterT.filter((s) => { const c = ctx(s); return !isHard(c.a) && c.prevSess?.top && stepsDiff(c.a, c.prevSess.top) > 0.3 && nextHigherUsedLastTime(c); });
  const rest = laterT.filter((s) => !climb.includes(s));
  const n3 = NEXT['N3 climb: if clean and below last top, jump to next weight used last time; else hold'], n0 = NEXT['N0 app: same as previous set'];
  out('\nWhere N3 and the app differ: N3 only changes the suggestion when the previous set was clean and below last session\'s top.\n');
  out(table(['Subset', 'Rule', ...head.slice(1)], [
    ['Clean and below last top (N3 climbs)', 'N3', ...fmtScore(score((s, c) => n3(c), climb))], ['Clean and below last top (N3 climbs)', 'App (hold)', ...fmtScore(score((s, c) => n0(c), climb))],
    ['Everything else (N3 holds)', 'N3', ...fmtScore(score((s, c) => n3(c), rest))], ['Everything else (N3 holds)', 'App (hold)', ...fmtScore(score((s, c) => n0(c), rest))],
  ]));
}
h3('10c. Whole engines on every working set with a previous session (n=' + withPrev.length + ')');
out(table(head, Object.entries(ENGINES).map(([n, f]) => [n, ...fmtScore(score(f, withPrev))])));
out('\nBy person:\n');
out(table(['Rule', 'Person', ...head.slice(1)], ['B0 current app (F0 + N0)', 'E1 = F7 + N3 (open at last session first set x12; climb to last session weights; hold after hard set)'].flatMap((n) => PEOPLE.map((p) => [n.split(' (')[0], p, ...fmtScore(score(ENGINES[n], withPrev.filter(who(p))))]))));
h3('10d. Paired comparison: E1 vs current app, set by set');
{
  const cmp = (T) => { let eOnly = 0, bOnly = 0, both = 0, none = 0, rBetter = 0, rWorse = 0; for (const s of T) { const c = ctx(s); const e = scoreW(ENGINES['E1 = F7 + N3 (open at last session first set x12; climb to last session weights; hold after hard set)'](s, c), s), b = scoreW(ENGINES['B0 current app (F0 + N0)'](s, c), s); if (e.we && b.we) both++; else if (e.we) eOnly++; else if (b.we) bOnly++; else none++; if (e.ae < b.ae) rBetter++; else if (e.ae > b.ae) rWorse++; } return [T.length, both, eOnly, bOnly, none, rBetter, rWorse]; };
  out(table(['Segment', 'n', 'Both weight-exact', 'Only E1 exact', 'Only app exact', 'Neither', 'E1 reps closer', 'App reps closer'], [['First working set', ...cmp(firstT)], ['Later sets', ...cmp(laterT)], ['All', ...cmp(withPrev)]]));
}
h3('10e. Out-of-sample: sessions up to 10/05/26 (used to shape the rules) vs 10/07/26 onward');
{
  const early = withPrev.filter((s) => s.date <= '2026-10-05'), late = withPrev.filter((s) => s.date >= '2026-10-07');
  out(table(['Rule', 'Period', 'n', 'Weight exact', 'Within 1 step', 'Reps exact', 'Reps MAE'], Object.entries(ENGINES).flatMap(([n, f]) => [['to 10/05/26', early], ['10/07/26 on', late]].map(([pn, T]) => { const sc = score(f, T); return [n.split(' (')[0], pn, sc.n, pct(sc.we, sc.n), pct(sc.w1, sc.n), pct(sc.re, sc.n), fmtN(sc.mae, 2)]; }))));
}
h3('10f. Opening the form at the start of an exercise: warm-up or working set?');
{
  // target: the very first set of each session that has a previous session (may be a warm-up)
  const T = sessList.filter((ss) => ss.prev).map((ss) => ss.sets[0]);
  const app = (s) => copy(s.sess.prev.lastAny);
  const eng = (s) => { const pv = s.sess.prev; if (pv.sets[0].warmup) return { ...copy(pv.sets[0]), warm: true }; return { ...copy(pv.firstWork || pv.sets[0], T12), warm: false }; };
  const sc = (f) => { let we = 0, w1 = 0, ae = 0, typ = 0; for (const s of T) { const p = f(s); if (sameW(p, s)) we++; if (within1(p, s)) w1++; ae += Math.abs(p.reps - s.reps); if (p.warm === undefined ? !s.warmup : p.warm === !!s.warmup) typ++; } return [T.length, pct(we, T.length), pct(w1, T.length), fmtN(ae / T.length, 2), pct(typ, T.length)]; };
  out(table(['Suggestion for the first set of an exercise', 'n', 'Weight exact', 'Within 1 step', 'Reps MAE', 'Warm-up vs working guessed right'], [
    ['App: last set of last session (always a working set)', ...sc(app)],
    ['If last session opened with a warm-up, suggest that warm-up; else last session first working set x12', ...sc(eng)],
  ]));
  const w = T.filter((s) => s.warmup).length;
  out(`\n${w} of ${T.length} (${pct(w, T.length)}) of these sessions actually opened with a flagged warm-up.`);
}
h3('10g. Cold start from the partner (first-ever session on an exercise)');
{
  // predict the first working set of a person's first session on an exercise from the partner's most recent working sets on it (before this set), scaled by the overall load ratio
  const ratioPC = 1.4; // Prabhashwara / Chamuth, from section 8 (in-sample, so optimistic)
  const T = work.filter((s) => !s.sess.prev && s.workIdx === 0);
  let n = 0, we = 0, w1 = 0, w1raw = 0, weraw = 0;
  for (const s of T) {
    const partner = all.filter((x) => x.person !== s.person && x.exerciseId === s.exerciseId && !x.warmup && x.ts < s.ts);
    if (!partner.length) continue;
    const lastDay = partner[partner.length - 1].date; const pd = partner.filter((x) => x.date === lastDay); const ref = pd[0];
    const f = s.person === 'Prabhashwara' ? ratioPC : 1 / ratioPC;
    const pred = P(roundToStep(ref.weight * f, ref.unit), ref.unit, T12);
    n++; if (sameW(pred, s)) we++; if (within1(pred, s)) w1++; if (sameW(ref, s)) weraw++; if (within1(ref, s)) w1raw++;
  }
  out(`First working sets in a person's first-ever session: ${T.length}. Partner had already done the exercise in ${n}. Partner's first working set scaled by ${ratioPC}x (or 1/${ratioPC}x): weight exact ${pct(we, n)}, within 1 step ${pct(w1, n)}. Unscaled partner weight: exact ${pct(weraw, n)}, within 1 step ${pct(w1raw, n)}.`);
}
h3('10h. Specific rules from the brief, each on the sets it applies to');
{
  const rows = [];
  // 1. First working set = last top minus X%
  for (const x of [0, 5, 10, 15, 20, 25, 30]) {
    const sc = score((s, c) => c.prevSess?.top && P(roundToStep(c.prevSess.top.weight * (1 - x / 100), c.prevSess.top.unit), c.prevSess.top.unit, T12), firstT);
    rows.push([`First working set = last session top -${x}%, rounded to step, 12 reps`, 'first working sets', ...fmtScore(sc)]);
  }
  for (const n of [0, 1, 2, 3]) rows.push([`First working set = last session top -${n} step(s), 12 reps`, 'first working sets', ...fmtScore(score((s, c) => c.prevSess?.top && plus(c.prevSess.top, -n, T12), firstT))]);
  // 2. after a failure-tagged set (same session)
  const afterFail = work.filter((s) => s.workIdx > 0 && s.sess.work[s.workIdx - 1].support === 'failure');
  const afterHard = work.filter((s) => s.workIdx > 0 && isHard(s.sess.work[s.workIdx - 1]));
  const afterClean = work.filter((s) => s.workIdx > 0 && !isHard(s.sess.work[s.workIdx - 1]));
  const prevOf = (s) => s.sess.work[s.workIdx - 1];
  for (const n of [0, 1, 2, 3]) rows.push([`After a failure tag: same weight, reps -${n}`, 'sets after failure', ...fmtScore(score((s) => copy(prevOf(s), Math.max(1, prevOf(s).reps - n)), afterFail))]);
  rows.push(['After a failure tag: +1 step, 12 reps', 'sets after failure', ...fmtScore(score((s) => plus(prevOf(s), 1, T12), afterFail))]);
  for (const n of [0, 1, 2]) rows.push([`After any hard signal (failure/supported/half reps/drop/struggle): same weight, reps -${n}`, 'sets after hard', ...fmtScore(score((s) => copy(prevOf(s), Math.max(1, prevOf(s).reps - n)), afterHard))]);
  rows.push(['After a clean set: same weight and reps', 'sets after clean', ...fmtScore(score((s) => copy(prevOf(s)), afterClean))]);
  rows.push(['After a clean set: +1 step, reps min(prev, 12)', 'sets after clean', ...fmtScore(score((s) => plus(prevOf(s), 1, upReps(prevOf(s))), afterClean))]);
  rows.push(['After a clean set with 12+ reps: +1 step; else hold', 'sets after clean', ...fmtScore(score((s) => (prevOf(s).reps >= T12 ? plus(prevOf(s), 1, upReps(prevOf(s))) : copy(prevOf(s))), afterClean))]);
  out(table(['Rule', 'Applies to', ...head.slice(1)], rows));

  // 3. session top prediction (double progression / load progression)
  const S = sessList.filter((ss) => ss.prev?.top && ss.top);
  const topRules = {
    'Same as last session top': (ss) => copy(ss.prev.top),
    '+1 step if last top was clean with 12+ reps, else same': (ss) => (!isHard(ss.prev.top) && ss.prev.top.reps >= T12 ? plus(ss.prev.top, 1, T12) : copy(ss.prev.top)),
    '+1 step if last top had 12+ reps (failure tag ignored), else same': (ss) => (ss.prev.top.reps >= T12 ? plus(ss.prev.top, 1, T12) : copy(ss.prev.top)),
    '+1 step only after 2 sessions in a row at the same top with 12+ reps': (ss) => { const a = ss.prev.prev?.top, b = ss.prev.top; return a && sameW(a, b) && a.reps >= T12 && b.reps >= T12 ? plus(b, 1, T12) : copy(b); },
    'Always +1 step': (ss) => plus(ss.prev.top, 1, T12),
  };
  out(`\nPredicting the session's top working set from the previous session (n=${S.length} sessions):\n`);
  out(table(['Top-set rule', 'n', 'Weight exact', 'Within 1 step', 'Predicted heavier than actual', 'Predicted lighter than actual'], Object.entries(topRules).map(([n, f]) => {
    let we = 0, w1 = 0, hi = 0, lo = 0; for (const ss of S) { const p = f(ss); if (sameW(p, ss.top)) we++; else if (stepsDiff(ss.top, p) > 0) hi++; else lo++; if (within1(p, ss.top)) w1++; }
    return [n, S.length, pct(we, S.length), pct(w1, S.length), pct(hi, S.length), pct(lo, S.length)];
  })));
  const dbl = S.filter((ss) => { const a = ss.prev.prev?.top, b = ss.prev.top; return a && sameW(a, b) && a.reps >= T12 && b.reps >= T12; });
  out(`\nTwo sessions in a row at the same top weight with 12+ reps: ${dbl.length} cases; the next session's top went up in ${dbl.filter((ss) => cls(stepsDiff(ss.prev.top, ss.top)) === 'heavier').length}.`);

  // 4. tired-day signal: first working set today lighter than last session's first working set
  const F = sessList.filter((ss) => ss.prev?.firstWork && ss.firstWork && ss.top && ss.prev.top);
  const lighterStart = F.filter((ss) => cls(stepsDiff(ss.prev.firstWork, ss.firstWork)) === 'lighter');
  const normalStart = F.filter((ss) => cls(stepsDiff(ss.prev.firstWork, ss.firstWork)) !== 'lighter');
  const below = (A) => A.filter((ss) => cls(stepsDiff(ss.prev.top, ss.top)) === 'lighter').length;
  out(`\nTired-day check: when the first working set was lighter than last session's first working set (${lighterStart.length} sessions), the session top ended below last session's top in ${below(lighterStart)} (${pct(below(lighterStart), lighterStart.length)}); otherwise ${below(normalStart)} of ${normalStart.length} (${pct(below(normalStart), normalStart.length)}).`);
}
h3('10i. Engine variants: reps after a hard set, and pushing past last top');
{
  const mk = (hardDrop, push) => (s, c) => {
    if (!c.todayWork.length) return c.prevSess ? FIRST['F7 last session first working set, 12 reps'](c) : null;
    const a = c.a, top = c.prevSess?.top;
    if (!isHard(a) && top && stepsDiff(a, top) > 0.3) { const nx = nextHigherUsedLastTime(c); if (nx) return copy(nx, upReps(a)); }
    if (!c.prevSess && !isHard(a) && a.reps >= T12 && c.k === 1) return plus(a, 1, upReps(a));
    if (push && !isHard(a) && top && stepsDiff(a, top) <= 0.3 && a.reps >= push && c.k < c.prevSess.work.length) return plus(a, 1, upReps(a));
    return copy(a, Math.max(1, a.reps - (isHard(a) ? hardDrop : 0)));
  };
  const V = { 'E1 as specified (reps unchanged after hard set)': mk(0, 0), 'E1 with reps -1 after hard set': mk(1, 0), 'E1 with reps -2 after hard set': mk(2, 0),
    'E1 + at/above last top, clean 12+, fewer sets than last time: +1 step': mk(0, 12), 'E1 + same, but only at 14+ reps': mk(0, 14) };
  out(table(['Variant', 'Segment', ...head.slice(1)], Object.entries(V).flatMap(([n, f]) => [['later sets', laterT], ['all', withPrev]].map(([sn, T]) => [n, sn, ...fmtScore(score(f, T))]))));
}
h3('10j. Two-option suggestion (primary + one alternative chip): how often does one of them match the weight?');
{
  const e1 = ENGINES['E1 = F7 + N3 (open at last session first set x12; climb to last session weights; hold after hard set)'];
  const alt = (s, c, p) => {
    if (!c.todayWork.length) { const w = c.prevSess?.work; return w?.length > 1 ? copy(w[1]) : plus(p, 1, p.reps); } // opener alt: last session 2nd working set
    const a = c.a; if (sameW(p, a)) { const nx = c.prevSess ? nextHigherUsedLastTime(c) : null; return nx || plus(a, 1, a.reps); } return copy(a); // climb <-> hold
  };
  const run = (T) => { let one = 0, prim = 0; for (const s of T) { const c = ctx(s); const p = e1(s, c); if (!p) continue; const q = alt(s, c, p); if (sameW(p, s)) prim++; if (sameW(p, s) || sameW(q, s)) one++; } return [T.length, pct(prim, T.length), pct(one, T.length)]; };
  const app = (T) => { let k = 0; for (const s of T) { const p = ENGINES['B0 current app (F0 + N0)'](s, ctx(s)); if (p && sameW(p, s)) k++; } return pct(k, T.length); };
  out(table(['Segment', 'n', 'E1 primary exact', 'Primary or alternative exact', 'Current app exact'], [['First working set', ...run(firstT), app(firstT)], ['Later sets', ...run(laterT), app(laterT)], ['All', ...run(withPrev), app(withPrev)]]));
  out('\nAlternative = last session 2nd working set for the opener; for later sets, "hold" when the primary says climb and "next weight up" when the primary says hold.');
}
