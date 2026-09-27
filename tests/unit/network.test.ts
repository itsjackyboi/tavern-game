import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import { hashValue } from '../../src/sim/hash.ts';
import { player, playerTaverns, staffAt } from '../../src/sim/lookup.ts';
import { closeTavern } from '../../src/sim/network.ts';
import { stepWorld } from '../../src/sim/step.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { Tavern, World } from '../../src/sim/types.ts';
import { createWorld } from '../../src/sim/world.ts';

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
