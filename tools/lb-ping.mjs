// Sends one clearly-labelled test run to the shared leaderboard, then redraws
// the record tabs and prints the pre-release boards. Run by the "Leaderboard
// test run" workflow (Actions → Run workflow), or locally: node tools/lb-ping.mjs [lost|monopoly]
// A "lost" test run is logged on the `runs` tab only and never ranked.
import { readFileSync } from 'node:fs';

const url = /LEADERBOARD_URL = '([^']*)'/.exec(readFileSync('src/leaderboard/config.ts', 'utf8'))?.[1];
const version = /APP_VERSION = '([^']*)'/.exec(readFileSync('src/version.ts', 'utf8'))?.[1];
if (!url) throw new Error('No LEADERBOARD_URL in src/leaderboard/config.ts');
const result = process.argv[2] === 'monopoly' ? 'monopoly' : 'lost';

const stamp = Date.now().toString(36);
const rec = {
  runId: `test-${stamp}`,
  clientId: `test-ping-${stamp}`,
  name: 'TestRun',
  tavernName: 'Test Ping Tavern',
  homeCity: 'aleforge',
  category: 'standard',
  result,
  monopolyMs: result === 'monopoly' ? 45 * 60 * 1000 : null,
  finalCV: 1234,
  peakCV: 1500,
  splits: { firstSisterMs: null, thirdSisterMs: null, firstNo1Ms: null },
  simMs: 50 * 60 * 1000,
  realMs: 51 * 60 * 1000,
  pauses: 0,
  sessions: 1,
  seed: 'test-ping',
  version,
  contentHash: 'test',
  date: new Date().toISOString(),
};

async function call(u, init) {
  const res = await fetch(u, { redirect: 'follow', ...init });
  const text = await res.text();
  console.log(`${init?.method ?? 'GET'} ${u.replace(/\/s\/[^/]+\//, '/s/…/')} → ${res.status}\n${text.slice(0, 800)}\n`);
  return text;
}

console.log(`Sending a ${result} test run as ${rec.name} / ${rec.tavernName} (${version}, runId ${rec.runId})\n`);
const posted = await call(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) });
await call(`${url}?rebuild=1`);
await call(`${url}?era=pre`);
if (!/"ok"\s*:\s*true/.test(posted)) {
  console.error('The sheet did not accept the test run (see the reply above).');
  process.exit(1);
}
