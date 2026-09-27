import type { CityId, Content } from '../content/schema.ts';
import { spend, track } from './economy/ledger.ts';
import { log, rumor } from './log.ts';
import { cityOf, clamp, drinkOf, kegCost, modsFor, newId, player, upgradeCount } from './lookup.ts';
import { chance } from './rng.ts';
import { calNow } from './time.ts';
import { orderKegs } from './economy/orders.ts';
import type { SupplyLine, World } from './types.ts';

// Moving kegs between your own taverns: arbitrage across price boards, at the
// mercy of Stormtide seas and pirates (who never touch Roto's cargo).

export function travelTicks(c: Content, a: CityId, b: CityId, tunnels: boolean): number {
  const ca = cityOf(c, a).map;
  const cb = cityOf(c, b).map;
  const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  let t = 200 + d * 1800;
  if (tunnels && (a === 'aleforge' || b === 'aleforge')) t /= 3;
  return Math.round(t);
}

export function lossChance(w: World, c: Content, a: CityId, b: CityId): number {
  const me = player(w);
  if (upgradeCount(me, 'ofern-tunnels') && (a === 'aleforge' || b === 'aleforge')) return 0;
  const cal = calNow(w, c.time);
  const mods = modsFor(w, c, { id: '', city: a, companyId: me.id });
  let p = cal.segment === 'stormtide' ? 0.1 : 0.03;
  if (a !== 'roto' && b !== 'roto') p += clamp(0.08 * (1 - w.institutions.windsunk / 40), 0, 0.12);
  p += mods.shippingLoss;
  return clamp(p, 0, 0.7);
}

export const INSURANCE_RATE = 0.12;

export type ShipResult = 'ok' | 'same' | 'stock' | 'cash' | 'bad';

export function ship(w: World, c: Content, fromId: string, toId: string, drinkId: string, kegs: number, insured: boolean): ShipResult {
  const from = w.taverns[fromId];
  const to = w.taverns[toId];
  const me = player(w);
  if (!from || !to || from.companyId !== me.id || to.companyId !== me.id || kegs <= 0) return 'bad';
  if (from.id === to.id) return 'same';
  if ((from.cellar[drinkId] ?? 0) < kegs) return 'stock';
  const value = kegCost(w, c, drinkId, from.city, me, from) * kegs;
  const premium = insured ? Math.round(value * INSURANCE_RATE) : 0;
  if (me.cash < premium) return 'cash';
  if (premium) spend(me, premium, 'other', 'Shipping', 'Voyage Wager insurance');
  from.cellar[drinkId] = (from.cellar[drinkId] ?? 0) - kegs;
  const tunnels = upgradeCount(me, 'ofern-tunnels') > 0;
  w.shipments.push({
    id: newId(w, 'sh'), fromId, toId, drinkId, kegs, departTick: w.tick,
    arriveTick: w.tick + travelTicks(c, from.city, to.city, tunnels), insured, value, lost: false,
  });
  // Losses are rolled at departure so the outcome is fixed (and replayable).
  const sh = w.shipments[w.shipments.length - 1]!;
  sh.lost = chance(w, 'shipping', lossChance(w, c, from.city, to.city));
  return 'ok';
}

export function stepShipping(w: World, c: Content): void {
  if (!w.shipments.length) return;
  const me = player(w);
  const done = w.shipments.filter((s) => s.arriveTick <= w.tick);
  if (!done.length) return;
  w.shipments = w.shipments.filter((s) => s.arriveTick > w.tick);
  for (const s of done) {
    const to = w.taverns[s.toId];
    if (!to || to.status === 'closed') continue;
    if (s.lost) {
      rumor(w, c, 'shipLost', to.city);
      if (s.insured) {
        me.cash += s.value;
        track(me, s.value, 'Shipping', 'Voyage Wager payout for a lost cargo');
        log(w, 'news', `Voyage Wager pays out ${Math.round(s.value)} Duckets.`, to.city);
      }
      continue;
    }
    to.cellar[s.drinkId] = (to.cellar[s.drinkId] ?? 0) + s.kegs;
    if (!to.menu.some((m) => m.drinkId === s.drinkId) && to.menu.length < to.taps) to.menu.push({ drinkId: s.drinkId, price: 1 });
    log(w, 'news', `${s.kegs} keg${s.kegs > 1 ? 's' : ''} arrive at ${to.name}.`, to.city);
  }
}

// Supply lines: standing orders to keep a sister stocked from another of your
// taverns. Every 5 s each line tops its destination up to keepAt, shipping the
// source's surplus, or buying at the source (never on credit) when it has none.

export const SUPPLY_EVERY = 100;
export const SUPPLY_BATCH = 3;

export type SupplyResult = 'ok' | 'bad' | 'same' | 'drink' | 'dupe';

export function addSupplyLine(w: World, fromId: string, toId: string, drinkId: string, keepAt: number, insured: boolean): SupplyResult {
  const from = w.taverns[fromId];
  const to = w.taverns[toId];
  const me = player(w);
  if (!from || !to || from.companyId !== me.id || to.companyId !== me.id || from.status === 'closed' || to.status === 'closed') return 'bad';
  if (from.id === to.id) return 'same';
  if (!me.unlocked.includes(drinkId)) return 'drink';
  const lines = (w.supplyLines ??= []);
  if (lines.some((l) => l.fromId === fromId && l.toId === toId && l.drinkId === drinkId)) return 'dupe';
  lines.push({ id: newId(w, 'sl'), fromId, toId, drinkId, keepAt: clamp(Math.round(keepAt), 1, 12), insured, bought: 0 });
  return 'ok';
}

export function removeSupplyLine(w: World, id: string): void {
  if (w.supplyLines) w.supplyLines = w.supplyLines.filter((l) => l.id !== id);
}

/** Kegs of a drink already at sea toward a tavern. */
export function kegsAtSea(w: World, toId: string, drinkId: string): number {
  return w.shipments.filter((s) => s.toId === toId && s.drinkId === drinkId && !s.lost).reduce((n, s) => n + s.kegs, 0);
}

function runLine(w: World, c: Content, l: SupplyLine): void {
  const from = w.taverns[l.fromId]!;
  const to = w.taverns[l.toId]!;
  const need = l.keepAt - (to.cellar[l.drinkId] ?? 0) - kegsAtSea(w, to.id, l.drinkId);
  if (need <= 0) return;
  const cellar = from.cellar[l.drinkId] ?? 0;
  const surplus = cellar - (from.autoRestock ? from.restockTarget : 0);
  const shippable = Math.min(cellar, Math.max(surplus, l.bought));
  const n = Math.min(need, shippable, SUPPLY_BATCH);
  if (n > 0) {
    if (ship(w, c, from.id, to.id, l.drinkId, n, l.insured) === 'ok') l.bought = Math.max(0, l.bought - n);
    return;
  }
  // Nothing spare at the source: buy there (one order at a time per drink), ship when it lands.
  if (from.orders.some((o) => o.drinkId === l.drinkId)) return;
  const buy = Math.min(need, SUPPLY_BATCH);
  if (orderKegs(w, c, from, l.drinkId, buy, true) === 'ok') l.bought += buy;
}

export function stepSupply(w: World, c: Content): void {
  if (!w.supplyLines?.length || w.tick % SUPPLY_EVERY !== 1) return;
  for (const l of [...w.supplyLines]) {
    const from = w.taverns[l.fromId];
    const to = w.taverns[l.toId];
    if (!from || !to || from.status === 'closed' || to.status === 'closed') {
      removeSupplyLine(w, l.id);
      log(w, 'alert', `A supply line of ${drinkOf(c, l.drinkId).name} was dropped: ${!from || from.status === 'closed' ? 'its source' : 'its destination'} has closed.`);
      continue;
    }
    if (from.status === 'building' || to.status === 'building') continue;
    runLine(w, c, l);
  }
}
