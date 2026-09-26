import type { Board, BoardCategory, BoardRow, RunRecord } from './types.ts';

// Board filtering and sorting, shared by the local and mock adapters (the
// Apps Script does the same on the server).

export function inCategory(r: RunRecord, cat: BoardCategory): boolean {
  if (cat === 'assisted') return r.category === 'assisted';
  if (cat === 'ngplus') return r.category === 'ngplus';
  if (r.category !== 'standard') return false;
  return cat === 'overall' || r.homeCity === cat;
}

export function rankRuns(runs: RunRecord[], board: Board, cat: BoardCategory, n: number): BoardRow[] {
  const rows = runs.filter((r) => inCategory(r, cat) && (board === 'cv' || r.winType === 'monopoly'));
  rows.sort((a, b) =>
    board === 'monopoly'
      ? (a.monopolyMs ?? Infinity) - (b.monopolyMs ?? Infinity) || b.finalCV - a.finalCV
      : b.finalCV - a.finalCV || a.simMs - b.simMs,
  );
  return rows.slice(0, n).map((r, i) => ({
    rank: i + 1, name: r.name, homeCity: r.homeCity, value: board === 'monopoly' ? (r.monopolyMs ?? 0) : r.finalCV,
    winType: r.winType, date: r.date.slice(0, 10),
  }));
}
