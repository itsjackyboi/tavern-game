// Quick headless run for inspecting the economy: npx tsx tools/headless.ts [years] [city] [seed]
import { loadContent } from '../src/content/index.ts';
import { league } from '../src/sim/company.ts';
import { player } from '../src/sim/lookup.ts';
import { stepWorld } from '../src/sim/step.ts';
import { calendarAt, ticksPerYear } from '../src/sim/time.ts';
import { createWorld } from '../src/sim/world.ts';
import type { CityId } from '../src/content/schema.ts';

const c = loadContent();
const years = Number(process.argv[2] ?? 2);
const city = (process.argv[3] ?? 'aleforge') as CityId;
const w = createWorld({ seed: process.argv[4] ?? 'headless', homeCity: city }, c);
const t0 = performance.now();
for (let i = 0; i < years * ticksPerYear(c.time); i++) {
  stepWorld(w, c, []);
  if (i % ticksPerYear(c.time) === ticksPerYear(c.time) - 1) {
    const cal = calendarAt(w.tick - (w.clockHold ?? 0), c.time);
    console.log(`--- Year ${cal.year} status=${w.run.status}`);
    for (const co of league(w).slice(0, 8)) {
      const ts = Object.values(w.taverns).filter((t) => t.companyId === co.id && t.status !== 'closed');
      console.log(`${co.isPlayer ? '*' : ' '} ${co.name.padEnd(28)} cv=${String(co.cv).padStart(6)} cash=${Math.round(co.cash).toString().padStart(6)} py=${Math.round(co.profitYear)} ${ts.map((t) => `${t.city}:${Math.round(t.rep)}/${t.status[0]}`).join(' ')}`);
    }
  }
}
const me = player(w);
console.log('player cash', Math.round(me.cash), 'cv', me.cv, 'prompts', w.prompts.active.length, 'missed', w.prompts.missed);
console.log('log tail:', w.log.slice(-8).map((l) => l.text));
console.log(`${((performance.now() - t0) / 1000).toFixed(2)}s for ${years} years`);
