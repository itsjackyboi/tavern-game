import { CITY_IDS, type CityId, type Content } from '../content/schema.ts';
import { league, loanCap } from './company.ts';
import { spend } from './economy/ledger.ts';
import { log } from './log.ts';
import { cityOf, clamp, isFlagship, player, playerTaverns, seasonTicks, upgradeCount } from './lookup.ts';
import { makeStaff, makeTavern, startMenu } from './world.ts';
import { calNow, endTick, calTick } from './time.ts';
import type { Tavern, World } from './types.ts';

// Founding sisters, tavern lifecycles, milestones, monopoly, the Year-463
// verdict and bankruptcy (docs/PLAN.md §1, §2.6).

export function lotsFree(w: World, c: Content, city: CityId): number {
  const used = Object.values(w.taverns).filter((t) => t.city === city && t.status !== 'closed').length;
  return cityOf(c, city).lots - used;
}

export function foundingCost(w: World, c: Content, city: CityId): number {
  const me = player(w);
  let cost = cityOf(c, city).foundCost;
  if (upgradeCount(me, 'steins-charter')) cost *= 0.75;
  return Math.round(cost);
}

/** Average reputation across the player's open taverns. */
export function networkRep(w: World): number {
  const ts = playerTaverns(w).filter((t) => t.status !== 'building');
  return ts.length ? ts.reduce((s, t) => s + t.rep, 0) / ts.length : 0;
}

export const FOUND_MIN_REP = 40;

export type FoundCheck = 'ok' | 'owned' | 'lots' | 'cash' | 'rep';

export function canFound(w: World, c: Content, city: CityId): FoundCheck {
  if (playerTaverns(w).some((t) => t.city === city)) return 'owned';
  if (lotsFree(w, c, city) <= 0) return 'lots';
  if (networkRep(w) < FOUND_MIN_REP) return 'rep';
  if (player(w).cash < foundingCost(w, c, city)) return 'cash';
  return 'ok';
}

export function foundTavern(w: World, c: Content, city: CityId, name?: string): FoundCheck {
  const check = canFound(w, c, city);
  if (check !== 'ok') return check;
  const me = player(w);
  const cost = foundingCost(w, c, city);
  spend(me, cost, 'other', 'New taverns', `Founding in ${cityOf(c, city).name}`);
  for (const d of c.drinks) if (d.startIn.includes(city) && !me.unlocked.includes(d.id)) me.unlocked.push(d.id);
  const t = makeTavern(w, c, {
    company: me, city, name: name ?? `The Last Call ${cityOf(c, city).name}`, tables: 6, taps: 3, rep: 35,
    status: 'building', menu: startMenu(c, city, [], 3), assetValue: cost * 0.7,
  });
  t.openTick = w.tick + seasonTicks(c);
  const m = makeStaff(w, c, { archetype: 'manager', tier: 'green', tavernId: t.id, stream: 'staff' });
  t.managerId = m.id;
  makeStaff(w, c, { archetype: 'tapster', tier: 'green', tavernId: t.id, stream: 'staff' });
  makeStaff(w, c, { archetype: 'runner', tier: 'green', tavernId: t.id, stream: 'staff' });
  log(w, 'news', `Work begins on ${t.name}.`, city);
  return 'ok';
}

/** Rival companies open taverns through the same lot rules. */
export function rivalFound(w: World, c: Content, companyId: string, city: CityId, name: string): Tavern | null {
  if (lotsFree(w, c, city) <= 0) return null;
  const co = w.companies[companyId]!;
  const cost = Math.round(cityOf(c, city).foundCost * 0.9);
  if (co.cash < cost) return null;
  spend(co, cost, 'other');
  const t = makeTavern(w, c, {
    company: co, city, name, tables: 7, taps: 3, rep: 42, status: 'building',
    menu: startMenu(c, city, co.unlocked, 3), assetValue: cost * 0.7,
    qualityBias: 4, priceBias: 0,
  });
  t.openTick = w.tick + seasonTicks(c);
  const m = makeStaff(w, c, { archetype: 'manager', tier: 'seasoned', tavernId: t.id, stream: 'rivals' });
  t.managerId = m.id;
  makeStaff(w, c, { archetype: 'tapster', tier: 'seasoned', tavernId: t.id, stream: 'rivals' });
  makeStaff(w, c, { archetype: 'runner', tier: 'green', tavernId: t.id, stream: 'rivals' });
  return t;
}

export function establishedIn(w: World, companyId: string): Set<CityId> {
  const s = new Set<CityId>();
  for (const t of Object.values(w.taverns)) if (t.companyId === companyId && t.status === 'established') s.add(t.city);
  return s;
}

export function establishedSisters(w: World): number {
  const home = w.meta.homeCity;
  return [...establishedIn(w, w.playerId)].filter((c) => c !== home).length;
}

/** Reputation trend: a sample every 5 s, the last minute kept. */
export const REP_SAMPLE_TICKS = 100;
export const REP_TRAIL_LEN = 13;

/** Change in reputation over the kept trail (about the last minute). */
export function repTrend(t: Tavern): number {
  const trail = t.repTrail ?? [];
  return trail.length ? t.rep - trail[0]! : 0;
}

/** 1 Hz lifecycle: building → establishing → established; struggling and closure. Attention decays for player sisters. */
export function stepLifecycle(w: World, c: Content): void {
  const len = seasonTicks(c);
  for (const t of Object.values(w.taverns)) {
    if (t.status === 'closed') continue;
    const co = w.companies[t.companyId]!;
    if (t.status === 'building' && w.tick >= t.openTick) {
      t.status = 'establishing';
      t.openTick = w.tick;
      log(w, co.isPlayer ? 'news' : 'rumor', `${t.name} opens its doors.`, t.city);
      continue;
    }
    if (t.status === 'establishing' && w.tick - t.openTick >= len && t.rep >= 45) {
      t.status = 'established';
      if (co.isPlayer) log(w, 'event', `${t.name} is established.`, t.city);
    }
    if (t.status === 'established' && t.rep < 22) {
      t.status = 'struggling';
      if (co.isPlayer) log(w, 'alert', `${t.name} is struggling.`, t.city);
    } else if (t.status === 'struggling' && t.rep >= 30) {
      t.status = 'established';
    }
    if (co.isPlayer) {
      if (w.tick % REP_SAMPLE_TICKS === 1) t.repTrail = [...(t.repTrail ?? []), Math.round(t.rep * 10) / 10].slice(-REP_TRAIL_LEN);
      const isFocus = w.focus.tavernId === t.id;
      // The flagship never slips: your household runs it while you're away.
      if (isFocus || isFlagship(w, t)) t.attention = 1;
      else {
        const mgr = t.managerId ? w.staff[t.managerId] : null;
        const decay = (1 / (len * 3)) * (1.25 - (mgr?.competence ?? 0));
        t.attention = clamp(t.attention - decay * 20, 0, 1);
      }
      if (t.status === 'struggling' && t.rep < 6 && t.id !== w.focus.tavernId) closeTavern(w, t, 'neglect');
    }
  }
}

export function closeTavern(w: World, t: Tavern, why: 'neglect' | 'collapse' | 'merged'): void {
  t.status = 'closed';
  for (const s of Object.values(w.staff)) if (s.tavernId === t.id) delete w.staff[s.id];
  t.managerId = null;
  if (w.companies[t.companyId]?.isPlayer) log(w, 'alert', `${t.name} has closed (${why}).`, t.city);
}

/** 1 Hz: milestone splits, peak CV, monopoly, bankruptcy and the Year-463 verdict. */
export function stepRun(w: World, c: Content): void {
  const run = w.run;
  if (run.status !== 'playing' && run.status !== 'freeplay') return;
  const me = player(w);
  const sisters = establishedSisters(w);
  if (sisters >= 1 && run.splits.firstSister === null) run.splits.firstSister = w.tick;
  if (sisters >= 3 && run.splits.thirdSister === null) run.splits.thirdSister = w.tick;
  run.peakCV = Math.max(run.peakCV, me.cv);
  if (run.status === 'freeplay') return;

  const ranked = league(w).filter((co) => co.id !== me.id);
  const next = ranked[0]?.cv ?? 0;
  if (me.cv > next && run.splits.firstNo1 === null) run.splits.firstNo1 = w.tick;

  const cal = calNow(w, c.time);
  const grace = c.economy.monopolyGraceSeasons * seasonTicks(c);
  if (w.tick >= grace && me.cv > 0 && me.cv >= c.economy.monopolyRatio * Math.max(next, 1)) {
    run.status = 'won';
    run.winType = 'monopoly';
    run.splits.monopoly = w.tick;
    run.endTick = w.tick;
    run.finalCV = me.cv;
    run.chosen = true;
    log(w, 'event', 'Monopoly! No company in the Isles comes close.');
    return;
  }

  // Bankruptcy: a full season below the floor with no borrowing left.
  if (me.cash < c.economy.bankruptcyFloor && loanCap(c, me) < 20) {
    if (run.lowCashSince === null) {
      run.lowCashSince = w.tick;
      log(w, 'alert', 'Creditors circle. Raise cash within the season or lose everything.');
    } else if (w.tick - run.lowCashSince >= seasonTicks(c)) {
      run.status = 'bankrupt';
      run.endTick = w.tick;
      run.finalCV = me.cv;
      return;
    }
  } else run.lowCashSince = null;

  if (calTick(w) >= endTick(c.time) && !run.verdictDone) {
    run.verdictDone = true;
    const allFour = CITY_IDS.every((city) => establishedIn(w, me.id).has(city));
    const top = me.cv > next;
    run.endTick = w.tick;
    run.finalCV = me.cv;
    if (allFour && top) {
      run.status = 'won';
      run.winType = 'sponsor';
      run.chosen = true;
    } else {
      run.status = 'lost';
      run.chosen = false;
    }
  }
  void cal;
}

/** Player chose to keep playing after the verdict (unranked). */
export function enterFreeplay(w: World): void {
  if (w.run.status === 'lost' || w.run.status === 'won') w.run.status = 'freeplay';
}
