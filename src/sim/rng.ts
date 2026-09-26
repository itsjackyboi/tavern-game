// Deterministic, named random streams (sfc32). Each system draws from its own
// stream so adding a roll in one system never shifts another's sequence.
// State lives in World.rng as plain numbers, so it serializes with the save.

export type RngState = [number, number, number, number];

/** cyrb128: hashes a string into four 32-bit seeds. */
export function hashSeed(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Advances the state in place and returns a float in [0, 1). */
export function sfc32(s: RngState): number {
  const t = (((s[0] + s[1]) >>> 0) + s[3]) >>> 0;
  s[3] = (s[3] + 1) >>> 0;
  s[0] = s[1] ^ (s[1] >>> 9);
  s[1] = (s[2] + (s[2] << 3)) >>> 0;
  s[2] = ((s[2] << 21) | (s[2] >>> 11)) >>> 0;
  s[2] = (s[2] + t) >>> 0;
  return t / 4294967296;
}

export interface HasRng {
  meta: { seed: string };
  rng: Record<string, RngState>;
}

function stream(w: HasRng, name: string): RngState {
  let s = w.rng[name];
  if (!s) {
    s = hashSeed(`${w.meta.seed}::${name}`);
    // Warm up so near-identical seeds diverge.
    for (let i = 0; i < 12; i++) sfc32(s);
    w.rng[name] = s;
  }
  return s;
}

/** Float in [0, 1) from the named stream. */
export function rand(w: HasRng, name: string): number {
  return sfc32(stream(w, name));
}

/** Integer in [min, max] inclusive. */
export function randInt(w: HasRng, name: string, min: number, max: number): number {
  return min + Math.floor(rand(w, name) * (max - min + 1));
}

export function pick<T>(w: HasRng, name: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  return items[Math.floor(rand(w, name) * items.length)] as T;
}

export function chance(w: HasRng, name: string, p: number): boolean {
  return rand(w, name) < p;
}
