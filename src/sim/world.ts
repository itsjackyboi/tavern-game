import type { CityId, Content } from '../content/schema.ts';
import type { RngState } from './rng.ts';

// World is plain JSON: no classes, no functions, no Maps. It is the whole
// save file's state and must round-trip through JSON.stringify unchanged.

export const WORLD_VERSION = 1;

export interface World {
  meta: {
    v: number;
    seed: string;
    homeCity: CityId;
  };
  tick: number;
  rng: Record<string, RngState>;
  focus: { city: CityId; view: 'floor' | 'world' };
  player: { duckets: number };
}

export interface NewRunOptions {
  seed: string;
  homeCity: CityId;
}

export function createWorld(opts: NewRunOptions, content: Content): World {
  return {
    meta: { v: WORLD_VERSION, seed: opts.seed, homeCity: opts.homeCity },
    tick: 0,
    rng: {},
    focus: { city: opts.homeCity, view: 'floor' },
    player: { duckets: content.economy.startingDuckets },
  };
}
