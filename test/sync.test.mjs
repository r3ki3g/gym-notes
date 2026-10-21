import { createdMs, newestCreated, reconcile, mergeSets, fromOtherPhone, alertText, syncState, backoff,
         LIVE_WINDOW_MS, AWAY_AFTER_MS } from '../js/sync.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};
const T = (min, sec = 0) => Date.UTC(2026, 9, 21, 14, min, sec);
const ts = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
const set = (id, min, extra = {}) => ({ id, createdAt: ts(T(min)), loggedAt: T(min), date: '2026-10-21', ...extra });

console.log('\nthe poll cursor: newest server time held\n');
eq('Firestore-style timestamp', createdMs({ createdAt: ts(T(3, 1)) }), T(3, 1));
eq('Timestamp object', createdMs({ createdAt: { toMillis: () => 42 } }), 42);
eq('pending write has no server time', createdMs({ createdAt: null }), null);
eq('newest wins, pending ignored', newestCreated([set('a', 1), set('b', 5), { id: 'p', createdAt: null }, set('c', 3)]), T(5));
eq('nothing held -> no cursor', newestCreated([]), null);

console.log('\npolled sets survive a stale listener, then hand back to it\n');
const L = [set('a', 1), set('b', 2)];
const P = [set('c', 4)];
let r = reconcile(L, P);
eq('listener behind: polled set shown', r.recent.map((s) => s.id), ['a', 'b', 'c']);
eq('and kept as an extra', r.extras.map((s) => s.id), ['c']);
r = reconcile([...L, set('c', 4)], P);
eq('listener caught up: no duplicate', r.recent.map((s) => s.id), ['a', 'b', 'c']);
eq('extra dropped', r.extras.length, 0);
r = reconcile([...L, set('d', 6)], P);
eq('listener newer but without it: it was deleted, drop it', r.recent.map((s) => s.id), ['a', 'b', 'd']);
eq('merge replaces by id', mergeSets([set('a', 1)], [{ ...set('a', 1), reps: 9 }, set('z', 9)]).map((s) => s.reps ?? s.id), [9, 'z']);

console.log('\nwhose set is news: by phone, not by name\n');
const me = { deviceId: 'd-mine', owner: 'Prabhashwara', today: '2026-10-21' };
eq('typed on the other phone', fromOtherPhone([set('a', 1, { deviceId: 'd-other', enteredBy: 'Chamuth' })], me).length, 1);
eq('typed here: not news', fromOtherPhone([set('a', 1, { deviceId: 'd-mine', enteredBy: 'Prabhashwara' })], me).length, 0);
eq('other phone, even if it is set up under my name', fromOtherPhone([set('a', 1, { deviceId: 'd-laptop', enteredBy: 'Prabhashwara' })], me).length, 1);
eq('no deviceId (old version): falls back to the name', fromOtherPhone([set('a', 1, { enteredBy: 'Chamuth' }), set('b', 1, { enteredBy: 'Prabhashwara' })], me).map((s) => s.id), ['a']);
eq('no deviceId and no name: cannot say, stay quiet', fromOtherPhone([set('a', 1)], me).length, 0);
eq('not today: not news', fromOtherPhone([set('a', 1, { deviceId: 'd-other', date: '2026-10-20' })], me).length, 0);

console.log('\nthe toast\n');
const name = (id) => ({ bench: 'Flat bench press' }[id]);
const c1 = set('a', 10, { enteredBy: 'Chamuth', exerciseId: 'bench' });
eq('one set', alertText([c1], { now: T(10, 5), exerciseName: name }), 'Chamuth logged Flat bench press');
eq('several from one person', alertText([c1, set('b', 10, { enteredBy: 'Chamuth' })], { now: T(10, 5) }), 'Chamuth logged 2 sets');
eq('several people', alertText([c1, set('b', 10, { enteredBy: 'Test' })], { now: T(10, 5) }), '2 new sets logged');
eq('came in while hidden', alertText([c1], { away: true, now: T(10, 5), exerciseName: name }), 'While you were away: Chamuth logged Flat bench press');
eq('arrived late (connection had dropped)', alertText([c1], { now: T(10) + AWAY_AFTER_MS + 1000, exerciseName: name }), 'While you were away: Chamuth logged Flat bench press');
eq('unknown exercise', alertText([{ ...c1, exerciseId: 'gone' }], { now: T(10, 5), exerciseName: name }), 'Chamuth logged a set');

console.log('\nthe sync dot tells the truth\n');
eq('offline', syncState({ online: false, lastServerAt: T(10), now: T(10) }), 'off');
eq('server answered just now', syncState({ online: true, lastServerAt: T(10), now: T(10, 20) }), 'live');
eq('online but the server has gone quiet', syncState({ online: true, lastServerAt: T(10), now: T(10) + LIVE_WINDOW_MS + 1 }), 'wait');
eq('never heard from the server yet', syncState({ online: true, lastServerAt: 0, now: T(10) }), 'wait');

console.log('\nretrying a failed listener\n');
eq('2s, 4s, 8s', [backoff(0), backoff(1), backoff(2)], [2000, 4000, 8000]);
eq('capped at a minute', backoff(12), 60_000);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
