import { spawnPrompt } from '../sim/prompts.ts';
import type { GameController } from './controller.ts';

// Exposed on window.__game only for ?debug runs (which are unranked) and dev builds.
// Playwright uses these to drive and inspect the game deterministically.

export interface TestHooks {
  step(n: number): void;
  tick(): number;
  calendar(): ReturnType<GameController['calendar']>;
  paused(): string | null;
  pause(): void;
  resume(): void;
  /** Debug only: adds Duckets to the player (e.g. to force a monopoly). */
  grant(duckets: number): void;
  status(): string;
  view(): 'floor' | 'world';
  prompts(): number;
  /** Debug only: empties the player's purse (to see the money warnings). */
  drain(): void;
  phase(): string;
  /** Debug only: brings in a decision by id. */
  prompt(id: string): void;
  floor(): {
    patrons: Array<{ id: number; state: string; x: number; y: number }>;
    tables: Array<{ id: number; x: number; y: number; dirty: boolean; free: boolean }>;
  } | null;
}

declare global {
  interface Window {
    __game?: TestHooks;
  }
}

export function installTestHooks(ctrl: GameController): void {
  window.__game = {
    step: (n) => ctrl.step(n),
    tick: () => ctrl.world.tick,
    calendar: () => ctrl.calendar(),
    paused: () => ctrl.paused,
    pause: () => ctrl.pause('manual'),
    resume: () => ctrl.resume(),
    grant: (n) => {
      const me = ctrl.world.companies[ctrl.world.playerId];
      if (me) me.cash += n;
    },
    status: () => ctrl.world.run.status,
    view: () => ctrl.world.focus.view,
    prompts: () => ctrl.world.prompts.active.length,
    drain: () => {
      const me = ctrl.world.companies[ctrl.world.playerId];
      if (me) me.cash = 0;
    },
    phase: () => ctrl.calendar().phase,
    prompt: (id) => {
      spawnPrompt(ctrl.world, ctrl.content, id, { tavernId: ctrl.world.focus.tavernId, vars: { rival: 'The Gulf Tapworks' } });
      ctrl.step(1);
    },
    floor: () => {
      const f = ctrl.world.floor;
      if (!f) return null;
      return {
        patrons: f.patrons.map((p) => ({ id: p.id, state: p.state, x: p.x, y: p.y })),
        tables: f.tables.map((t) => ({ id: t.id, x: t.x, y: t.y, dirty: t.dirty, free: !t.seats[0] && !t.seats[1] })),
      };
    },
  };
}
