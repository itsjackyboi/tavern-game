import type { Content, IngredientId } from '../content/schema.ts';
import { spend } from './economy/ledger.ts';
import { collapseFloor, materializeFloor, syncFloor } from './floor/floor.ts';
import { MAX_TABLES } from './floor/layout.ts';
import { log } from './log.ts';
import { clamp, drinkOf, idx, player, upgradeCount } from './lookup.ts';
import type { Company, Tavern, World } from './types.ts';

// Player-initiated strategic actions. Each returns a short status the UI can show.

export const MAX_TAPS = 5;

export function upgradePrice(c: Content, owner: Tavern | Company, upgradeId: string): number | null {
  const u = idx(c).upgrade.get(upgradeId);
  if (!u) return null;
  const n = upgradeCount(owner, upgradeId);
  if (n >= u.max) return null;
  return Math.round(u.cost * Math.pow(u.costGrowth, n));
}

export type UpgradeResult = 'ok' | 'cash' | 'max' | 'city' | 'unknown';

export function buyUpgrade(w: World, c: Content, tavernId: string | null, upgradeId: string): UpgradeResult {
  const u = idx(c).upgrade.get(upgradeId);
  if (!u) return 'unknown';
  const me = player(w);
  const t = tavernId ? (w.taverns[tavernId] ?? null) : null;
  const owner: Tavern | Company | null = u.scope === 'company' ? me : t;
  if (!owner || (t && t.companyId !== me.id)) return 'unknown';
  if (u.city && t && t.city !== u.city) return 'city';
  const price = upgradePrice(c, owner, upgradeId);
  if (price === null) return 'max';
  if (u.effects.tables && t && t.tables >= MAX_TABLES) return 'max';
  if (u.effects.taps && t && t.taps >= MAX_TAPS) return 'max';
  if (me.cash < price) return 'cash';
  spend(me, price, 'other');
  owner.upgrades[upgradeId] = upgradeCount(owner, upgradeId) + 1;
  if (t) {
    if (u.effects.tables) t.tables = Math.min(MAX_TABLES, t.tables + u.effects.tables);
    if (u.effects.taps) t.taps = Math.min(MAX_TAPS, t.taps + u.effects.taps);
    if (u.effects.decor) t.decor += u.effects.decor;
    t.assetValue += price * 0.6;
    if (w.floor?.tavernId === t.id) syncFloor(w, c);
  }
  return 'ok';
}

export type MenuResult = 'ok' | 'locked' | 'taps';

export function setMenu(w: World, c: Content, tavernId: string, drinkIds: string[]): MenuResult {
  const t = w.taverns[tavernId];
  const me = player(w);
  if (!t || t.companyId !== me.id) return 'locked';
  if (drinkIds.length > t.taps) return 'taps';
  if (!drinkIds.every((d) => me.unlocked.includes(d))) return 'locked';
  const old = new Map(t.menu.map((m) => [m.drinkId, m.price]));
  t.menu = drinkIds.map((d) => ({ drinkId: d, price: old.get(d) ?? 1 }));
  for (const d of drinkIds) {
    drinkOf(c, d);
    t.tapLevels[d] ??= 0;
    t.cellar[d] ??= 0;
  }
  if (w.floor?.tavernId === t.id) syncFloor(w, c);
  return 'ok';
}

export function setPrice(w: World, tavernId: string, drinkId: string, mult: number): void {
  const t = w.taverns[tavernId];
  const item = t?.menu.find((m) => m.drinkId === drinkId);
  if (item && t && t.companyId === w.playerId) item.price = Math.round(clamp(mult, 0.6, 1.8) * 100) / 100;
}

export function setRestock(w: World, tavernId: string, auto: boolean, target: number): void {
  const t = w.taverns[tavernId];
  if (!t || t.companyId !== w.playerId) return;
  t.autoRestock = auto;
  t.restockTarget = Math.round(clamp(target, 0, 8));
}

export type ResearchResult = { status: 'found'; drinkId: string } | { status: 'nothing' | 'tried' | 'cash' | 'weed' | 'same' };

export function research(w: World, c: Content, a: IngredientId, b: IngredientId): ResearchResult {
  if (a === b) return { status: 'same' };
  const me = player(w);
  const key = [a, b].sort().join('+');
  if (w.research.tried.includes(key)) return { status: 'tried' };
  if ((a === 'spiritweed' || b === 'spiritweed') && me.spiritweed < 1) return { status: 'weed' };
  if (me.cash < c.economy.researchCost) return { status: 'cash' };
  spend(me, c.economy.researchCost, 'other');
  w.research.tried.push(key);
  const d = c.drinks.find((x) => x.discover && [...x.discover].sort().join('+') === key);
  if (!d) return { status: 'nothing' };
  if (!me.unlocked.includes(d.id)) me.unlocked.push(d.id);
  log(w, 'event', `New recipe: ${d.name}.`);
  return { status: 'found', drinkId: d.id };
}

export function setGrainSource(w: World, src: Company['grainSource']): void {
  player(w).grainSource = src;
}

/** Moves the zoomed-in floor to another of the player's taverns. */
export function setFocus(w: World, c: Content, tavernId: string): boolean {
  const t = w.taverns[tavernId];
  if (!t || t.companyId !== w.playerId || t.status === 'closed' || t.status === 'building') return false;
  if (w.focus.tavernId === tavernId && w.floor) return true;
  collapseFloor(w, c);
  w.focus.tavernId = tavernId;
  t.attention = 1;
  w.floor = materializeFloor(w, c, t);
  return true;
}
