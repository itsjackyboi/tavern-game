import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller.ts';
import { loadContent } from '../../src/content/index.ts';
import { hashValue } from '../../src/sim/hash.ts';

const content = loadContent();

describe('controller', () => {
  it('step() advances the sim and the ranked clock (50 ms per tick)', () => {
    const c = new GameController(content, { seed: 'a', homeCity: 'aleforge' });
    c.step(40);
    expect(c.world.tick).toBe(40);
    expect(c.clock.simMs).toBe(2000);
  });

  it('pausing records a pause and needs an explicit resume', () => {
    const c = new GameController(content, { seed: 'a', homeCity: 'shanty' });
    c.pause('hidden');
    c.pause('blur'); // already paused: ignored
    expect(c.paused).toBe('hidden');
    expect(c.clock.pauses).toBe(1);
    c.resume();
    expect(c.paused).toBeNull();
  });

  it('commands apply on the next tick', () => {
    const c = new GameController(content, { seed: 'a', homeCity: 'aleforge' });
    c.dispatch({ type: 'focus', city: 'roto' });
    expect(c.world.focus.city).toBe('aleforge');
    c.step(1);
    expect(c.world.focus.city).toBe('roto');
  });

  it('replay: same seed and command log give the same world hash', () => {
    const run = () => {
      const c = new GameController(content, { seed: 'replay', homeCity: 'providence' });
      c.step(100);
      c.dispatch({ type: 'setView', view: 'world' });
      c.step(500);
      c.dispatch({ type: 'focus', city: 'shanty' });
      c.step(1000);
      return hashValue(c.world);
    };
    expect(run()).toBe(run());
  });

  it('the world round-trips through JSON unchanged', () => {
    const c = new GameController(content, { seed: 'json', homeCity: 'roto' });
    c.step(10);
    expect(hashValue(JSON.parse(JSON.stringify(c.world)))).toBe(hashValue(c.world));
  });
});
