import { signal } from '@preact/signals';
import type { GameController, PauseReason } from '../app/controller.ts';
import { player } from '../sim/lookup.ts';
import { SEGMENT_LABEL, formatClock, type Phase } from '../sim/time.ts';

// The HUD reads a small view model derived from the world at up to 10 Hz,
// never the world itself, so Preact re-renders stay cheap.

export interface ViewModel {
  year: number;
  segment: string;
  phase: Phase;
  clock: string;
  duckets: number;
  paused: PauseReason | null;
}

export const vm = signal<ViewModel | null>(null);

export function bindViewModel(ctrl: GameController): () => void {
  let last = 0;
  let lastPaused: PauseReason | null = null;
  const update = (force = false) => {
    const now = performance.now();
    if (!force && now - last < 100 && ctrl.paused === lastPaused) return;
    last = now;
    lastPaused = ctrl.paused;
    const cal = ctrl.calendar();
    vm.value = {
      year: cal.year,
      segment: SEGMENT_LABEL[cal.segment],
      phase: cal.phase,
      clock: formatClock(ctrl.clock.simMs),
      duckets: Math.round(player(ctrl.world).cash),
      paused: ctrl.paused,
    };
  };
  update(true);
  return ctrl.subscribe(() => update());
}
