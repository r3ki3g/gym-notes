// Every test suite. `npm test`
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const suites = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const s of suites) {
  const r = spawnSync('node', [`test/${s}`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) FAILED\n` : `\nall ${suites.length} suite(s) passed\n`);
process.exit(failed ? 1 : 0);
