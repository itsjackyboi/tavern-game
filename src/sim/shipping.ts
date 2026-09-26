import type { CityId, Content } from '../content/schema.ts';
import { spend, track } from './economy/ledger.ts';
import { log, rumor } from './log.ts';
import { cityOf, clamp, kegCost, modsFor, newId, player, upgradeCount } from './lookup.ts';
import { chance } from './rng.ts';
import { calendarAt } from './time.ts';
import type { World } from './types.ts';

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
  const cal = calendarAt(w.tick, c.time);
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
