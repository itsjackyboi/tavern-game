import type { Content } from '../../content/schema.ts';
import { chance } from '../rng.ts';
import { drinkOf, kegCost, managerOf, modsFor, spiritweedPerKeg, tavernUpgradeSum } from '../lookup.ts';
import type { Tavern, World } from '../types.ts';
import { spend } from './ledger.ts';

// Keg ordering and delivery. Ordering spends Duckets now; kegs arrive in the
// cellar after c.economy.kegDeliveryTicks.

export type OrderResult = 'ok' | 'cash' | 'spiritweed' | 'none';

export function orderKegs(w: World, c: Content, t: Tavern, drinkId: string, kegs: number, auto = false): OrderResult {
  if (kegs <= 0) return 'none';
  const co = w.companies[t.companyId]!;
  const cost = kegCost(w, c, drinkId, t.city, co, t) * kegs;
  const weed = spiritweedPerKeg(c, drinkId) * kegs;
  if (weed > co.spiritweed) return 'spiritweed';
  // You can order into a little debt by hand, but auto-restock never borrows.
  const floor = co.isPlayer && !auto ? c.economy.bankruptcyFloor * 0.5 : 0;
  if (co.cash - cost < floor) return 'cash';
  spend(co, cost, 'kegs', 'Kegs', `${kegs}× ${drinkOf(c, drinkId).name} for ${t.name}${auto ? ' (auto-restock)' : ''}`);
  co.spiritweed -= weed;
  t.kpi.costs += cost;
  t.orders.push({ drinkId, kegs, arriveTick: w.tick + c.economy.kegDeliveryTicks });
  return 'ok';
}

function pendingKegs(t: Tavern, drinkId: string): number {
  return (t.cellar[drinkId] ?? 0) + t.orders.filter((o) => o.drinkId === drinkId).reduce((s, o) => s + o.kegs, 0);
}

/** Whether a tavern's restock policy is being carried out (players need the flagship or a manager). */
export function restockActive(w: World, t: Tavern): boolean {
  if (!t.autoRestock) return false;
  const co = w.companies[t.companyId]!;
  if (!co.isPlayer) return true;
  const flagship = Object.values(w.taverns).find((x) => x.companyId === co.id);
  return flagship?.id === t.id || managerOf(w, t) !== null;
}

/** 1 Hz: deliveries arrive; auto-restock tops each menu drink up to its target. */
export function stepOrders(w: World, c: Content): void {
  for (const t of Object.values(w.taverns)) {
    if (t.status === 'closed') continue;
    if (t.orders.length) {
      const arrived = t.orders.filter((o) => o.arriveTick <= w.tick);
      if (arrived.length) {
        for (const o of arrived) t.cellar[o.drinkId] = (t.cellar[o.drinkId] ?? 0) + o.kegs;
        t.orders = t.orders.filter((o) => o.arriveTick > w.tick);
      }
    }
    if (!restockActive(w, t)) continue;
    for (const m of t.menu.slice(0, t.taps)) {
      const tapLow = (t.tapLevels[m.drinkId] ?? 0) < c.economy.kegServings * 0.3 ? 1 : 0;
      const need = t.restockTarget + tapLow - pendingKegs(t, m.drinkId);
      if (need > 0) orderKegs(w, c, t, m.drinkId, need, true);
    }
  }
}

/** Season rollover: some cellar kegs spoil. */
export function spoilKegs(w: World, c: Content): void {
  for (const t of Object.values(w.taverns)) {
    if (t.status === 'closed') continue;
    const mods = modsFor(w, c, t);
    const rate = c.economy.spoilagePerSeason * mods.spoilage * Math.max(0.1, 1 + tavernUpgradeSum(c, t, 'spoilage'));
    for (const [d, n] of Object.entries(t.cellar)) {
      let lost = 0;
      for (let i = 0; i < n; i++) if (chance(w, 'market', rate)) lost++;
      if (lost) t.cellar[d] = n - lost;
    }
  }
}
