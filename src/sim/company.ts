import type { Content } from '../content/schema.ts';
import { emptyKpi, emptyLedger } from './world.ts';
import { spend } from './economy/ledger.ts';
import { cityOf, clamp, kegCost, seats } from './lookup.ts';
import type { Company, Tavern, World } from './types.ts';

// Company Value (docs/PLAN.md §2.6): the one size metric, same formula for
// everyone. Monopoly and the sponsorship verdict both read it.

export function companyTaverns(w: World, co: Company): Tavern[] {
  return Object.values(w.taverns).filter((t) => t.companyId === co.id && t.status !== 'closed');
}

export function brandValue(c: Content, t: Tavern): number {
  if (t.status === 'building') return 0;
  const r = t.rep / 100;
  return r * r * cityOf(c, t.city).marketSize * c.economy.cvBrandFactor * Math.sqrt(seats(t) / 12);
}

export function stockValue(w: World, c: Content, t: Tavern): number {
  let v = 0;
  for (const [d, n] of Object.entries(t.cellar)) if (n > 0) v += n * kegCost(w, c, d, t.city, null, null) * 0.8;
  return v;
}

export function computeCV(w: World, c: Content, co: Company): number {
  let v = co.cash + co.favor * c.economy.favorToDuckets - co.debt;
  v += c.economy.cvEarningsMultiple * Math.max(co.profitYear, -1000);
  for (const t of companyTaverns(w, co)) v += t.assetValue + stockValue(w, c, t) + brandValue(c, t);
  return Math.round(v);
}

export function updateCV(w: World, c: Content): void {
  for (const co of Object.values(w.companies)) {
    co.cv = companyTaverns(w, co).length ? computeCV(w, c, co) : 0;
    if (w.tick % 200 === 0) {
      co.cvHistory.push(co.cv);
      if (co.cvHistory.length > 60) co.cvHistory.shift();
    }
  }
}

/** Companies sorted by CV, biggest first (only those still trading). */
export function league(w: World): Company[] {
  return Object.values(w.companies).filter((co) => co.cv !== 0 || co.isPlayer).sort((a, b) => b.cv - a.cv);
}

export function loanCap(c: Content, co: Company): number {
  return Math.max(0, Math.round(co.cv * c.economy.loanCapFraction - co.debt));
}

export function takeLoan(c: Content, co: Company, amount: number): boolean {
  const amt = Math.min(Math.round(amount), loanCap(c, co));
  if (amt <= 0) return false;
  co.debt += amt;
  co.cash += amt;
  return true;
}

export function repayLoan(co: Company, amount: number): boolean {
  const amt = Math.min(Math.round(amount), co.debt, Math.max(0, Math.floor(co.cash)));
  if (amt <= 0) return false;
  co.debt -= amt;
  co.cash -= amt;
  return true;
}

/** Season rollover: rent, wages, interest, depreciation, KPIs and profit. */
export function closeSeason(w: World, c: Content): void {
  for (const co of Object.values(w.companies)) {
    const before = co.cash;
    for (const t of companyTaverns(w, co)) {
      if (t.status === 'building') continue;
      const rent = cityOf(c, t.city).rentPerSeason * Math.sqrt(t.tables / 6);
      spend(co, rent, 'rent');
      t.kpi.costs += rent;
      t.assetValue *= 1 - c.economy.assetDepreciation;
    }
    for (const s of Object.values(w.staff)) {
      const t = w.taverns[s.tavernId];
      if (!t || t.companyId !== co.id || t.status === 'closed') continue;
      spend(co, s.wage, 'wages');
      t.kpi.costs += s.wage;
    }
    if (co.debt > 0) spend(co, co.debt * c.economy.loanRatePerSeason, 'other');
    // Profit this season: revenue minus everything spent, from the ledger deltas.
    const revenue = companyTaverns(w, co).reduce((s, t) => s + t.kpi.revenue, 0);
    const costs = companyTaverns(w, co).reduce((s, t) => s + t.kpi.costs, 0);
    co.seasonProfit = revenue - costs;
    co.profitYear = co.profitYear * 0.55 + co.seasonProfit * 3 * 0.45;
    void before;
    for (const t of companyTaverns(w, co)) {
      t.lastKpi = t.kpi;
      t.kpi = emptyKpi();
    }
  }
}

/** Year rollover (end of the Holiday Keg): Roto's flat fee, ledgers roll over. */
export function closeYear(w: World, c: Content): void {
  for (const co of Object.values(w.companies)) {
    for (const t of companyTaverns(w, co)) {
      const fee = cityOf(c, t.city).annualFee;
      if (fee > 0 && t.status !== 'building') {
        spend(co, fee * clamp(1 - w.institutions.rotoMarket / 400, 0.75, 1.25), 'tax');
      }
    }
    co.lastLedger = co.ledger;
    co.ledger = emptyLedger();
  }
}
