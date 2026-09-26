import { useState } from 'preact/hooks';
import type { GameController } from '../app/controller.ts';
import { playerTaverns } from '../sim/lookup.ts';
import { drawer } from './bus.ts';
import { SoundSettings } from './drawers/Drawers.tsx';
import { vm } from './vm.ts';

const REASON: Record<string, string> = {
  manual: 'Paused',
  hidden: 'Paused — you left the tab',
  blur: 'Paused — the window lost focus',
};

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

// Pausing stops the clock. The board stays visible behind a dim veil (owner's
// call in v1.2). The veil doubles as the game menu.
export function PauseVeil({ ctrl, onExit }: { ctrl: GameController; onExit: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const v = vm.value;
  if (!v?.paused || v.paused === 'help') return null;
  const saves = !ctrl.debug && !ctrl.tutorial;
  return (
    <div class="pause-veil" role="dialog" aria-label="Paused" data-testid="pause-veil">
      <div class="pause-card">
        <h2>{REASON[v.paused]}</h2>
        <p class="pause-note">
          The clock is stopped.
          {ctrl.world.meta.playerName && <span class="pause-who">Innkeeper {ctrl.world.meta.playerName} of {playerTaverns(ctrl.world)[0]?.name ?? 'The Last Call'}</span>}
        </p>
        <div class="pause-menu">
          <button class="btn btn-primary" onClick={() => ctrl.resume()} autofocus>
            Resume <kbd>P</kbd>
          </button>
          <button class="btn" onClick={() => { ctrl.resume(); drawer.value = 'help'; }}>How to play</button>
          <button class="btn" onClick={toggleFullscreen}>Fullscreen on/off</button>
          <button
            class="btn"
            disabled={leaving}
            onClick={() => { setLeaving(true); onExit(); }}
            data-testid="exit-title"
          >
            {saves ? 'Save & return to title' : 'Return to title'}
          </button>
          {!saves && <p class="small muted">{ctrl.tutorial ? 'Tutorial runs aren’t saved.' : 'Debug runs aren’t saved.'}</p>}
        </div>
        <div class="pause-settings">
          <SoundSettings />
        </div>
      </div>
    </div>
  );
}
