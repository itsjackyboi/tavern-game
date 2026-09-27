import type { Content } from '../content/schema.ts';
import { drinkOf, drinkQuality, modsFor, servingPrice } from '../sim/lookup.ts';
import type { Tavern, World } from '../sim/types.ts';

// What a rival in your town has over you right now, for the "Rivals here"
// rows. Without a seasoned informant you get the gist; with one, the numbers.

const p1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export interface RivalEdge { text: string; hot: boolean }

export function rivalEdge(w: World, c: Content, rival: Tavern, mine: Tavern, level: number): RivalEdge {
  const rm = modsFor(w, c, rival);
  const mm = modsFor(w, c, mine);
  const exact = level >= 2;
  let best: { score: number; text: string } | null = null;
  const consider = (score: number, text: string) => { if (!best || score > best.score) best = { score, text }; };
  for (const item of rival.menu) {
    const d = drinkOf(c, item.drinkId);
    const cat = d.category;
    const mineSame = mine.menu.find((m) => drinkOf(c, m.drinkId).category === cat);
    const theirP = servingPrice(c, rival, d.id, rm);
    const theirQ = drinkQuality(w, c, rival, d.id, rm);
    if (!mineSame) {
      consider(0.5, exact ? `pours ${d.name} (Q${Math.round(theirQ)}); you pour no ${cat}` : `pours ${cat}; you don’t`);
      continue;
    }
    const myP = servingPrice(c, mine, mineSame.drinkId, mm);
    const myQ = drinkQuality(w, c, mine, mineSame.drinkId, mm);
    const cheaper = (myP - theirP) / Math.max(0.1, myP);
    if (cheaper > 0.08) consider(cheaper * 4, exact ? `${cat} at ${p1(theirP)}◉ (yours ${p1(myP)}◉)` : `cheaper ${cat} than yours`);
    const better = theirQ - myQ;
    if (better > 3) consider(better / 10, exact ? `${cat} Q${Math.round(theirQ)} (yours Q${Math.round(myQ)})` : `better ${cat} than yours`);
  }
  const b = best as { score: number; text: string } | null;
  if (!b) return { text: 'nothing over you', hot: false };
  return { text: b.text, hot: b.score >= 0.6 };
}
