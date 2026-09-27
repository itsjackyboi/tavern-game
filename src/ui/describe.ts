import type { Category, Content, Drink, Segment, Upgrade } from '../content/schema.ts';
import { drinkOf, prefOf } from '../sim/lookup.ts';
import type { Tavern } from '../sim/types.ts';

// Card and tooltip text is generated from stats, never written as prose
// (docs/PLAN.md §3): names carry the lore, descriptions carry the numbers.

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (m: number) => sign(Math.round((m - 1) * 100)) + '%';

export function describeDrink(d: Drink): string {
  const parts = [d.category, `Q${d.quality}`, `${d.price}◉`];
  if (d.brawl) parts.push(`brawl ${pct(1 + d.brawl)}`);
  if (Math.abs(d.church) >= 0.2) parts.push(`church ${d.church > 0 ? '+' : '−'}`);
  if (d.taboo) parts.push('taboo');
  return parts.join(' · ');
}

export function recipeText(c: Content, d: Drink): string {
  return Object.entries(d.recipe)
    .map(([ing, n]) => `${n} ${c.ingredients.find((i) => i.id === ing)?.name ?? ing}`)
    .join(', ');
}

export function describeUpgrade(u: Upgrade): string {
  const e = u.effects;
  const out: string[] = [];
  if (e.tables) out.push(`+${e.tables} tables`);
  if (e.taps) out.push(`+${e.taps} tap`);
  if (e.decor) out.push(`+${Math.round(e.decor * 100)} decor`);
  if (e.quality) out.push(`+${e.quality} quality${e.qualityCategories ? ` (${e.qualityCategories.join(', ')})` : ''}`);
  if (e.brawl) out.push(`${sign(Math.round(e.brawl * 100))}% brawls`);
  if (e.theft) out.push(`${sign(Math.round(e.theft * 100))}% theft`);
  if (e.spoilage) out.push(`${sign(Math.round(e.spoilage * 100))}% spoilage`);
  if (e.craftRep) out.push(`+${Math.round(e.craftRep * 100)}% craft rep`);
  if (e.foundCost) out.push(`${sign(Math.round(e.foundCost * 100))}% founding cost`);
  if (e.tunnels) out.push('fast, safe shipping to and from Aleforge');
  if (e.favorTrade) out.push('Favor trading');
  if (e.church) out.push('+church pull');
  if (e.appeal) out.push(`appeal: ${Object.entries(e.appeal).map(([k, v]) => `${k} ${sign(Math.round(v * 100))}`).join(', ')}`);
  return out.join(' · ');
}

export function money(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('en-US')}`;
}

export const RESULT_TEXT: Record<string, string> = {
  cash: 'Not enough Duckets',
  rep: 'Network reputation too low (40 needed)',
  lots: 'No free lots left in that city',
  owned: 'You already have a tavern there',
  full: 'This tavern is fully staffed',
  max: 'Already at the maximum',
  city: 'Only available in its own city',
  taps: 'Not enough taps for that menu',
  locked: 'Recipe not known yet',
  spiritweed: 'Needs Spiritweed (from Veilwalker vows)',
  weed: 'Needs Spiritweed (from Veilwalker vows)',
  stock: 'Not enough kegs in that cellar',
  same: 'Pick two different things',
  tried: 'Already tried that pair',
  nothing: 'Nothing new came of it',
  cap: 'No more credit available',
  ended: 'The run is over',
  bad: 'Can’t do that',
};

/**
 * One taste for a patron's hover line: either the kind of drink their crowd
 * likes best, or one on your taps they don't care for. Never both, and never
 * what they'd pay. Which one is fixed per patron.
 */
export function tasteNote(c: Content, seg: Segment, t: Tavern, patronId: number, night: boolean): string {
  const cats = [...new Set(c.drinks.map((d) => d.category))] as Category[];
  const liked = cats.map((k) => [k, prefOf(seg, k, night)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  const onTap = [...new Set(t.menu.slice(0, t.taps).map((m) => drinkOf(c, m.drinkId).category))];
  const disliked = onTap.map((k) => [k, prefOf(seg, k, night)] as const).filter(([, v]) => v <= 0).sort((a, b) => a[1] - b[1])[0];
  const showDislike = disliked && (patronId % 2 === 1 || !liked);
  if (showDislike) return disliked[1] < 0 ? `dislikes ${disliked[0]}` : `doesn't care for ${disliked[0]}`;
  return liked ? `prefers ${liked[0]}` : '';
}
