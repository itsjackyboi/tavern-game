import type { GameController } from '../../app/controller.ts';
import type { Phase } from '../../sim/time.ts';
import { useState } from 'preact/hooks';
import { audio } from '../../audio/engine.ts';
import { money } from '../describe.ts';
import { vm } from '../vm.ts';

const PHASE_ICON: Record<Phase, string> = { day: '☀', night: '☾', lastCall: '🔔', holiday: '✦' };
const PHASE_LABEL: Record<Phase, string> = { day: 'Day', night: 'Night (after the Hangover bell)', lastCall: 'Last Call', holiday: 'Holiday Keg' };

// Top strip: icons and numbers only, no sentences during live play.
export function Hud({ ctrl }: { ctrl: GameController }) {
  const [muted, setMuted] = useState(audio.vol.muted);
  const v = vm.value;
  if (!v) return null;
  const monoPct = Math.round(v.monopolyProgress * 100);
  return (
    <header class="hud" data-testid="hud">
      <span class="hud-item hud-date" title="Year and season">
        <b>Y{v.year}</b> {v.segment}
      </span>
      <span class={`hud-item hud-phase phase-${v.phase}`} title={PHASE_LABEL[v.phase]} data-testid="hud-phase">
        {PHASE_ICON[v.phase]}
      </span>
      <span class="hud-item hud-clock" title="Run clock (stops when paused)" data-testid="hud-clock">⏱ {v.clock}</span>
      <span class={`hud-item hud-duckets ${v.duckets < 0 ? 'neg' : ''} ${v.lowCash ? 'warn' : ''}`} title="Duckets">◉ {money(v.duckets)}</span>
      {v.hasShanty && <span class="hud-item hud-favor" title="Favor (barrels), Shanty Town's currency">⚓ {v.favor}</span>}
      {v.debt > 0 && <span class="hud-item hud-debt" title="Debt">⛓ {money(v.debt)}</span>}
      <span class="hud-item hud-cv" title={`Company Value. Next biggest: ${v.nextName} (${money(v.nextCV)})`}>
        CV <b>{money(v.cv)}</b> <span class={`rank rank-${v.rank}`}>#{v.rank}</span>
      </span>
      <span class="hud-item hud-mono" title={`Monopoly: ${monoPct}% of the way to 2× ${v.nextName}`}>
        <span class="mono-bar"><span class="mono-fill" style={{ width: `${monoPct}%` }} /></span>
      </span>
      <span class="hud-item hud-sisters" title="Sister taverns established (3 needed for the sponsorship)">
        {[0, 1, 2].map((i) => (
          <span key={i} class={`sister-pip ${i < v.sisters ? 'on' : ''}`} />
        ))}
      </span>
      {ctrl.debug && <span class="hud-item hud-debug" title="Debug run: unranked">DEBUG ×{ctrl.speed}</span>}
      <button
        class="hud-item btn btn-small hud-mute hud-pause"
        onClick={() => { audio.vol.muted = !audio.vol.muted; audio.applyVolumes(); setMuted(audio.vol.muted); }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title="Mute or unmute (volumes are in Help)"
      >
        {muted ? '🔇' : '♪'}
      </button>
      <button class="hud-item btn btn-small" onClick={() => ctrl.pause('manual')} aria-label="Pause" title="Pause (P)">
        ❚❚
      </button>
    </header>
  );
}
