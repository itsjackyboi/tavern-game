import type { Content } from '../content/schema.ts';
import { applyVisitRep, recordSale, servingSatisfaction, spend } from './economy/ledger.ts';
import {
  availableDrinks, cityOf, COOK_EXTRA_ROUND, cookPatience, prefOf, clamp, drinkOf, drinkQuality, idx, isOpenNow, managerOf, modsFor, seats,
  servingPrice, isFlagship, staffAt, tavernUpgradeSum,
} from './lookup.ts';
import { calNow } from './time.ts';
import { bellRung } from './floor/floor.ts';
import type { Staff, Tavern, World } from './types.ts';

// Equation-level simulation for every tavern that isn't on screen (1 Hz).
// It shares the demand model and accounting API with the floor sim, and its
// throughput is derived from the same staff stats, scaled by delegationEff,
// so delegation never beats skilled hands-on play (docs/PLAN.md §4).

/** Seconds for one full serve cycle (walk, pour, walk) by a staff member at competence 1. */
const SERVE_CYCLE = 2.3;

function staffEff(c: Content, s: Staff): number {
  return (0.6 + 0.4 * s.competence) * (0.7 + 0.3 * s.morale) * (1 - 0.3 * s.fatigue) * c.floor.delegationEff;
}

/** The innkeeper's household, standing in behind the flagship's bar while you're away. */
const STAND_IN = { competence: 0.7, morale: 1, fatigue: 0 } as Staff;

/** Servings per second this tavern's staff can deliver with nobody from the company on the floor. */
export function serviceCapacity(w: World, c: Content, t: Tavern): number {
  const staff = staffAt(w, t.id);
  let bar = 0;
  let floor = 0;
  for (const s of staff) {
    if (s.role === 'bar') bar += staffEff(c, s) / (SERVE_CYCLE * 0.8);
    else if (s.role === 'floor') floor += staffEff(c, s) / SERVE_CYCLE;
  }
  // Away from the flagship, your household keeps the bar going in your place,
  // so the tavern you built keeps its pace while you tend your sisters.
  const co0 = w.companies[t.companyId]!;
  const flagship = co0.isPlayer && isFlagship(w, t);
  if (flagship) bar += staffEff(c, STAND_IN) / (SERVE_CYCLE * 0.8);
  // Runners serve when there's no bar staff; otherwise they free the bar from seating and clearing.
  let mu = bar > 0 ? bar * (floor > 0 ? 1 : 0.72) + floor * 0.35 : floor * 0.8;
  if (!staff.some((s) => s.role === 'cellar')) mu *= 0.93;
  const mgr = managerOf(w, t);
  const co = w.companies[t.companyId]!;
  mu *= mgr ? 0.8 + 0.2 * mgr.competence : flagship ? 0.92 : 0.75;
  if (co.isPlayer) mu *= 0.6 + 0.4 * t.attention;
  return Math.max(mu, 0.02);
}

/** Probability each segment orders each available drink, weighted by the segment's arrival rate. */
function drinkShares(w: World, c: Content, t: Tavern, drinks: string[], night: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  const total = t.demand.rate || 1;
  for (const [segId, r] of Object.entries(t.demand.segRates)) {
    const seg = idx(c).seg.get(segId)!;
    const scores = drinks.map((id) => {
      const d = drinkOf(c, id);
      const pref = prefOf(seg, d.category, night);
      return Math.max(0.05, 1 + pref);
    });
    const sum = scores.reduce((a, b) => a + b, 0) || 1;
    drinks.forEach((id, i) => { out[id] = (out[id] ?? 0) + (r / total) * (scores[i]! / sum); });
  }
  return out;
}

export function stepAggregate(w: World, c: Content, t: Tavern): void {
  // The line at the door you left behind gets seated or gives up over a few seconds.
  if (t.agg.queue) t.agg.queue = t.agg.queue > 0.3 ? t.agg.queue * 0.85 : 0;
  if (!isOpenNow(w, t)) {
    t.agg.occupancy *= 0.9;
    t.agg.backlog = 0;
    return;
  }
  const cal = calNow(w, c.time);
  const mods = modsFor(w, c, t);
  const city = cityOf(c, t.city);
  const drinks = availableDrinks(w, c, t, mods).filter((d) => (t.tapLevels[d] ?? 0) + (t.cellar[d] ?? 0) > 0);
  const rate = t.demand.rate;
  const nSeats = seats(t);

  // Drinks per visit, weighted over the segment mix.
  let dpv = 0;
  let tip = 0;
  let brawl = 0;
  let theft = 0;
  for (const [segId, r] of Object.entries(t.demand.segRates)) {
    const seg = idx(c).seg.get(segId)!;
    const share = r / (rate || 1);
    const nightD = cal.isNight ? (seg.night?.drinks ?? 1) * city.nightThirst : 1;
    dpv += share * c.demand.drinksPerVisit * seg.drinks * nightD;
    tip += share * seg.tip;
    brawl += share * (cal.isNight ? (seg.night?.brawl ?? seg.brawl) : seg.brawl);
    theft += share * seg.theft;
  }
  const cook = cookPatience(w, t);
  // A cook keeps some patrons for another round (as on the floor).
  if (cook > 1) dpv += COOK_EXTRA_ROUND;
  dpv = Math.max(dpv, 1);
  const dwell = dpv * c.demand.drinkSeconds + 10;

  // Seating.
  const room = clamp((nSeats - t.agg.occupancy) / Math.max(1, nSeats * 0.25), 0, 1);
  // Last Call rung (the bell rings at all your taverns): no one new comes in.
  const doorsShut = t.companyId === w.playerId && cal.phase === 'lastCall' && bellRung(w, c);
  if (doorsShut) t.agg.queue = 0;
  const admitted = drinks.length && !doorsShut ? rate * room : 0;
  const blocked = doorsShut ? 0 : rate - admitted;
  t.agg.occupancy = Math.max(0, t.agg.occupancy + admitted - t.agg.occupancy / dwell);
  t.kpi.walkouts += blocked;

  // Service.
  const mu = serviceCapacity(w, c, t);
  t.agg.backlog += admitted * dpv;
  const served = Math.min(t.agg.backlog, mu);
  t.agg.backlog -= served;
  // More patience (a cook) means fewer give up waiting.
  const giveUp = t.agg.backlog * (0.08 / cook);
  t.agg.backlog -= giveUp;
  // Patrons on the floor typically use a third of their patience waiting for a pour.
  const waitFrac = clamp(0.35 + t.agg.backlog / Math.max(1, mu * 10), 0, 1);

  // Split servings across drinks and record sales.
  const shares = drinks.length ? drinkShares(w, c, t, drinks, cal.isNight) : {};
  let satW = 0;
  let qW = 0;
  let servedTotal = 0;
  const staffPresent = staffAt(w, t.id).length > 0;
  for (const d of drinks) {
    let want = served * (shares[d] ?? 0);
    if (want <= 0) continue;
    // Pull from the tap, restocking from the cellar when staff are around.
    let avail = t.tapLevels[d] ?? 0;
    if (avail < want && staffPresent && (t.cellar[d] ?? 0) >= 1) {
      t.cellar[d] = (t.cellar[d] ?? 0) - 1;
      avail += c.economy.kegServings;
    }
    want = Math.min(want, avail);
    t.tapLevels[d] = avail - want;
    const price = servingPrice(c, t, d, mods);
    // Satisfaction averaged over the segment mix.
    let sat = 0;
    for (const [segId, r] of Object.entries(t.demand.segRates)) {
      sat += (r / (rate || 1)) * servingSatisfaction(w, c, t, idx(c).seg.get(segId)!, d, waitFrac, mods, cal.isNight);
    }
    const q = drinkQuality(w, c, t, d, mods);
    const tipEach = price * (tip + mods.tips) * sat;
    recordSale(w, c, t, d, price, tipEach, mods, want);
    satW += sat * want;
    qW += q * want;
    servedTotal += want;
    brawl *= 1 + drinkOf(c, d).brawl * (shares[d] ?? 0) * 0.2;
  }
  if (servedTotal > 0) {
    applyVisitRep(w, c, t, satW / servedTotal, qW / servedTotal, mods, servedTotal / dpv);
  }
  if (giveUp > 0.01) applyVisitRep(w, c, t, 0.1, 20, mods, (giveUp / dpv) * 0.6);
  if (blocked > 0.01) applyVisitRep(w, c, t, 0.25, 30, mods, blocked * 0.2);

  // Expected incidents, mitigated by door staff.
  const door = staffAt(w, t.id).filter((s) => s.role === 'door').reduce((m, s) => Math.max(m, s.competence), 0);
  const mitigation = door > 0 ? 0.35 + 0.5 * door : 0;
  const brawls = servedTotal * brawl * city.brawlMult * mods.brawl * (1 + tavernUpgradeSum(c, t, 'brawl')) * 2.5 * (1 - mitigation);
  const thefts = admitted * theft * city.theftMult * mods.theft * (1 + tavernUpgradeSum(c, t, 'theft')) * 2.2 * (1 - mitigation * 0.8);
  const co = w.companies[t.companyId]!;
  if (brawls > 0) {
    spend(co, brawls * 27 * city.damageMult, 'other', 'Brawl damage', `Brawls at ${t.name}`);
    t.rep = clamp(t.rep - brawls * 1.4 * mods.repSwing, 0, 100);
    t.kpi.brawls += brawls;
  }
  if (thefts > 0) {
    spend(co, thefts * clamp(co.cash * 0.03, 6, 60), 'other', 'Theft', `Thieves at ${t.name}`);
    t.kpi.thefts += thefts;
  }

  // Staff fatigue follows utilisation.
  const util = clamp(served / Math.max(mu, 0.01), 0, 1);
  for (const s of staffAt(w, t.id)) s.fatigue = clamp(s.fatigue + (util - 0.55) * 0.0015, 0, 1);
}
