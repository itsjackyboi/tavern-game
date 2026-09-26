import { lcEraOf } from './shared/validate.js';
import type { BoardRow, Boards, Era, RunRecord } from './types.ts';

// Board filtering and sorting, shared by the local and mock adapters (the
// Apps Script does the same on the server).

export const TOP_N = 10;

export function eraOf(version: string): Era {
  return lcEraOf(version) as Era;
}

const row = (r: RunRecord, i: number, value: number): BoardRow => ({
  rank: i + 1, name: r.name, tavern: r.tavernName, value, homeCity: r.homeCity, category: r.category, version: r.version, date: r.date.slice(0, 10),
});

/** Top ten fastest monopolies and top ten sponsorships by Company Value, for one era. Losses never rank. */
export function boards(runs: RunRecord[], era: Era, n = TOP_N): Boards {
  const mine = runs.filter((r) => eraOf(r.version) === era);
  const monopoly = mine
    .filter((r) => r.result === 'monopoly')
    .sort((a, b) => (a.monopolyMs ?? Infinity) - (b.monopolyMs ?? Infinity) || b.finalCV - a.finalCV)
    .slice(0, n)
    .map((r, i) => row(r, i, r.monopolyMs ?? 0));
  const sponsor = mine
    .filter((r) => r.result === 'sponsor')
    .sort((a, b) => b.finalCV - a.finalCV || a.simMs - b.simMs)
    .slice(0, n)
    .map((r, i) => row(r, i, r.finalCV));
  return { monopoly, sponsor };
}
