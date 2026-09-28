import type {
  Category, City, CityId, Content, Drink, Ingredient, IngredientId, ModifierDef, Prompt, Segment, Upgrade,
} from '../content/schema.ts';
import type { Company, Tavern, World } from './types.ts';
import { calNow } from './time.ts';

// Memoised content indexes plus small pure helpers shared by every system.

interface Index {
  drink: Map<string, Drink>;
  seg: Map<string, Segment>;
  segsByCity: Record<CityId, Segment[]>;
  city: Map<CityId, City>;
  ing: Map<IngredientId, Ingredient>;
  mod: Map<string, ModifierDef>;
  prompt: Map<string, Prompt>;
  upgrade: Map<string, Upgrade>;
}

const cache = new WeakMap<Content, Index>();

export function idx(c: Content): Index {
  let i = cache.get(c);
  if (!i) {
    const segsByCity = { aleforge: [], shanty: [], providence: [], roto: [] } as Record<CityId, Segment[]>;
    for (const s of c.segments) segsByCity[s.city].push(s);
    i = {
      drink: new Map(c.drinks.map((d) => [d.id, d])),
      seg: new Map(c.segments.map((s) => [s.id, s])),
      segsByCity,
      city: new Map(c.cities.map((x) => [x.id, x])),
      ing: new Map(c.ingredients.map((x) => [x.id, x])),
      mod: new Map(c.modifiers.map((m) => [m.id, m])),
      prompt: new Map(c.prompts.map((p) => [p.id, p])),
      upgrade: new Map(c.upgrades.map((u) => [u.id, u])),
    };
    cache.set(c, i);
  }
  return i;
}

export const drinkOf = (c: Content, id: string): Drink => {
  const d = idx(c).drink.get(id);
  if (!d) throw new Error(`unknown drink ${id}`);
  return d;
};
export const segOf = (c: Content, id: string): Segment => {
  const s = idx(c).seg.get(id);
  if (!s) throw new Error(`unknown segment ${id}`);
  return s;
};
export const cityOf = (c: Content, id: CityId): City => idx(c).city.get(id)!;

/** A segment's taste for a category, using its night tastes after the Hangover bell when it has them. */
export function prefOf(seg: Segment, cat: Category, night: boolean): number {
  const n = night ? seg.night?.prefs?.[cat] : undefined;
  return n ?? seg.prefs[cat] ?? 0;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function newId(w: World, prefix: string): string {
  w.nextId += 1;
  return `${prefix}${w.nextId}`;
}

export const player = (w: World): Company => w.companies[w.playerId]!;

export function playerTaverns(w: World): Tavern[] {
  return Object.values(w.taverns).filter((t) => t.companyId === w.playerId && t.status !== 'closed');
}

/** Your first tavern, the one you started with (it stays the flagship for the whole run). */
export function isFlagship(w: World, t: Tavern): boolean {
  if (t.companyId !== w.playerId) return false;
  for (const x of Object.values(w.taverns)) if (x.companyId === w.playerId) return x.id === t.id;
  return false;
}

export function openTaverns(w: World, city?: CityId): Tavern[] {
  return Object.values(w.taverns).filter(
    (t) => t.status !== 'closed' && t.status !== 'building' && (city === undefined || t.city === city),
  );
}

export function isOpenNow(w: World, t: Tavern): boolean {
  return t.status !== 'closed' && t.status !== 'building' && w.tick >= t.closedUntil;
}

// ---------------------------------------------------------------- modifiers

export interface ModTotals {
  arrivals: number;
  price: number;
  brawl: number;
  theft: number;
  quality: number;
  kegCost: number;
  repGain: number;
  repSwing: number;
  spoilage: number;
  shippingLoss: number;
  tithe: number;
  tips: number;
  grainPrice: number;
  tabooBlocked: boolean;
  bans: Set<Category>;
}

/** Combined modifiers affecting a tavern: its own, its city's, its company's, and global ones. */
export function modsFor(w: World, c: Content, t: { id: string; city: CityId; companyId: string } | null, city?: CityId): ModTotals {
  const tot: ModTotals = {
    arrivals: 1, price: 1, brawl: 1, theft: 1, quality: 0, kegCost: 1, repGain: 1, repSwing: 1, spoilage: 1,
    shippingLoss: 0, tithe: 0, tips: 0, grainPrice: 1, tabooBlocked: false, bans: new Set(),
  };
  const cityId = t?.city ?? city;
  for (const m of w.modifiers) {
    if (m.untilTick <= w.tick) continue;
    const applies =
      m.scope === 'global' ||
      (m.scope === 'city' && m.target === cityId) ||
      (m.scope === 'tavern' && t !== null && m.target === t.id) ||
      (m.scope === 'company' && t !== null && m.target === t.companyId);
    if (!applies) continue;
    const d = idx(c).mod.get(m.id);
    if (!d) continue;
    if (d.arrivals !== undefined) tot.arrivals *= d.arrivals;
    if (d.price !== undefined) tot.price *= d.price;
    if (d.brawl !== undefined) tot.brawl *= d.brawl;
    if (d.theft !== undefined) tot.theft *= d.theft;
    if (d.quality !== undefined) tot.quality += d.quality;
    if (d.kegCost !== undefined) tot.kegCost *= d.kegCost;
    if (d.repGain !== undefined) tot.repGain *= d.repGain;
    if (d.repSwing !== undefined) tot.repSwing *= d.repSwing;
    if (d.spoilage !== undefined) tot.spoilage *= d.spoilage;
    if (d.shippingLoss !== undefined) tot.shippingLoss += d.shippingLoss;
    if (d.tithe !== undefined) tot.tithe += d.tithe;
    if (d.tips !== undefined) tot.tips += d.tips;
    if (d.grainPrice !== undefined) tot.grainPrice *= d.grainPrice;
    if (d.tabooBlocked) tot.tabooBlocked = true;
    for (const b of d.categoryBan ?? []) tot.bans.add(b);
  }
  return tot;
}

export function addModifier(w: World, c: Content, id: string, seasons: number, scope: ActiveScope, target: string): void {
  const len = c.time.seasonTicks.goldsun;
  const until = w.tick + Math.round(seasons * len);
  const existing = w.modifiers.find((m) => m.id === id && m.scope === scope && m.target === target);
  if (existing) existing.untilTick = Math.max(existing.untilTick, until);
  else w.modifiers.push({ id, scope, target, untilTick: until });
}
type ActiveScope = 'tavern' | 'city' | 'global' | 'company';

// ---------------------------------------------------------------- prices & quality

export function ingredientPrice(w: World, c: Content, city: CityId, ing: IngredientId, company: Company | null, mods: ModTotals): number {
  const def = idx(c).ing.get(ing)!;
  let p = def.basePrice * def.cityMult[city] * (w.cities[city].shock[ing] ?? 1);
  if (ing === 'barley') {
    p *= mods.grainPrice;
    if (company) {
      const src = company.grainSource;
      const standing = w.institutions.cumstead;
      p *= src === 'cumstead' ? 0.85 - standing / 1000 : src === 'smallholders' ? 1.2 : 1.0;
    }
  }
  return p;
}

/** Cost of one keg of a drink in a city, for a company. */
export function kegCost(w: World, c: Content, drinkId: string, city: CityId, company: Company | null, t: Tavern | null): number {
  const d = drinkOf(c, drinkId);
  const mods = modsFor(w, c, t, city);
  let sum = c.economy.brewFee;
  for (const [ing, qty] of Object.entries(d.recipe) as Array<[IngredientId, number]>) {
    if (ing === 'spiritweed') continue;
    sum += qty * ingredientPrice(w, c, city, ing, company, mods);
  }
  const cm = cityOf(c, city).kegCostMult?.[d.category] ?? 1;
  return Math.round(sum * cm * mods.kegCost * 10) / 10;
}

/** Spiritweed units a keg needs (vow-trade only ingredient). */
export function spiritweedPerKeg(c: Content, drinkId: string): number {
  return drinkOf(c, drinkId).recipe.spiritweed ?? 0;
}

export function drinkQuality(w: World, c: Content, t: Tavern, drinkId: string, mods?: ModTotals): number {
  const d = drinkOf(c, drinkId);
  const m = mods ?? modsFor(w, c, t);
  let q = d.quality + (cityOf(c, t.city).qualityBonus?.[d.category] ?? 0) + m.quality + t.qualityBias;
  for (const [uid, n] of Object.entries(t.upgrades)) {
    const u = idx(c).upgrade.get(uid);
    if (!u || !n || !u.effects.quality) continue;
    if (!u.effects.qualityCategories || u.effects.qualityCategories.includes(d.category)) q += u.effects.quality;
  }
  const company = w.companies[t.companyId];
  if (company?.grainSource === 'smallholders' && d.recipe.barley) q += 3;
  return clamp(q, 0, 100);
}

export function servingPrice(c: Content, t: Tavern, drinkId: string, mods: ModTotals): number {
  const item = t.menu.find((m) => m.drinkId === drinkId);
  const mult = (item?.price ?? 1) * (1 + t.priceBias);
  return drinkOf(c, drinkId).price * mult * mods.price;
}

/** Drinks that can be sold right now at this tavern (menu, bans, contraband is allowed but risky, taboo by night in Roto). */
export function availableDrinks(w: World, c: Content, t: Tavern, mods: ModTotals): string[] {
  const cal = calNow(w, c.time);
  const city = cityOf(c, t.city);
  return t.menu
    .map((m) => m.drinkId)
    .filter((id) => {
      const d = drinkOf(c, id);
      if (mods.bans.has(d.category)) return false;
      if (d.taboo && city.tabooAtNightOnly && (!cal.isNight || mods.tabooBlocked)) return false;
      return true;
    });
}

export function upgradeCount(t: Tavern | Company, id: string): number {
  return t.upgrades[id] ?? 0;
}

export function tavernAppeal(c: Content, t: Tavern, segId: string): number {
  let a = 0;
  for (const [uid, n] of Object.entries(t.upgrades)) {
    const u = idx(c).upgrade.get(uid);
    if (u && n) a += u.effects.appeal?.[segId] ?? 0;
  }
  return a;
}

export function tavernUpgradeSum(c: Content, t: Tavern, key: 'brawl' | 'theft' | 'spoilage' | 'craftRep' | 'church'): number {
  let s = 0;
  for (const [uid, n] of Object.entries(t.upgrades)) {
    const u = idx(c).upgrade.get(uid);
    if (u && n) s += (u.effects[key] as number | undefined) ?? 0;
  }
  return s;
}

export function seats(t: Tavern): number {
  return t.tables * 2;
}

export function seasonTicks(c: Content): number {
  return c.time.seasonTicks.goldsun;
}

export function managerOf(w: World, t: Tavern) {
  return t.managerId ? (w.staff[t.managerId] ?? null) : null;
}

export function staffAt(w: World, tavernId: string) {
  return Object.values(w.staff).filter((s) => s.tavernId === tavernId && s.role !== 'manage');
}

const STAFF_ICON: Record<string, string> = { bar: '🍺', floor: '🏃', door: '✊', cellar: '🛢', stage: '♪', intel: '👁', kitchen: '🍲', manage: '✎' };
const STAFF_TIER: Record<string, string> = { green: 'Green', seasoned: 'Seasoned', master: 'Master' };

/** How staff are named in the feed: job icon, skill level, then name (e.g. "🍺 Seasoned Orrin Vale"). */
export function staffLabel(s: { role: string; tier: string; name: string }): string {
  return `${STAFF_ICON[s.role] ?? '•'} ${STAFF_TIER[s.tier] ?? s.tier} ${s.name}`;
}

/** Roles that work out of sight: they never appear as workers on the floor. */
export const BACKGROUND_ROLES = new Set(['intel', 'kitchen']);

/** Chance a patron stays for one more round when there's a cook. */
export const COOK_EXTRA_ROUND = 0.2;

/**
 * A cook in the kitchen keeps patrons longer: more patience while they wait
 * (×1.2 to ×1.35 with competence) and a chance of one more round. Only the
 * best cook counts. Returns 1 when there's none.
 */
export function cookPatience(w: World, t: Tavern): number {
  let best = -1;
  for (const s of Object.values(w.staff)) if (s.tavernId === t.id && s.role === 'kitchen' && s.competence > best) best = s.competence;
  return best < 0 ? 1 : 1.2 + 0.15 * best;
}

export function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? k);
}

export const CATEGORY_LABEL: Record<Category, string> = {
  ale: 'ale', stout: 'stout', grog: 'grog', tonic: 'tonic', spirits: 'spirits', cider: 'cider', wine: 'wine',
};
