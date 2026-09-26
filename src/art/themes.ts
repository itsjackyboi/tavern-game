import type { CityId } from '../content/schema.ts';
import type { SpriteName } from './atlas.ts';

// Per-city interior themes (docs/PLAN.md §2.11):
//  Aleforge warm wood and colourful kettles; Shanty Town a ship's hull with flags;
//  Providence grey stone, pews and a bell; Roto black, grey and red lacquer.

export interface InteriorTheme {
  floor: [SpriteName, SpriteName];
  floorTint: number;
  /** Draw plank seams over the floor tiles (wooden interiors). */
  planks?: boolean;
  /** Draw flagstone seams over the floor tiles (stone halls). */
  flags?: boolean;
  wall: SpriteName;
  wallTint: number;
  furnitureTint: number;
  backdrop: SpriteName[];
  accents: number[];
  night: number;
  bg: string;
}

export const THEMES: Record<CityId, InteriorTheme> = {
  aleforge: {
    floor: ['floorSand', 'floorSandWorn'], floorTint: 0xc48d5c, planks: true,
    wall: 'wallWood', wallTint: 0xffffff, furnitureTint: 0xffe0b8,
    backdrop: ['kettle', 'tank', 'shelf', 'kettle', 'cabinet'],
    accents: [0x2a9d8f, 0x7b4fa0, 0xe76f51, 0xe07aa0, 0xf4c542, 0x4a7fd1],
    night: 0x1a0f30, bg: '#2a1a10',
  },
  shanty: {
    floor: ['floorSand', 'floorSandWorn'], floorTint: 0x9a7048, planks: true,
    wall: 'wallWoodDark', wallTint: 0xc8a080, furnitureTint: 0xd8b890,
    backdrop: ['crate', 'keg', 'shelf', 'crate', 'chest'],
    accents: [0xe63946, 0xffd23f, 0x1fb5ac, 0xd6336c, 0x3a86ff],
    night: 0x06142a, bg: '#1a120b',
  },
  providence: {
    floor: ['floorStone', 'floorStone'], floorTint: 0xc8ccd6, flags: true,
    wall: 'wallStone', wallTint: 0xdfe3ec, furnitureTint: 0xb9a58a,
    backdrop: ['shelf', 'cabinet', 'valve', 'cabinet', 'shelf'],
    accents: [0xd4a72c, 0xb3202a, 0xe8e4d8],
    night: 0x100824, bg: '#1b2029',
  },
  roto: {
    floor: ['floorDark', 'floorDarkWorn'], floorTint: 0x6b6b70,
    wall: 'wallBrick', wallTint: 0x55555c, furnitureTint: 0x4a4a4f,
    backdrop: ['crate', 'valve', 'crate', 'tank', 'crate'],
    accents: [0xc1121f, 0x7a0c14, 0x9a9aa0],
    night: 0x12000a, bg: '#0d0d0e',
  },
};

export const CATEGORY_COLOR: Record<string, number> = {
  ale: 0xe8a33d, stout: 0x5a3a22, grog: 0xb5651d, tonic: 0xd23a4a, spirits: 0x9fd3e6, cider: 0xa8c64a, wine: 0x8e2a4f,
};
export const CATEGORY_CSS: Record<string, string> = {
  ale: '#e8a33d', stout: '#7a5232', grog: '#c77a2e', tonic: '#e2485a', spirits: '#9fd3e6', cider: '#a8c64a', wine: '#b0386a',
};

/** Each drink's own colour (content/data/drinks.json), for Phaser (number) and CSS. */
export function drinkCss(c: { drinks: Array<{ id: string; color: string }> }, id: string): string {
  return c.drinks.find((d) => d.id === id)?.color ?? '#ffffff';
}
export function drinkHex(c: { drinks: Array<{ id: string; color: string }> }, id: string): number {
  return parseInt(drinkCss(c, id).slice(1), 16);
}
