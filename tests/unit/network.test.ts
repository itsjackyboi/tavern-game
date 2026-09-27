import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import { hashValue } from '../../src/sim/hash.ts';
import { player, playerTaverns, staffAt } from '../../src/sim/lookup.ts';
import { closeTavern } from '../../src/sim/network.ts';
import { serviceCapacity } from '../../src/sim/aggregate.ts';
import { PACE_PER_TAVERN, PACE_RAMP_START, sisterRamp, updateDemand } from '../../src/sim/economy/market.ts';
import { stepWorld } from '../../src/sim/step.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { Tavern, World } from '../../src/sim/types.ts';
import { createWorld } from '../../src/sim/world.ts';
import { calNow } from '../../src/sim/time.ts';

const c = loadContent();
const run = (w: World, ticks: number, cmds: Command[] = []) => {
  for (let i = 0; i < ticks; i++) stepWorld(w, c, i === 0 ? cmds : []);
};

/** A world with the flagship in Aleforge and an open sister in Shanty Town. */
function withSister(seed = 'sis'): { w: World; home: Tavern; sis: Tavern } {
  const w = createWorld({ seed, homeCity: 'aleforge' }, c);
  player(w).cash = 6000;
  const home = playerTaverns(w)[0]!;
  home.rep = 60;
  run(w, 1, [{ type: 'found', city: 'shanty' }]);
  run(w, 1320);
  const sis = playerTaverns(w).find((t) => t.city === 'shanty')!;
  return { w, home, sis };
}

describe('moving staff between your taverns', () => {
  it('moves a staff member for a small fee, but never a manager', () => {
    const { w, home, sis } = withSister();
    const mover = staffAt(w, sis.id)[0]!;
    const before = [staffAt(w, home.id).length, staffAt(w, sis.id).length];
    const cash = player(w).cash;
    run(w, 1, [{ type: 'transferStaff', staffId: mover.id, tavernId: home.id }]);
    expect(staffAt(w, home.id).length).toBe(before[0]! + 1);
    expect(staffAt(w, sis.id).length).toBe(before[1]! - 1);
    expect(player(w).cash).toBeLessThan(cash);
    const mgr = sis.managerId!;
    run(w, 1, [{ type: 'transferStaff', staffId: mgr, tavernId: home.id }]);
    expect(w.staff[mgr]!.tavernId).toBe(sis.id);
  });
});

describe('supply lines', () => {
  it('ships the source’s surplus when the destination runs low', () => {
    const { w, home, sis } = withSister();
    const drink = home.menu[0]!.drinkId;
    home.cellar[drink] = home.restockTarget + 5;
    sis.cellar[drink] = 0;
    run(w, 1, [{ type: 'addSupplyLine', fromId: home.id, toId: sis.id, drinkId: drink, keepAt: 3, insured: false }]);
    run(w, 120);
    expect(w.shipments.some((s) => s.toId === sis.id && s.drinkId === drink)).toBe(true);
  });

  it('buys at the source when it has nothing spare, but never on credit', () => {
    const { w, home, sis } = withSister('buy');
    const drink = home.menu[0]!.drinkId;
    home.autoRestock = false;
    home.cellar[drink] = 0;
    home.orders = [];
    sis.cellar[drink] = 0;
    run(w, 1, [{ type: 'addSupplyLine', fromId: home.id, toId: sis.id, drinkId: drink, keepAt: 3, insured: false }]);
    run(w, 120);
    expect(home.orders.some((o) => o.drinkId === drink)).toBe(true);
    expect(w.supplyLines![0]!.bought).toBeGreaterThan(0);

    const broke = withSister('broke');
    const d2 = broke.home.menu[0]!.drinkId;
    broke.home.autoRestock = false;
    broke.home.cellar[d2] = 0;
    broke.home.orders = [];
    broke.sis.cellar[d2] = 0;
    player(broke.w).cash = 0;
    run(broke.w, 1, [{ type: 'addSupplyLine', fromId: broke.home.id, toId: broke.sis.id, drinkId: d2, keepAt: 3, insured: false }]);
    run(broke.w, 120);
    expect(broke.home.orders.some((o) => o.drinkId === d2)).toBe(false);
  });

  it('drops a line whose tavern closes', () => {
    const { w, home, sis } = withSister('drop');
    run(w, 1, [{ type: 'addSupplyLine', fromId: home.id, toId: sis.id, drinkId: home.menu[0]!.drinkId, keepAt: 2, insured: false }]);
    expect(w.supplyLines).toHaveLength(1);
    closeTavern(w, sis, 'neglect');
    run(w, 120);
    expect(w.supplyLines).toHaveLength(0);
  });

  it('stays deterministic with a line running', () => {
    const go = () => {
      const { w, home, sis } = withSister('det');
      run(w, 1, [{ type: 'addSupplyLine', fromId: home.id, toId: sis.id, drinkId: home.menu[0]!.drinkId, keepAt: 4, insured: true }]);
      run(w, 2000);
      return hashValue(w);
    };
    expect(go()).toBe(go());
  });
});

describe('season report data', () => {
  it('remembers each tavern’s reputation at the start of the season', () => {
    const { w, sis } = withSister('rep');
    run(w, 1400);
    expect(sis.repAtSeasonStart).toBeTypeOf('number');
  });
});

describe('pace as you grow', () => {
  it('the flagship keeps its attention (and a stand-in at the bar) while you tend a sister', () => {
    const { w, home, sis } = withSister('pace-flag');
    run(w, 1, [{ type: 'focus', tavernId: sis.id }]);
    run(w, 1500);
    expect(home.attention).toBe(1);
    expect(serviceCapacity(w, c, home)).toBeGreaterThan(0.2);
  });

  it('a new sister builds up toward the flagship’s pace, and more taverns mean more patrons', () => {
    const { w, home, sis } = withSister('pace-ramp');
    // Freshly opened: at least the starting share of the flagship's pace.
    updateDemand(w, c);
    if (sis.status !== 'struggling' && sis.demand.rate > 0) {
      expect(sis.demand.rate).toBeGreaterThanOrEqual(home.demand.rate * sisterRamp(w, c, sis) - 1e-9);
      expect(sisterRamp(w, c, sis)).toBeGreaterThanOrEqual(PACE_RAMP_START);
    }
    expect(sisterRamp(w, c, sis)).toBeLessThan(1);
    // Word of mouth: the flagship draws more with a sister open than it would alone.
    const withSis = home.demand.rate;
    const saved = sis.status;
    sis.status = 'closed';
    updateDemand(w, c);
    const alone = home.demand.rate;
    sis.status = saved;
    expect(withSis).toBeCloseTo(alone * (1 + PACE_PER_TAVERN), 6);
    // Two seasons later the ramp is complete.
    run(w, 2 * 1300 + 200);
    expect(sisterRamp(w, c, sis)).toBe(1);
  });
});

describe('switching taverns', () => {
  it('drops you straight into a busy floor: drinks wanted, a line at the door, and the line kept when you leave', () => {
    const { w, home, sis } = withSister('switch');
    // Wait for a moment when the doors are open and not at Last Call.
    for (let i = 0; i < 2000 && (calNow(w, c.time).phase === 'lastCall' || sis.demand.rate < 0.1); i++) run(w, 1);
    run(w, 1, [{ type: 'focus', tavernId: sis.id }]);
    const f = w.floor!;
    expect(f.tavernId).toBe(sis.id);
    expect(f.patrons.filter((p) => p.state === 'ordered').length).toBeGreaterThan(0);
    expect(f.patrons.filter((p) => p.state === 'waiting').length).toBeGreaterThan(0);
    // Leave: the line isn't counted as walkouts, it's kept for when you return.
    const walkouts = sis.kpi.walkouts;
    run(w, 1, [{ type: 'focus', tavernId: home.id }]);
    expect(sis.kpi.walkouts).toBe(walkouts);
    expect(sis.agg.queue ?? 0).toBeGreaterThan(0);
  });
});
