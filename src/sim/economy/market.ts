import { CITY_IDS, type CityId, type Content, type IngredientId, type Segment } from '../../content/schema.ts';
import {
  availableDrinks, cityOf, prefOf, clamp, drinkOf, drinkQuality, idx, isFlagship, isOpenNow, modsFor, playerTaverns, seasonTicks, seats,
  servingPrice, tavernAppeal, type ModTotals,
} from '../lookup.ts';
import { rand } from '../rng.ts';
import { calNow, type Calendar } from '../time.ts';
import type { Tavern, World } from '../types.ts';

// One demand model for everyone (docs/PLAN.md §4): the floor spawner, the
// aggregate sim and the rival AI all read the arrival rates computed here.

/** Segment weights in a city right now, including undercurrent diffusion (church, pirate culture). */
export function segmentMix(w: World, c: Content, city: CityId, cal: Calendar): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of idx(c).segsByCity[city]) out[s.id] = cal.isNight ? s.nightWeight : s.weight;
  // Diffusion: Apostles appear outside Providence as the church grows; pirates spread with Shanty Town culture.
  const u = w.undercurrents;
  for (const s of c.segments) {
    if (s.city === city || !s.diffuses) continue;
    const v = s.diffuses === 'church' ? clamp((u.church[city] - 35) / 100, 0, 0.5) : clamp(u.pirateCulture[city] * 0.3, 0, 0.35);
    if (v > 0.001) out[s.id] = (out[s.id] ?? 0) + v;
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] = out[k]! / total;
  return out;
}

/** How well a segment likes the best thing on the menu (−1..1.5). */
export function menuFit(c: Content, seg: Segment, drinks: string[], nightPrefs: boolean): number {
  let best = -1.5;
  for (const id of drinks) {
    const cat = drinkOf(c, id).category;
    const pref = prefOf(seg, cat, nightPrefs);
    if (pref > best) best = pref;
  }
  return drinks.length ? best : -2;
}

export function avgQuality(w: World, c: Content, t: Tavern, drinks: string[], mods: ModTotals): number {
  if (!drinks.length) return 0;
  return drinks.reduce((s, d) => s + drinkQuality(w, c, t, d, mods), 0) / drinks.length;
}

export function priceIndex(c: Content, t: Tavern, drinks: string[], mods: ModTotals): number {
  if (!drinks.length) return 1;
  return drinks.reduce((s, d) => s + servingPrice(c, t, d, mods) / drinkOf(c, d).price, 0) / drinks.length;
}

/** Recomputes every open tavern's arrival rate (patrons per second), city by city. */
export function updateDemand(w: World, c: Content): void {
  const cal = calNow(w, c.time);
  const L = c.demand.logit;
  const growth = Math.pow(1 + c.demand.growthPerYear, cal.yearIndex);
  for (const city of CITY_IDS) {
    const cdef = cityOf(c, city);
    const cityMods = modsFor(w, c, null, city);
    const phaseMult = c.demand.phase[cal.phase] * (cal.isNight ? cdef.nightThirst / 1.1 : 1);
    const seasonMult = cal.segment === 'holidayKeg' ? 1 : c.demand.season[cal.segment];
    const lambda = cdef.marketSize * phaseMult * seasonMult * growth * cityMods.arrivals;
    const mix = segmentMix(w, c, city, cal);
    w.cities[city].segWeights = mix;

    const taverns = Object.values(w.taverns).filter((t) => t.city === city);
    const open = taverns.filter((t) => isOpenNow(w, t));
    for (const t of taverns) t.demand = { rate: 0, segRates: {} };
    if (!open.length) continue;

    // Per-tavern features that don't depend on segment.
    const feats = open.map((t) => {
      const mods = modsFor(w, c, t);
      const drinks = availableDrinks(w, c, t, mods);
      return {
        t, mods, drinks,
        q: avgQuality(w, c, t, drinks, mods),
        pi: priceIndex(c, t, drinks, mods),
        cap: 0.35 * Math.log(Math.max(2, seats(t)) / 12),
        dry: drinks.filter((d) => (t.tapLevels[d] ?? 0) + (t.cellar[d] ?? 0) * c.economy.kegServings < 1).length / Math.max(1, drinks.length),
      };
    });

    for (const [segId, weight] of Object.entries(mix)) {
      const seg = idx(c).seg.get(segId)!;
      const priceSens = 1 / seg.spend;
      const utils = feats.map((f) => {
        if (!f.drinks.length) return -Infinity;
        const u =
          L.rep * (f.t.rep / 100) +
          L.fit * menuFit(c, seg, f.drinks, cal.isNight && seg.city === 'providence') +
          L.quality * (f.q / 100) -
          L.price * priceSens * (f.pi - 1) +
          L.decor * f.t.decor +
          tavernAppeal(c, f.t, segId) +
          f.cap -
          1.5 * f.dry;
        return u;
      });
      const max = Math.max(L.stayHome, ...utils);
      const exps = utils.map((u) => (u === -Infinity ? 0 : Math.exp(u - max)));
      const denom = Math.exp(L.stayHome - max) + exps.reduce((a, b) => a + b, 0);
      feats.forEach((f, i) => {
        const r = lambda * weight * (exps[i]! / denom) * f.mods.arrivals;
        if (r <= 0) return;
        f.t.demand.segRates[segId] = r;
        f.t.demand.rate += r;
      });
    }
  }
  applyPace(w, c);
}

// Pace as you grow (the game should get busier, not quieter, with each tavern):
//  - word of mouth: every other tavern you have open adds arrivals at all of them;
//  - a new sister builds up to the flagship's pace over its first seasons
//    (unless it's struggling, which loses the lift).
export const PACE_PER_TAVERN = 0.06;
export const PACE_RAMP_START = 0.45;
export const PACE_RAMP_SEASONS = 2;

function scaleDemand(t: Tavern, k: number): void {
  if (k === 1 || t.demand.rate <= 0) return;
  t.demand.rate *= k;
  for (const s of Object.keys(t.demand.segRates)) t.demand.segRates[s]! *= k;
}

/** How far a sister has built up toward the flagship's pace (PACE_RAMP_START → 1). */
export function sisterRamp(w: World, c: Content, t: Tavern): number {
  const open = Math.max(0, w.tick - t.openTick) / (seasonTicks(c) * PACE_RAMP_SEASONS);
  return clamp(PACE_RAMP_START + (1 - PACE_RAMP_START) * open, PACE_RAMP_START, 1);
}

export function applyPace(w: World, c: Content): void {
  const mine = playerTaverns(w).filter((t) => t.status !== 'building' && isOpenNow(w, t));
  if (!mine.length) return;
  const flag = mine.find((t) => isFlagship(w, t));
  const flagRate = flag?.demand.rate ?? 0;
  for (const t of mine) {
    if (t === flag || t.status === 'struggling' || t.demand.rate <= 0) continue;
    const target = flagRate * sisterRamp(w, c, t);
    if (t.demand.rate < target) scaleDemand(t, target / t.demand.rate);
  }
  const buzz = 1 + PACE_PER_TAVERN * (mine.length - 1);
  for (const t of mine) scaleDemand(t, buzz);
}

/** Ingredient price random walks (1 Hz). Roto is the most volatile; shocks elsewhere echo there. */
export function updatePrices(w: World, c: Content): void {
  const ings: IngredientId[] = ['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit', 'imports'];
  const rev = c.economy.priceReversion;
  for (const city of CITY_IDS) {
    const vol = c.economy.ingredientVolatility[city];
    const st = w.cities[city];
    for (const ing of ings) {
      const cur = st.shock[ing];
      const noise = (rand(w, 'market') - 0.5) * 2 * vol;
      st.shock[ing] = clamp(cur + noise - (cur - 1) * rev, 0.55, 2.2);
    }
  }
  // Roto echoes other cities' shocks within the season.
  const roto = w.cities.roto;
  for (const ing of ings) {
    let others = 0;
    for (const city of CITY_IDS) if (city !== 'roto') others += w.cities[city].shock[ing];
    const avg = others / 3;
    roto.shock[ing] = clamp(roto.shock[ing] + (avg - 1) * 0.004, 0.55, 2.4);
  }
  if (w.tick % 100 === 0) {
    for (const city of CITY_IDS) {
      const st = w.cities[city];
      for (const ing of ings) {
        const h = st.history[ing];
        h.push(Math.round(st.shock[ing] * 100) / 100);
        if (h.length > 24) h.shift();
      }
    }
  }
}

/** A sharp regional supply event (storms, blight): one ingredient jumps in one city. */
export function priceShock(w: World, city: CityId, ing: IngredientId, factor: number): void {
  const st = w.cities[city];
  st.shock[ing] = clamp(st.shock[ing] * factor, 0.55, 2.4);
}
