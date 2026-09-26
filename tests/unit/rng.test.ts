import { describe, expect, it } from 'vitest';
import { chance, pick, rand, randInt } from '../../src/sim/rng.ts';

const mk = (seed: string) => ({ meta: { seed }, rng: {} as Record<string, [number, number, number, number]> });

describe('rng', () => {
  it('is deterministic per seed and stream', () => {
    const a = mk('s1');
    const b = mk('s1');
    const xs = Array.from({ length: 50 }, () => rand(a, 'floor'));
    const ys = Array.from({ length: 50 }, () => rand(b, 'floor'));
    expect(xs).toEqual(ys);
  });

  it('streams are independent: rolling one never shifts another', () => {
    const a = mk('s1');
    const b = mk('s1');
    for (let i = 0; i < 100; i++) rand(a, 'market');
    expect(Array.from({ length: 20 }, () => rand(a, 'floor'))).toEqual(Array.from({ length: 20 }, () => rand(b, 'floor')));
  });

  it('different seeds diverge', () => {
    expect(rand(mk('s1'), 'x')).not.toEqual(rand(mk('s2'), 'x'));
  });

  it('stays in range and is roughly uniform', () => {
    const w = mk('range');
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = rand(w, 'u');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
    for (let i = 0; i < 1000; i++) {
      const n = randInt(w, 'i', 3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
    expect(['a', 'b']).toContain(pick(w, 'p', ['a', 'b']));
    expect(typeof chance(w, 'c', 0.5)).toBe('boolean');
  });

  it('state survives a JSON round trip', () => {
    const a = mk('json');
    rand(a, 'floor');
    const b = JSON.parse(JSON.stringify(a));
    expect(rand(b, 'floor')).toEqual(rand(a, 'floor'));
  });
});
