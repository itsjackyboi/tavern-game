import type { GameController } from '../../app/controller.ts';
import type { Phase } from '../../sim/time.ts';
import { vm } from '../vm.ts';

const PHASE_ICON: Record<Phase, string> = { day: '☀', night: '☾', lastCall: '🔔', holiday: '✦' };
const PHASE_LABEL: Record<Phase, string> = { day: 'Day', night: 'Night', lastCall: 'Last Call', holiday: 'Holiday Keg' };

// Top strip. Icons and numbers only; no sentences during live play.
export function Hud({ ctrl }: { ctrl: GameController }) {
  const v = vm.value;
  if (!v) return null;
  return (
    <header class="hud" data-testid="hud">
      <span class="hud-item hud-date" title="Year and season">
        <b>Y{v.year}</b> {v.segment}
      </span>
      <span class={`hud-item hud-phase phase-${v.phase}`} title={PHASE_LABEL[v.phase]} data-testid="hud-phase">
        {PHASE_ICON[v.phase]}
      </span>
      <span class="hud-item hud-clock" title="Run clock" data-testid="hud-clock">⏱ {v.clock}</span>
      <span class="hud-item hud-duckets" title="Duckets">◉ {v.duckets}</span>
      {ctrl.debug && <span class="hud-item hud-debug" title="Debug run: unranked">DEBUG</span>}
      <button class="hud-item btn btn-small" onClick={() => ctrl.pause('manual')} aria-label="Pause">
        ❚❚
      </button>
    </header>
  );
}
