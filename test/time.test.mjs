import { fmtTime, fmtSpan, dayLabel, fmtDate } from '../js/ui.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got "${got}" want "${want}"`);
  ok ? pass++ : fail++;
};
const at = (iso) => new Date(iso).getTime();

console.log('\nfmtTime — 12-hour regardless of the device locale\n');
eq('afternoon',            fmtTime(at('2026-09-21T17:12:34')), '5:12 PM');
eq('with seconds',         fmtTime(at('2026-09-21T17:12:34'), true), '5:12:34 PM');
eq('midnight is 12 AM',    fmtTime(at('2026-09-21T00:03:09')), '12:03 AM');
eq('noon is 12 PM',        fmtTime(at('2026-09-21T12:00:00')), '12:00 PM');
eq('single-digit minute padded', fmtTime(at('2026-09-21T09:05:00')), '9:05 AM');
eq('single-digit second padded', fmtTime(at('2026-09-21T09:05:07'), true), '9:05:07 AM');
eq('null is blank, not "Invalid Date"', fmtTime(null), '');
eq('0 is blank',           fmtTime(0), '');

console.log('\nfmtSpan — session length\n');
eq('minutes only',     fmtSpan(48 * 60000), '48m');
eq('exact hour drops the minutes', fmtSpan(60 * 60000), '1h');
eq('hours and minutes', fmtSpan((2 * 60 + 52) * 60000), '2h 52m');
eq('two hours exactly', fmtSpan(120 * 60000), '2h');
eq('a few minutes',     fmtSpan(3 * 60000), '3m');
eq('zero',              fmtSpan(0), '0m');
eq('negative clamps',   fmtSpan(-5000), '0m');
eq('null',              fmtSpan(null), '0m');

console.log('\nfmtDate — MM/DD/YY\n');
eq('09/20/26', fmtDate('2026-09-20'), '09/20/26');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
