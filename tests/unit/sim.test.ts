import { describe, expect, it } from 'vitest';
import { Bot, PROFILES } from '../../src/bots/bot.ts';
import { loadContent } from '../../src/content/index.ts';
import { CITY_IDS } from '../../src/content/schema.ts';
import { league } from '../../src/sim/company.ts';
import { crisisHazard } from '../../src/sim/events.ts';
import { hashValue } from '../../src/sim/hash.ts';
import { player, playerTaverns } from '../../src/sim/lookup.ts';
import { REP_TRAIL_LEN, foundTavern, repTrend } from '../../src/sim/network.ts';
import { hashSeed, sfc32 } from '../../src/sim/rng.ts';
import { CLOSING_HOLD_MAX, stepWorld } from '../../src/sim/step.ts';
import { calNow, calTick, calendarAt, endTick, ticksPerYear } from '../../src/sim/time.ts';
import type { World } from '../../src/sim/types.ts';
import { createWorld, migrateWorld } from '../../src/sim/world.ts';
import { spawnPrompt } from '../../src/sim/prompts.ts';
import { intelLevel, seasonRivals } from '../../src/sim/rivals.ts';

const c = loadContent();
const fresh = (seed = 't', city: (typeof CITY_IDS)[number] = 'aleforge') => createWorld({ seed, homeCity: city }, c);
const run = (w: World, ticks: number, bot?: Bot) => {
  for (let i = 0; i < ticks; i++) stepWorld(w, c, bot ? bot.think(w, c) : []);
};

describe('world setup', () => {
  it('creates the flagship, per-city rivals and the arch-rival network', () => {
    const w = fresh();
    expect(playerTaverns(w)).toHaveLength(1);
    expect(w.floor?.tavernId).toBe(playerTaverns(w)[0]!.id);
    for (const city of c.cities) {
      const rivals = Object.values(w.taverns).filter((t) => t.city === city.id && t.companyId !== w.playerId);
      const arch = c.rivalTuning.archRival.startCities.includes(city.id) ? 1 : 0;
      expect(rivals).toHaveLength(city.rivalTaverns + arch);
    }
    const arch = Object.values(w.companies).find((co) => co.rival?.isArch);
    expect(Object.values(w.taverns).filter((t) => t.companyId === arch?.id)).toHaveLength(2);
  });

  it('is deterministic with a bot playing', () => {
    const go = () => {
      const w = fresh('det');
      run(w, 3000, new Bot(PROFILES.skilled!));
      return hashValue(w);
    };
    expect(go()).toBe(go());
  });
});

describe('the floor', () => {
  it('seating, serving and paying: a skilled bot earns money in its first season', () => {
    const w = fresh('floor');
    const start = player(w).cash;
    run(w, 1300, new Bot(PROFILES.skilled!));
    const t = playerTaverns(w)[0]!;
    expect(t.kpi.served + (t.lastKpi?.served ?? 0)).toBeGreaterThan(8);
    expect(player(w).ledger.revenue).toBeGreaterThan(40);
    expect(Number.isFinite(player(w).cash)).toBe(true);
    void start;
  });

  it('seat command puts a waiting patron at a clean table', () => {
    const w = fresh('seat');
    let p;
    for (let i = 0; i < 2000 && !p; i++) {
      stepWorld(w, c, []);
      p = w.floor!.patrons.find((x) => x.state === 'waiting');
    }
    expect(p).toBeTruthy();
    const table = w.floor!.tables.find((tb) => !tb.dirty && !tb.seats[0])!;
    stepWorld(w, c, [{ type: 'seat', patronId: p!.id, tableId: table.id }]);
    const moved = w.floor!.patrons.find((x) => x.id === p!.id)!;
    expect(['toSeat', 'seated', 'ordered']).toContain(moved.state);
    expect(table.seats).toContain(p!.id);
  });

  it('an idle owner with no staff serves nobody (delegation needs staff)', () => {
    const w = fresh('idle');
    run(w, 1300);
    const t = playerTaverns(w)[0]!;
    expect(t.lastKpi?.served ?? t.kpi.served).toBe(0);
  });
});

describe('last call and closing time', () => {
  const inside = (w: World) => w.floor!.patrons.filter((p) => ['toSeat', 'seated', 'ordered', 'drinking'].includes(p.state));
  const toLastCall = (w: World, bot: Bot) => {
    while (calNow(w, c.time).phase !== 'lastCall') stepWorld(w, c, bot.think(w, c).filter((cmd) => cmd.type !== 'ringBell'));
    while (inside(w).length === 0 && calNow(w, c.time).phase === 'lastCall') stepWorld(w, c, bot.think(w, c).filter((cmd) => cmd.type !== 'ringBell'));
  };

  it('the bell closes the doors, and the season waits until the last orders are served', () => {
    const w = fresh('bell');
    const bot = new Bot(PROFILES.skilled!);
    toLastCall(w, bot);
    stepWorld(w, c, [{ type: 'ringBell' }]);
    expect(w.floor!.lastCallRung).toBe(true);
    expect(w.floor!.patrons.some((p) => p.state === 'waiting')).toBe(false);
    const staying = inside(w).map((p) => p.id);
    expect(staying.length).toBeGreaterThan(0);
    const season = calNow(w, c.time).segment;
    // Serve them out: the calendar may not move on while any of them is inside.
    let guard = 0;
    while (calNow(w, c.time).segment === season && guard++ < 5000) {
      stepWorld(w, c, bot.think(w, c));
      if (calNow(w, c.time).segment !== season) expect(w.floor!.patrons.filter((p) => staying.includes(p.id) && p.state !== 'leaving')).toHaveLength(0);
    }
    expect(w.clockHold ?? 0).toBeGreaterThan(0);
    expect(w.floor!.patrons.some((p) => staying.includes(p.id))).toBe(false);
  });

  it('without the bell, closing time still waits, and stragglers are fined', () => {
    const w = fresh('nobell');
    const bot = new Bot(PROFILES.skilled!);
    toLastCall(w, bot);
    const before = inside(w).length;
    while (calNow(w, c.time).phase === 'lastCall' && (w.clockHold ?? 0) === 0) stepWorld(w, c, []);
    if (before > 3) expect(player(w).flows['Fines'] ?? 0).toBeLessThan(0);
    expect(w.floor!.lastCallRung || inside(w).length === 0).toBe(true);
  });

  it('the wait is capped, so the game can never stall', () => {
    const w = fresh('stall');
    const bot = new Bot(PROFILES.skilled!);
    toLastCall(w, bot);
    // Patrons who will never finish on their own.
    for (const p of inside(w)) { p.state = 'drinking'; p.timer = 1e9; }
    const season = calNow(w, c.time).segment;
    run(w, CLOSING_HOLD_MAX + c.time.lastCallTicks + 50);
    expect(calNow(w, c.time).segment).not.toBe(season);
    expect(inside(w)).toHaveLength(0);
  });
});

describe('where the money goes', () => {
  it('every Duckets movement is filed under a reason, and the reasons add up to the cash change', () => {
    const w = fresh('money');
    const me = player(w);
    const start = me.cash;
    const bot = new Bot(PROFILES.skilled!);
    // Run a calendar year (closing time can hold the calendar, so count calendar ticks).
    while (calTick(w) < ticksPerYear(c.time) + 20) stepWorld(w, c, bot.think(w, c));
    const net = Object.values(me.flows).reduce((a, b) => a + b, 0);
    expect(Math.abs(start + net - me.cash)).toBeLessThan(0.01);
    expect(me.flows['Drink sales']).toBeGreaterThan(0);
    expect(me.flows['Rent']).toBeLessThan(0);
    expect(me.recent.every((e) => e.key !== 'Drink sales')).toBe(true);
    // A year closed: one bar for the chart, whose profit is income minus spending.
    expect(me.yearHistory).toHaveLength(1);
    const y = me.yearHistory[0]!;
    expect(y.year).toBe(c.time.startYear);
    expect(y.profit).toBeCloseTo(y.income - y.spending);
  });

  it('auto-restock never borrows', () => {
    const w = fresh('broke');
    const me = player(w);
    me.cash = 5;
    run(w, 400);
    expect(me.cash).toBeGreaterThanOrEqual(0);
  });

  it('answering a decision leaves a receipt of what it did', () => {
    const w = fresh('receipt');
    const t = playerTaverns(w)[0]!;
    const p = spawnPrompt(w, c, 'hall-contest', { tavernId: t.id })!;
    stepWorld(w, c, [{ type: 'answer', uid: p.uid, option: 0 }]);
    const o = w.prompts.outcomes.at(-1)!;
    expect(o.option).toBe('Enter');
    expect(o.parts).toContain('−50 Duckets');
    expect(o.parts.some((x) => x.startsWith('Reputation'))).toBe(true);
    expect(player(w).recent.at(-1)).toMatchObject({ key: 'Decisions', amount: -50 });
  });

  it('old saves gain the money trail when loaded', () => {
    const w = fresh('old') as World & { meta: { v: number } };
    const me = player(w) as unknown as Record<string, unknown>;
    delete me.flows; delete me.flowsYear; delete me.recent; delete me.moneySeq; delete me.yearHistory;
    delete (w.prompts as unknown as Record<string, unknown>).outcomes;
    const m = migrateWorld(w, 2)!;
    expect(player(m).flows).toEqual({});
    expect(m.prompts.outcomes).toEqual([]);
    expect(m.meta.v).toBe(3);
    run(m, 50);
  });
});

describe('brewing bench', () => {
  it('a known pair discovers its recipe; an unknown pair is crossed off', () => {
    const w = fresh('brew');
    const me = player(w);
    const r = stepWorld(w, c, [{ type: 'research', a: 'hops', b: 'barley' }]);
    expect(r[0]?.result).toBe('found');
    expect(me.unlocked).toContain('hall-amber');
    const r2 = stepWorld(w, c, [{ type: 'research', a: 'hops', b: 'spice' }]);
    expect(r2[0]?.result).toBe('nothing');
    expect(w.research.tried).toContain('hops+spice');
  });
});

describe('calendar bookkeeping', () => {
  it('each season closes exactly once a year; the end of the Holiday Keg closes the year, not another season', () => {
    const w = fresh('seasons');
    while (calTick(w) < ticksPerYear(c.time) + 5) stepWorld(w, c, []);
    expect(w.events.seasonsClosed).toBe(3);
    expect(player(w).yearHistory).toHaveLength(1);
  });
});

describe('intel', () => {
  const rivalLines = (w: World) => w.log.filter((l) => l.kind === 'intel' || /Informant:/.test(l.text));
  it('without an informant you hear nothing specific about rivals', () => {
    const w = fresh('nointel');
    run(w, ticksPerYear(c.time) * 2, new Bot(PROFILES.average!));
    expect(w.log.filter((l) => l.kind === 'intel')).toHaveLength(0);
  });

  it('a master informant brings seasonal reports with the rivals’ purses', () => {
    const w = fresh('master');
    const t = playerTaverns(w)[0]!;
    player(w).cash = 5000;
    stepWorld(w, c, [{ type: 'hire', tavernId: t.id, archetype: 'informant', tier: 'master' }]);
    expect(intelLevel(w, t.city).level).toBe(3);
    seasonRivals(w, c);
    const reports = rivalLines(w).filter((l) => /Informant: .* holds about \d+ Duckets/.test(l.text));
    expect(reports.length).toBeGreaterThan(0);
  });

  it('an informant elsewhere counts one level lower', () => {
    const w = fresh('elsewhere');
    const t = playerTaverns(w)[0]!;
    player(w).cash = 5000;
    stepWorld(w, c, [{ type: 'hire', tavernId: t.id, archetype: 'informant', tier: 'seasoned' }]);
    const other = c.cities.find((x) => x.id !== t.city)!.id;
    expect(intelLevel(w, other).level).toBe(1);
  });
});

describe('win and loss', () => {
  it('monopoly: 2x the next-biggest company wins instantly (after the grace period)', () => {
    const w = fresh('mono');
    run(w, 20);
    player(w).cash = 1e6;
    run(w, 40);
    expect(w.run.status).toBe('playing'); // still in the grace period
    run(w, c.economy.monopolyGraceSeasons * 1300);
    expect(w.run.status).toBe('won');
    expect(w.run.winType).toBe('monopoly');
    expect(w.run.splits.monopoly).not.toBeNull();
  });

  it('the Year-463 verdict: not established in all four cities means another sponsor is chosen', () => {
    const w = fresh('verdict');
    w.tick = endTick(c.time) - 30;
    run(w, 60);
    expect(w.run.verdictDone).toBe(true);
    expect(w.run.status).toBe('lost');
    stepWorld(w, c, [{ type: 'freeplay' }]);
    expect(w.run.status).toBe('freeplay');
    const t0 = w.tick;
    run(w, 40);
    expect(w.tick).toBeGreaterThan(t0);
  });

  it('bankruptcy after a season below the floor with no credit', () => {
    const w = fresh('broke');
    for (const t of Object.values(w.taverns)) if (t.companyId === w.playerId) t.assetValue = 0;
    player(w).cash = -5000;
    run(w, 1300 * 2 + 40);
    expect(w.run.status).toBe('bankrupt');
  });

  it('founding a sister needs cash and reputation, then opens after a season', () => {
    const w = fresh('found');
    expect(foundTavern(w, c, 'shanty')).toBe('cash');
    player(w).cash = 5000;
    expect(foundTavern(w, c, 'aleforge')).toBe('owned');
    expect(foundTavern(w, c, 'shanty')).toBe('ok');
    const sister = playerTaverns(w).find((t) => t.city === 'shanty')!;
    expect(sister.status).toBe('building');
    run(w, 1320);
    expect(sister.status).not.toBe('building');
  });
});

describe('reputation trend', () => {
  it('keeps about a minute of samples and reports which way reputation is heading', () => {
    const w = fresh('trend');
    const t = playerTaverns(w)[0]!;
    run(w, 3000);
    expect(t.repTrail!.length).toBe(REP_TRAIL_LEN);
    t.repTrail = Array(REP_TRAIL_LEN).fill(30);
    t.rep = 34;
    expect(repTrend(t)).toBeCloseTo(4);
    t.rep = 27;
    expect(repTrend(t)).toBeCloseTo(-3);
  });
});

describe('crisis roller', () => {
  it('a typical 48-season run sees 2-3 crises', () => {
    const s = hashSeed('monte');
    const counts: number[] = [];
    for (let run = 0; run < 5000; run++) {
      let fired = 0;
      let last = -100;
      for (let shift = 0; shift < 48; shift++) {
        if (sfc32(s) < crisisHazard(c, shift, last, fired)) {
          fired++;
          last = shift;
        }
      }
      counts.push(fired);
    }
    const p = (k: (n: number) => boolean) => counts.filter(k).length / counts.length;
    expect(p((n) => n >= 2 && n <= 3)).toBeGreaterThan(0.6);
    expect(p((n) => n === 0)).toBeLessThan(0.03);
    expect(p((n) => n > c.events.crisisMaxPerRun)).toBe(0);
  });
});

describe('rivals', () => {
  it('rivals stay solvent-ish and the league stays sorted over two years', () => {
    const w = fresh('rivals');
    run(w, ticksPerYear(c.time) * 2, new Bot(PROFILES.skilled!));
    const l = league(w);
    for (let i = 1; i < l.length; i++) expect(l[i - 1]!.cv).toBeGreaterThanOrEqual(l[i]!.cv);
    const open = Object.values(w.taverns).filter((t) => t.status !== 'closed' && t.companyId !== w.playerId);
    expect(open.length).toBeGreaterThan(8);
    expect(w.log.length).toBeGreaterThan(5);
  });
});
