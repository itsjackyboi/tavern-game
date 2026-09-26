import type { Content, Segment } from '../../content/schema.ts';
import { cityOf, clamp, prefOf, drinkOf, drinkQuality, tavernUpgradeSum, type ModTotals } from '../lookup.ts';
import { calendarAt } from '../time.ts';
import type { Company, Ledger, Tavern, World } from '../types.ts';

// The only place money moves (docs/PLAN.md §4). Floor and aggregate sims both
// record effects through these calls, so the economy's rules are identical.

const LINE_KEY: Record<keyof Ledger, string> = {
  revenue: 'Drink sales', kegs: 'Kegs', wages: 'Wages', rent: 'Rent', tax: 'Fees & tithes', other: 'Other',
};

/** Money that isn't profit or loss: borrowing and repaying. */
export const FINANCING = 'Loans';
const RECENT_MAX = 40;

/**
 * Notes a player money movement under a reason, so the game can always say
 * where the Duckets went. Consecutive entries for the same thing merge.
 */
export function track(co: Company, amount: number, key: string, detail = ''): void {
  if (!co.isPlayer || amount === 0) return;
  co.flows[key] = (co.flows[key] ?? 0) + amount;
  co.flowsYear[key] = (co.flowsYear[key] ?? 0) + amount;
  if (key === 'Drink sales') return;
  const last = co.recent[co.recent.length - 1];
  if (last && last.key === key && last.detail === detail) {
    last.amount += amount;
    last.seq = ++co.moneySeq;
    return;
  }
  co.recent.push({ seq: ++co.moneySeq, key, detail, amount });
  if (co.recent.length > RECENT_MAX) co.recent.splice(0, co.recent.length - RECENT_MAX);
}

export function spend(co: Company, amount: number, line: keyof Ledger, why?: string, detail?: string): void {
  co.cash -= amount;
  co.ledger[line] += line === 'revenue' ? -amount : amount;
  track(co, -amount, why ?? LINE_KEY[line], detail);
}

export function earn(co: Company, amount: number, why = 'Drink sales', detail?: string): void {
  co.cash += amount;
  co.ledger.revenue += amount;
  track(co, amount, why, detail);
}

/** Share of revenue lost to tax, tithe and counterfeits in this tavern's city. */
export function revenueSkim(w: World, c: Content, t: Tavern, mods: ModTotals): number {
  const city = cityOf(c, t.city);
  let skim = city.salesTax;
  if (t.city === 'providence') {
    skim += clamp(0.06 + (0.12 * w.undercurrents.church.providence) / 100 + mods.tithe - w.institutions.church / 1000, 0.03, 0.4);
  }
  if (t.city === 'roto') skim += clamp(0.04 * (1 - w.institutions.rotoMarket / 100), 0, 0.08);
  return skim;
}

/** How happy a patron is with one serving (0..1). `wait` is 0..1 of their patience used. */
export function servingSatisfaction(
  w: World, c: Content, t: Tavern, seg: Segment, drinkId: string, wait: number, mods: ModTotals, night: boolean,
): number {
  const d = drinkOf(c, drinkId);
  const q = drinkQuality(w, c, t, drinkId, mods);
  const pref = prefOf(seg, d.category, night);
  const item = t.menu.find((m) => m.drinkId === drinkId);
  const priceMult = (item?.price ?? 1) * (1 + t.priceBias) * mods.price;
  let s = 0.5 + (q - 50) / 110 + 0.12 * pref - (0.35 * (priceMult - 1)) / seg.spend - 0.3 * wait + 0.15 * t.decor;
  if (hasFiddler(w, t)) s += 0.05;
  return clamp(s, 0, 1);
}

function hasFiddler(w: World, t: Tavern): boolean {
  for (const s of Object.values(w.staff)) if (s.tavernId === t.id && s.role === 'stage') return true;
  return false;
}

/** Records one serving: revenue (after skim) to the company, KPIs, and contraband/undercurrent tallies. */
export function recordSale(
  w: World, c: Content, t: Tavern, drinkId: string, price: number, tip: number, mods: ModTotals, count = 1,
): number {
  const co = w.companies[t.companyId]!;
  const gross = (price + tip) * count;
  const net = gross * (1 - revenueSkim(w, c, t, mods));
  earn(co, net);
  co.ledger.tax += gross - net;
  t.kpi.revenue += net;
  t.kpi.served += count;
  t.kpi.byDrink[drinkId] = (t.kpi.byDrink[drinkId] ?? 0) + count;
  if (co.isPlayer && cityOf(c, t.city).contraband.includes(drinkId)) {
    w.events.flags.contrabandSold = (w.events.flags.contrabandSold ?? 0) + count;
  }
  return net;
}

/** Moves reputation toward a visit's satisfaction. Aleforge weights quality (craft). */
export function applyVisitRep(w: World, c: Content, t: Tavern, sat: number, quality: number, mods: ModTotals, weight = 1): void {
  const city = cityOf(c, t.city);
  const craft = clamp(city.craftWeight * (1 + tavernUpgradeSum(c, t, 'craftRep')), 0, 0.9);
  const target = ((1 - craft) * sat + craft * (quality / 100)) * 100;
  const rate = c.demand.repLearnRate * mods.repGain * mods.repSwing * weight;
  t.rep = clamp(t.rep + (target - t.rep) * clamp(rate, 0, 0.5), 0, 100);
  t.kpi.satSum += sat * weight;
  t.kpi.satN += weight;
}

export function isNightNow(w: World, c: Content): boolean {
  return calendarAt(w.tick, c.time).isNight;
}
