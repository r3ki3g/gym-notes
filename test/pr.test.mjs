import { findPRs, allPRs, newPRs, CELEBRATE_WITHIN_MS } from '../js/pr.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
let clock = Date.UTC(2026, 9, 1, 12);
const S = (id, date, weight, reps, extra = {}) => ({ id, date, weight, reps, unit: 'kg', profileId: 'p', exerciseId: 'e', loggedAt: (clock += 60_000), ...extra });
const prs = (sets) => Object.fromEntries(findPRs(sets));

console.log('\nweight and rep PRs\n');
eq('first day never counts', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-01', 65, 8)]), {});
eq('heavier on a later day', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 62.5, 8)]), { b: 'weight' });
eq('a tie is not a PR', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 60, 10)]), {});
eq('more reps at the same weight', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 60, 11)]), { b: 'reps' });
eq('more reps at a LIGHTER weight is not a PR', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 50, 14)]), {});
eq('lighter weight, more reps than ever at or above it', prs([S('a', '2026-10-01', 60, 10), S('a2', '2026-10-01', 50, 12), S('b', '2026-10-03', 50, 13)]), { b: 'reps' });
eq('only beaten once in a session: the second equal set is a tie',
   prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 62.5, 8), S('c', '2026-10-03', 62.5, 8)]), { b: 'weight' });
eq('half reps count as half', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 60, 10, { halfReps: 1 })]), { b: 'reps' });

console.log('\nwhat is left out\n');
eq('warm-ups never count or set the bar', prs([S('w', '2026-10-01', 80, 5, { warmup: true }), S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 62.5, 8)]), { b: 'weight' });
eq('lb and kg compared as mass', prs([S('a', '2026-10-01', 30, 10, { unit: 'lb' }), S('a2', '2026-10-01', 32.5, 10, { unit: 'lb' }), S('b', '2026-10-03', 15, 10)]), { b: 'weight' });
eq('per-side sets only against per-side sets', prs([S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 30, 10, { perSide: true })]), {});
eq('blocks against blocks', prs([S('a', '2026-10-01', 7, 12, { unit: 'block' }), S('b', '2026-10-03', 8, 10, { unit: 'block' })]), { b: 'weight' });
const lbs = [10, 11, 12, 13].map((n) => S('x' + n, '2026-10-01', 30 + n * 0.1, 10, { unit: 'lb' }));
eq('a wrong-unit slip (lb logged as kg) is not a PR', prs([...lbs, S('bad', '2026-10-03', 31, 10, { unit: 'kg' })]), {});
eq('bodyweight: reps only', prs([S('a', '2026-10-01', 0, 12, { bodyweight: true }), S('b', '2026-10-03', 0, 15, { bodyweight: true })]), { b: 'reps' });

console.log('\ntimed holds\n');
eq('longest hold', prs([S('a', '2026-10-01', 0, 0, { metric: 'time', seconds: 60 }), S('b', '2026-10-03', 0, 0, { metric: 'time', seconds: 75 })]), { b: 'time' });
eq('shorter hold: no', prs([S('a', '2026-10-01', 0, 0, { metric: 'time', seconds: 60 }), S('b', '2026-10-03', 0, 0, { metric: 'time', seconds: 45 })]), {});

console.log('\neveryone at once, and what to celebrate\n');
const both = [S('a', '2026-10-01', 60, 10), S('b', '2026-10-03', 62.5, 8), S('c', '2026-10-01', 40, 10, { profileId: 'q' }), S('d', '2026-10-03', 40, 10, { profileId: 'q' })];
eq('per person: a PR is against your own sets only', Object.fromEntries(allPRs(both)), { b: 'weight' });
const byId = new Map(both.map((s) => [s.id, s]));
const now = byId.get('b').loggedAt + 30_000;
eq('a brand-new PR is celebrated', newPRs(new Map(), allPRs(both), byId, now), ['b']);
eq('an old one only gets the tag', newPRs(new Map(), allPRs(both), byId, now + CELEBRATE_WITHIN_MS), []);
eq('already known: not again', newPRs(allPRs(both), allPRs(both), byId, now), []);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
