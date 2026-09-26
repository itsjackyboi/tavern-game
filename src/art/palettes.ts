// Per-city colour ramps (docs/PLAN.md §2.11). Used for UI accents now and for
// pack-sprite recolours and building composers from M6 on.
//  - Providence: medieval grey stone, slate, gold clock-heart, tonic red.
//  - Shanty Town: wrecked-ship wood with bright, mismatched flags.
//  - Roto Kaiishi: strictly black, grey and red.
//  - Aleforge: whimsical, multi-coloured roofs.

export interface CityPalette {
  /** Main UI accent. */
  accent: string;
  /** Background/base tones, darkest first. */
  base: readonly string[];
  /** Highlight colours (roofs, flags, lanterns). */
  highlights: readonly string[];
}

export const PALETTES: Record<string, CityPalette> = {
  aleforge: {
    accent: '#e9a23b',
    base: ['#3b2618', '#6b4428', '#a8743f', '#d9b27c'],
    highlights: ['#2a9d8f', '#7b4fa0', '#e76f51', '#e07aa0', '#f4c542', '#4a7fd1'],
  },
  shanty: {
    accent: '#e63946',
    base: ['#2a1a10', '#5e3d28', '#8a5a3b', '#9a948a'],
    highlights: ['#e63946', '#ffd23f', '#1fb5ac', '#d6336c', '#3a86ff'],
  },
  providence: {
    accent: '#d4a72c',
    base: ['#2b3340', '#3d4a5c', '#5c677d', '#8d99ae', '#b8c0cc'],
    highlights: ['#d4a72c', '#b3202a', '#e8e4d8'],
  },
  roto: {
    accent: '#c1121f',
    base: ['#0d0d0e', '#1c1c1f', '#2b2b2e', '#4a4a4f', '#6b6b70'],
    highlights: ['#c1121f', '#7a0c14', '#9a9aa0'],
  },
};
