// Named sprite keys -> frames in the vendor sheets (16x16 tiles).
// Sheets come from Kenney CC0 packs (see CREDITS.md). Open dev.html to see every named sprite.

export const TILE = 16;

export const SHEETS = {
  dungeon: { key: 'dungeon', url: 'assets/sprites/tiny-dungeon.png', cols: 12, spacing: 0 },
  town: { key: 'town', url: 'assets/sprites/tiny-town.png', cols: 12, spacing: 0 },
  factory: { key: 'factory', url: 'assets/sprites/tiny-factory.png', cols: 12, spacing: 0 },
  rogue: { key: 'rogue', url: 'assets/sprites/roguelike-characters.png', cols: 54, spacing: 1 },
} as const;

export type SheetKey = keyof typeof SHEETS;

export interface SpriteRef {
  sheet: SheetKey;
  frame: number;
}

const d = (frame: number): SpriteRef => ({ sheet: 'dungeon', frame });
const t = (frame: number): SpriteRef => ({ sheet: 'town', frame });
const f = (frame: number): SpriteRef => ({ sheet: 'factory', frame });
export const rogue = (col: number, row: number): SpriteRef => ({ sheet: 'rogue', frame: row * 54 + col });

export const SPRITES = {
  // Interior
  floorSand: d(48),
  floorSandWorn: d(49),
  floorBrown: d(0),
  floorStone: t(109),
  floorStoneWorn: t(110),
  floorDark: f(3),
  floorDarkWorn: f(9),
  wallStone: d(40),
  wallBrick: d(14),
  wallWood: t(73),
  wallWoodDark: t(72),
  wallGrey: t(77),
  shelf: d(63),
  cabinet: d(75),
  table: d(72),
  stool: d(73),
  keg: d(82),
  kegSmall: f(97),
  chest: d(89),
  doorWood: d(45),
  doorStone: t(89),
  hatch: f(23),
  kettle: f(126),
  tank: f(69),
  crate: f(73),
  valve: f(81),
  bell: t(104),
  // Characters (defaults; patrons are composed from the rogue sheet)
  avatar: d(85),
  patronA: d(97),
  // Items
  mug: d(113),
  potionRed: d(115),
  potionGreen: d(114),
  coin: t(93),
  // Town (world map)
  roofRed: t(52),
  roofRedPeak: t(63),
  roofGrey: t(48),
  roofGreyPeak: t(51),
  wallWoodTown: t(72),
  wallStoneTown: t(76),
  doorTown: t(85),
  well: t(104),
  tree: t(16),
  treeAutumn: t(15),
  bush: t(5),
  grass: t(0),
  field: t(24),
} as const satisfies Record<string, SpriteRef>;

export type SpriteName = keyof typeof SPRITES;

export function frameXY(ref: SpriteRef): { x: number; y: number } {
  const s = SHEETS[ref.sheet];
  const col = ref.frame % s.cols;
  const row = Math.floor(ref.frame / s.cols);
  return { x: col * (TILE + s.spacing), y: row * (TILE + s.spacing) };
}
