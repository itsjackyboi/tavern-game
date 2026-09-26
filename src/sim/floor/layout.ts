import type { Pos } from '../types.ts';

// Tavern floor geometry in tile units (16 px tiles, 30 x 17 grid). The sim and
// the renderer both read this, so positions always agree.

export const GRID_W = 30;
export const GRID_H = 17;

/** Bar counter runs along this row. Workers stand one row above it. */
export const BAR_ROW = 4;
export const BAR_X0 = 2;
export const BAR_X1 = 13;
export const BEHIND_BAR_ROW = 3;

export const TAP_XS = [3, 5, 7, 9, 11];
export const CELLAR: Pos = { x: 1, y: 3 };
export const TILL: Pos = { x: 13, y: 3 };
export const STAGE: Pos = { x: 26, y: 3 };
export const DOOR: Pos = { x: 15, y: 16 };
export const OWNER_HOME: Pos = { x: 8, y: 3 };
export const DOOR_POST: Pos = { x: 17, y: 15 };

/** Where patrons queue at the door, first slot first. */
export const QUEUE_SLOTS: Pos[] = [
  { x: 14, y: 14 }, { x: 16, y: 14 }, { x: 13, y: 15 }, { x: 17, y: 15 }, { x: 12, y: 14 }, { x: 18, y: 14 }, { x: 11, y: 15 }, { x: 19, y: 15 },
];

/** Table slots in unlock order. Each table seats two: at x-1 and x+1. */
export const TABLE_SLOTS: Pos[] = [
  { x: 4, y: 7 }, { x: 8, y: 7 }, { x: 17, y: 7 }, { x: 21, y: 7 }, { x: 4, y: 10 }, { x: 8, y: 10 },
  { x: 17, y: 10 }, { x: 21, y: 10 }, { x: 25, y: 7 }, { x: 25, y: 10 }, { x: 12, y: 7 }, { x: 12, y: 10 },
  { x: 4, y: 13 }, { x: 8, y: 13 }, { x: 22, y: 13 }, { x: 26, y: 13 },
];

export const MAX_TABLES = TABLE_SLOTS.length;

export function seatPos(table: Pos, seat: number): Pos {
  return { x: table.x + (seat === 0 ? -1 : 1), y: table.y };
}

export function tapPos(i: number): Pos {
  return { x: TAP_XS[i] ?? 3, y: BAR_ROW };
}

/** Where a worker stands to pour from tap i. */
export function pourPos(i: number): Pos {
  return { x: TAP_XS[i] ?? 3, y: BEHIND_BAR_ROW };
}

/** Standing spot to serve a seated patron (just below the seat). */
export function servePos(p: Pos): Pos {
  return { x: p.x, y: p.y + 1 };
}

export function dist(a: Pos, b: Pos): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
