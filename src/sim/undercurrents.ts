import { CITY_IDS, type CityId, type Content } from '../content/schema.ts';
import { log } from './log.ts';
import { addModifier, clamp, drinkOf, fmt, player, playerTaverns, tavernUpgradeSum } from './lookup.ts';
import { pick } from './rng.ts';
import type { World } from './types.ts';

// Long-reach systems (docs/PLAN.md §2.8): what you serve, who you buy from, how
// you treat the Veilwalkers and how loud Shanty Town gets all drift hidden
// values that later surface as patrons, prices and events.

/** Season rollover (called before KPIs reset, so it can read this season's sales). */
export function seasonUndercurrents(w: World, c: Content): void {
  const u = w.undercurrents;
  const me = player(w);

  // What you serve shapes church influence city by city.
  for (const city of CITY_IDS) {
    let push = 0;
    let total = 0;
    for (const t of playerTaverns(w)) {
      if (t.city !== city) continue;
      for (const [d, n] of Object.entries(t.kpi.byDrink)) {
        push += drinkOf(c, d).church * n;
        total += n;
      }
      push += tavernUpgradeSum(c, t, 'church') * 20;
    }
    const baseline = city === 'providence' ? 70 : city === 'aleforge' ? 25 : city === 'shanty' ? 10 : 5;
    const shift = total > 0 ? (push / total) * Math.min(1, total / 150) * 7 : 0;
    u.church[city] = clamp(u.church[city] + shift + (baseline - u.church[city]) * 0.03, 0, 100);
  }

  // Who you buy grain from.
  const dep = me.grainSource === 'cumstead' ? 1 : me.grainSource === 'mixed' ? 0.5 : 0.1;
  u.cumsteadDependency = u.cumsteadDependency * 0.6 + dep * 0.4;
  if (u.cumsteadDependency > 0.6) u.farmerTension = clamp(u.farmerTension + 5, 0, 100);
  else if (u.cumsteadDependency < 0.35) u.farmerTension = clamp(u.farmerTension - 4, 0, 100);
  else u.farmerTension = clamp(u.farmerTension - 1, 0, 100);

  // A loud Shanty Town tavern spreads pirate culture to your other cities.
  const shantyRev = playerTaverns(w).filter((t) => t.city === 'shanty').reduce((s, t) => s + t.kpi.revenue, 0);
  for (const city of CITY_IDS) {
    if (city === 'shanty') continue;
    const hasTavern = playerTaverns(w).some((t) => t.city === city);
    const grow = hasTavern && shantyRev > 450 ? 0.012 * Math.min(3, shantyRev / 450) : 0;
    u.pirateCulture[city] = clamp(u.pirateCulture[city] + grow - 0.004, 0.02, 1);
  }

  // Veilwalker goodwill fades slowly toward neutral; extremes bring omens.
  u.veilGoodwill = clamp(u.veilGoodwill * 0.97, -100, 100);
  if (u.veilGoodwill <= -40) addModifier(w, c, 'veil-curse', 1, 'company', me.id);
  if (u.veilGoodwill >= 40) addModifier(w, c, 'veil-blessing', 1, 'company', me.id);

  u.consolidation = clamp(u.consolidation - 0.02, 0, 1);
}

/** Year end: a Veilfrost with no vow honoured costs a little goodwill. */
export function yearUndercurrents(w: World): void {
  const u = w.undercurrents;
  if (!u.vowThisYear) u.veilGoodwill = clamp(u.veilGoodwill - 2, -100, 100);
  u.vowThisYear = false;
}

const WIND_STEPS: Record<string, number> = {
  church: 12, farmerTension: 18, veilGoodwill: 18, pirateCulture: 0.12, consolidation: 0.2,
};

/** At most one Cultural Winds hint per season, for the biggest move past a notice step. */
export function cultureWinds(w: World, c: Content, shift: number): void {
  const u = w.undercurrents;
  if (shift - u.lastWindShift < 1) return;
  const values: Array<[string, number, CityId | null]> = [
    ['farmerTension', u.farmerTension, null],
    ['veilGoodwill', u.veilGoodwill, null],
    ['consolidation', u.consolidation, null],
  ];
  const mine = new Set(playerTaverns(w).map((t) => t.city));
  for (const city of CITY_IDS) {
    if (!mine.has(city)) continue;
    values.push([`church.${city}`, u.church[city], city]);
    if (city !== 'shanty') values.push([`pirateCulture.${city}`, u.pirateCulture[city], city]);
  }
  let best: { key: string; dir: 'up' | 'down'; mag: number; city: CityId | null; value: number } | null = null;
  for (const [key, value, city] of values) {
    const base = key.split('.')[0]!;
    const step = WIND_STEPS[base] ?? 10;
    const last = u.notified[key];
    if (last === undefined) {
      u.notified[key] = value;
      continue;
    }
    const mag = Math.abs(value - last) / step;
    if (mag >= 1 && (!best || mag > best.mag)) best = { key, dir: value > last ? 'up' : 'down', mag, city, value };
  }
  if (!best) return;
  const base = best.key.split('.')[0]!;
  const lines = c.winds[`${base}.${best.dir}`];
  u.notified[best.key] = best.value;
  u.lastWindShift = shift;
  if (!lines?.length) return;
  const cityName = best.city ? (c.cities.find((x) => x.id === best!.city)?.name ?? '') : '';
  log(w, 'wind', fmt(pick(w, 'log', lines), { city: cityName }), best.city);
}
