import type { GameController } from '../app/controller.ts';
import { vm } from './vm.ts';

const REASON: Record<string, string> = {
  manual: 'Paused',
  hidden: 'Paused — you left the tab',
  blur: 'Paused — the window lost focus',
};

// Owner's rule: pausing stops the clock and hides the board, so a pause can't
// be used as free planning time. The veil is opaque on purpose.
export function PauseVeil({ ctrl }: { ctrl: GameController }) {
  const v = vm.value;
  if (!v?.paused) return null;
  return (
    <div class="pause-veil" role="dialog" aria-label="Paused" data-testid="pause-veil">
      <div class="pause-card">
        <h2>{REASON[v.paused]}</h2>
        <p class="pause-note">The clock is stopped.</p>
        <button class="btn btn-primary" onClick={() => ctrl.resume()} autofocus>
          Resume <kbd>P</kbd>
        </button>
      </div>
    </div>
  );
}
