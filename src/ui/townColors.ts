import type { CityId } from '../content/schema.ts';
import type { World } from '../sim/types.ts';

// Each town's colour, used everywhere something belongs to a town (your
// tavern list and tabs, news lines, notices, cards, reports) so you can tell
// at a glance which tavern it's about. Roto is a lighter red than "problem" red.
export const TOWN_COLOR: Record<CityId, string> = {
  aleforge: '#e9a23b',
  shanty: '#2ec4b6',
  providence: '#a47be0',
  roto: '#f59a8c',
};

/** CSS custom property carrying a town's colour. */
export function townStyle(city: CityId | null | undefined): Record<string, string> | undefined {
  return city ? { '--town': TOWN_COLOR[city] } : undefined;
}

/** The town of the player's tavern named in a piece of text (longest name wins: "The Last Call Shanty Town" over "The Last Call"). */
export function townInText(w: World, text: string): CityId | null {
  let best: { city: CityId; len: number } | null = null;
  for (const t of Object.values(w.taverns)) {
    if (t.companyId !== w.playerId || !text.includes(t.name)) continue;
    if (!best || t.name.length > best.len) best = { city: t.city, len: t.name.length };
  }
  return best?.city ?? null;
}
