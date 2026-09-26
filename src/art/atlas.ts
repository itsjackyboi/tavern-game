// Named sprite keys -> frames in the vendor sheets (all 16x16, packed, 12 columns).
// Sheets come from Kenney CC0 packs via tools/fetch-assets.mjs (see CREDITS.md).
// Open dev.html to see every named sprite.

export const TILE = 16;

export const SHEETS = {
  dungeon: { key: 'dungeon', url: 'assets/sprites/tiny-dungeon.png' },
  town: { key: 'town', url: 'assets/sprites/tiny-town.png' },
} as const;

export type SheetKey = keyof typeof SHEETS;

export interface SpriteRef {
  sheet: SheetKey;
  frame: number;
}

const d = (frame: number): SpriteRef => ({ sheet: 'dungeon', frame });
const t = (frame: number): SpriteRef => ({ sheet: 'town', frame });

export const SPRITES = {
  // Interior
  floorPlank: d(48),
  floorPlankWorn: d(49),
  wallStone: d(40),
  wallBrick: d(14),
  shelf: d(63),
  cabinet: d(75),
  table: d(72),
  stool: d(73),
  keg: d(82),
  chest: d(89),
  doorWood: d(45),
  // Characters
  avatar: d(85),
  patronA: d(97),
  patronB: d(99),
  patronC: d(98),
  patronD: d(111),
  patronE: d(100),
  patronF: d(87),
  // Items
  potionRed: d(115),
  potionGreen: d(114),
  // Town (world map, M4+)
  roofRed: t(64),
  roofGrey: t(60),
  wallWood: t(72),
  wallStoneTown: t(76),
  well: t(104),
  grass: t(0),
} as const satisfies Record<string, SpriteRef>;

export type SpriteName = keyof typeof SPRITES;
