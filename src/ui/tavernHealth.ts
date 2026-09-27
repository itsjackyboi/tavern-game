import type { Content } from '../content/schema.ts';
import { cityOf, drinkOf, playerTaverns, staffAt } from '../sim/lookup.ts';
import { repTrend } from '../sim/network.ts';
import { kegsAtSea } from '../sim/shipping.ts';
import type { Tavern, World } from '../sim/types.ts';
import { drawer, selectedCity } from './bus.ts';

// What's wrong at each of your taverns, at a glance: used by the Your taverns
// list, the tavern report, the Network table and the trouble chime.

export interface Issue {
  /** Stable while the problem lasts (the chime plays once per new key). */
  key: string;
  /** 'problem' flashes red and chimes; 'watch' is amber and quiet. */
  level: 'problem' | 'watch';
  text: string;
  fix: string;
}

export const ROLE_ICON: Record<string, string> = { bar: '🍺', floor: '🏃', door: '✊', cellar: '🛢', stage: '♪', intel: '👁', manage: '✎' };
export const STATUS_LABEL: Record<string, string> = { building: 'building', establishing: 'establishing', established: 'established', struggling: 'struggling', closed: 'closed' };

/** Service speed a tavern keeps while you're away (see serviceCapacity). */
export function servicePct(t: Tavern): number {
  return Math.round((0.6 + 0.4 * t.attention) * 100);
}

/** Staff icons, manager first. */
export function staffIcons(w: World, t: Tavern): string {
  const mgr = t.managerId ? ROLE_ICON.manage : '';
  return mgr + staffAt(w, t.id).map((s) => ROLE_ICON[s.role] ?? '•').join('');
}

/** Revenue minus costs so far this season (kegs as ordered; rent and wages land at season end). */
export function seasonNet(t: Tavern): number {
  return t.kpi.revenue - t.kpi.costs;
}

export function lastSeasonNet(t: Tavern): number | null {
  return t.lastKpi ? t.lastKpi.revenue - t.lastKpi.costs : null;
}

export function walkoutShare(k: Tavern['kpi']): number {
  const n = k.served + k.walkouts;
  return n > 20 ? k.walkouts / n : 0;
}

export function tavernIssues(w: World, c: Content, t: Tavern): Issue[] {
  if (t.status === 'closed' || t.status === 'building') return [];
  const out: Issue[] = [];
  const here = w.focus.tavernId === t.id;
  for (const m of t.menu.slice(0, t.taps)) {
    const d = m.drinkId;
    const tap = t.tapLevels[d] ?? 0;
    const cellar = t.cellar[d] ?? 0;
    const coming = t.orders.some((o) => o.drinkId === d) || kegsAtSea(w, t.id, d) > 0;
    if (coming) continue;
    const name = drinkOf(c, d).name;
    if (tap <= 0 && cellar <= 0) out.push({ key: `dry:${d}`, level: 'problem', text: `Out of ${name}`, fix: 'Order kegs, turn on auto-restock, or set up a supply line.' });
    else if (cellar <= 0) out.push({ key: `low:${d}`, level: 'watch', text: `Last keg of ${name} on tap`, fix: 'Order kegs before the tap runs dry.' });
  }
  if (!here && !staffAt(w, t.id).some((s) => s.role === 'bar' || s.role === 'floor')) {
    out.push({ key: 'noserve', level: 'problem', text: 'Nobody to serve', fix: 'Hire a tapster or runner (Manage staff).' });
  }
  if (t.status === 'struggling') out.push({ key: 'struggling', level: 'problem', text: 'Struggling', fix: 'Reputation is under 30. Below 6 while you’re away, it closes. Visit it or fix its service.' });
  if (t.closedUntil > w.tick) out.push({ key: 'shut', level: 'problem', text: `Shut for ${Math.ceil((t.closedUntil - w.tick) / 20)}s`, fix: 'A crisis closed the doors; it reopens on its own.' });
  if (repTrend(t) <= -3) out.push({ key: 'repfall', level: 'problem', text: 'Reputation falling fast', fix: 'Check for dry taps, long waits and walkouts.' });
  if (!here && t.attention < 0.5) out.push({ key: 'attention', level: 'watch', text: `Serving at ${servicePct(t)}%`, fix: 'A visit resets it; a better manager slows the decline.' });
  if (walkoutShare(t.kpi) > 0.25) out.push({ key: 'walkouts', level: 'watch', text: `${Math.round(walkoutShare(t.kpi) * 100)}% walking out`, fix: 'More seats (Build), more staff, or fewer dry taps.' });
  const last = lastSeasonNet(t);
  if (last !== null && last < 0) out.push({ key: 'loss', level: 'watch', text: 'Lost money last season', fix: 'Check prices, wages and rent against sales.' });
  const asks = w.prompts.active.filter((p) => p.tavernId === t.id).length;
  if (asks) out.push({ key: 'ask', level: 'watch', text: `${asks} request${asks > 1 ? 's' : ''} waiting`, fix: 'Answer it in the inbox or the report.' });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'problem' ? -1 : 1));
}

/** The biggest problem of the season just closed, or a good word. */
export function seasonVerdict(t: Tavern, w: World, seasonLen: number): { text: string; bad: boolean } {
  const k = t.lastKpi;
  // Opened partway through the season just closed: too early to judge.
  if (!k || w.tick - t.openTick < seasonLen + 40) return { text: 'its first season: just opened', bad: false };
  const net = k.revenue - k.costs;
  const rep = t.lastRepDelta ?? 0;
  const walk = walkoutShare(k);
  if (net < 0) return { text: `lost ${Math.round(-net)}◉: check prices, wages and rent`, bad: true };
  if (walk > 0.25) return { text: `${Math.round(walk * 100)}% walked out: more seats or staff`, bad: true };
  if (rep <= -5) return { text: `reputation fell ${Math.round(-rep)}`, bad: true };
  if (k.brawls >= 4) return { text: `${Math.round(k.brawls)} brawls: hire a bruiser`, bad: true };
  if (k.thefts >= 4) return { text: `${Math.round(k.thefts)} thefts: hire a bruiser`, bad: true };
  return { text: rep >= 3 ? 'a good season, and rising' : 'a good season', bad: false };
}

/** Problem keys across all your taverns ("tavernId|key"), for the chime. */
export function problemKeys(w: World, c: Content): string[] {
  const keys: string[] = [];
  for (const t of playerTaverns(w)) for (const i of tavernIssues(w, c, t)) if (i.level === 'problem') keys.push(`${t.id}|${i.key}`);
  return keys;
}

/** Opens a tavern's report (the city drawer for its town) without going there. */
export function openReport(t: Tavern): void {
  selectedCity.value = t.city;
  drawer.value = 'city';
}

export function townName(c: Content, t: Tavern): string {
  return cityOf(c, t.city).name;
}
