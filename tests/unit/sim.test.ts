import { describe, expect, it } from 'vitest';
import { Bot, PROFILES } from '../../src/bots/bot.ts';
import { loadContent } from '../../src/content/index.ts';
import { CITY_IDS } from '../../src/content/schema.ts';
import { league } from '../../src/sim/company.ts';
import { crisisHazard } from '../../src/sim/events.ts';
import { hashValue } from '../../src/sim/hash.ts';
import { player, playerTaverns } from '../../src/sim/lookup.ts';
import { foundTavern } from '../../src/sim/network.ts';
import { hashSeed, sfc32 } from '../../src/sim/rng.ts';
import { stepWorld } from '../../src/sim/step.ts';
import { endTick, ticksPerYear } from '../../src/sim/time.ts';
import type { World } from '../../src/sim/types.ts';
import { createWorld } from '../../src/sim/world.ts';

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
