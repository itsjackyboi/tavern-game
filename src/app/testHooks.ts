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
  };
}
