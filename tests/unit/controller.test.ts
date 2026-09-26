import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller.ts';
import { loadContent } from '../../src/content/index.ts';
import { hashValue } from '../../src/sim/hash.ts';

const content = loadContent();
const make = (seed = 'a') => new GameController(content, { seed, homeCity: 'aleforge' }).noAutosave();

describe('controller', () => {
  it('step() advances the sim and the ranked clock (50 ms per tick)', () => {
    const c = make();
    c.step(40);
    expect(c.world.tick).toBe(40);
    expect(c.clock.simMs).toBe(2000);
  });

  it('pausing records a pause and needs an explicit resume', () => {
    const c = make();
    c.pause('hidden');
    c.pause('blur');
    expect(c.paused).toBe('hidden');
    expect(c.clock.pauses).toBe(1);
    c.resume();
    expect(c.paused).toBeNull();
  });

  it('commands dispatched while paused apply immediately (menus still work)', () => {
    const c = make();
    c.pause('manual');
    c.dispatch({ type: 'setView', view: 'world' });
    expect(c.world.focus.view).toBe('world');
    expect(c.takeFeedback()[0]?.result).toBe('ok');
  });

  it('replay: same seed and command log give the same world hash', () => {
    const run = () => {
      const c = make('replay');
      c.step(100);
      c.dispatch({ type: 'setView', view: 'world' });
      c.step(500);
      c.dispatch({ type: 'setView', view: 'floor' });
      c.step(1500);
      return hashValue(c.world);
    };
    expect(run()).toBe(run());
  });

  it('the world round-trips through JSON and keeps running identically', () => {
    const a = make('json');
    a.step(700);
    const b = new GameController(content, { save: JSON.parse(JSON.stringify(a.saveFile())) }).noAutosave();
    expect(b.paused).toBe('manual');
    b.resume();
    a.step(900);
    b.step(900);
    expect(hashValue(b.world)).toBe(hashValue(a.world));
    expect(b.clock.sessions).toBe(1);
  });
});
