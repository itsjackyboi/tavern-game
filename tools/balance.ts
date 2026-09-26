// Headless balance runs: npx tsx tools/balance.ts [profile] [seeds] [city|all]
// Plays full runs with a bot and reports milestone times against docs/PLAN.md targets.
import { Bot, PROFILES } from '../src/bots/bot.ts';
import { loadContent } from '../src/content/index.ts';
import { CITY_IDS, type CityId } from '../src/content/schema.ts';
import { league } from '../src/sim/company.ts';
import { player } from '../src/sim/lookup.ts';
import { stepWorld } from '../src/sim/step.ts';
import { calendarAt, endTick } from '../src/sim/time.ts';
import { createWorld } from '../src/sim/world.ts';

const c = loadContent();

export interface RunReport {
  city: CityId;
  seed: string;
  status: string;
  winType: string | null;
  minutes: number;
  firstSister: number | null;
  thirdSister: number | null;
  firstNo1: number | null;
  monopoly: number | null;
  finalCV: number;
  nextCV: number;
  sisters: number;
  crises: number;
  brawls: number;
}

const mins = (tick: number | null) => (tick === null ? null : Math.round((tick / 20 / 60) * 10) / 10);

export function playRun(profileName: string, city: CityId, seed: string, maxTicks = endTick(c.time) + 20): RunReport {
  const w = createWorld({ seed, homeCity: city }, c);
  const bot = new Bot(PROFILES[profileName]!);
  let brawls = 0;
  const trace = process.env.TRACE === '1';
  let lastYear = -1;
  while (w.tick < maxTicks) {
    const cmds = bot.think(w, c);
    stepWorld(w, c, cmds);
    if (trace) {
      const cal = calendarAt(w.tick, c.time);
      if (cal.year !== lastYear) {
        lastYear = cal.year;
        const me = player(w);
        const top = league(w).filter((co) => co.id !== me.id).slice(0, 2);
        const mine = Object.values(w.taverns).filter((t) => t.companyId === me.id && t.status !== 'closed');
        console.log(`  Y${cal.year} cash ${Math.round(me.cash)} cv ${me.cv} py ${Math.round(me.profitYear)} ledger ${JSON.stringify(Object.fromEntries(Object.entries(me.lastLedger ?? {}).map(([k, v]) => [k, Math.round(v as number)])))} taverns ${mine.map((t) => `${t.city}:${Math.round(t.rep)}:${t.tables}t:${t.status[0]}`).join(' ')} | ${top.map((co) => `${co.name} ${co.cv} (${Object.values(w.taverns).filter((t) => t.companyId === co.id && t.status !== 'closed').length})`).join(', ')}`);
      }
    }
    if (w.run.status !== 'playing') break;
  }
  for (const t of Object.values(w.taverns)) if (t.companyId === w.playerId) brawls += t.kpi.brawls + (t.lastKpi?.brawls ?? 0);
  const me = player(w);
  const next = league(w).find((co) => co.id !== me.id);
  const r = w.run;
  return {
    city, seed, status: r.status, winType: r.winType, minutes: mins(w.tick)!,
    firstSister: mins(r.splits.firstSister), thirdSister: mins(r.splits.thirdSister), firstNo1: mins(r.splits.firstNo1), monopoly: mins(r.splits.monopoly),
    finalCV: me.cv, nextCV: next?.cv ?? 0,
    sisters: Object.values(w.taverns).filter((t) => t.companyId === me.id && t.status === 'established' && t.city !== city).length,
    crises: w.events.crisesFired.length, brawls: Math.round(brawls),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = process.argv[2] ?? 'skilled';
  const seeds = Number(process.argv[3] ?? 2);
  const cityArg = process.argv[4] ?? 'all';
  const cities = cityArg === 'all' ? CITY_IDS : [cityArg as CityId];
  const rows: RunReport[] = [];
  for (const city of cities) {
    for (let s = 0; s < seeds; s++) {
      const t0 = performance.now();
      const r = playRun(profile, city, `bal-${s}`);
      rows.push(r);
      console.log(`${profile} ${city.padEnd(10)} seed ${s}: ${r.status}/${r.winType ?? '-'} at ${r.minutes}m  sister1 ${r.firstSister}m sister3 ${r.thirdSister}m #1 ${r.firstNo1}m mono ${r.monopoly}m  cv ${r.finalCV} vs ${r.nextCV}  crises ${r.crises} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  const wins = rows.filter((r) => r.status === 'won').length;
  console.log(`\n${profile}: ${wins}/${rows.length} wins, monopolies ${rows.filter((r) => r.winType === 'monopoly').length}`);
  void calendarAt;
}
