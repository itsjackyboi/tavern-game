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
  };
}
