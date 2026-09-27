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
        <small class="hud-label">Year · season</small>
        <span><b>Y{v.year}</b> {v.segment}</span>
      </span>
      <span class="hud-item hud-season" title={v.season.holiday ? 'The Holiday Keg' : `${PHASE_LABEL[v.phase]}. Day, then night, then Last Call.`} data-testid="hud-season">
        <small class="hud-label">
          <span class={`hud-phase phase-${v.phase}`} data-testid="hud-phase">{PHASE_ICON[v.phase]}</span>{' '}
          {v.season.holiday ? 'Holiday Keg' : v.season.lcIn === null ? <b class="lc-now">Last Call!</b> : `Last Call in ${v.season.lcIn}s`}
        </small>
        <span class="season-bar">
          {v.season.dayEnd > 0 && <span class="sb-day" style={{ width: `${v.season.dayEnd * 100}%` }} />}
          <span class="sb-night" style={{ left: `${v.season.dayEnd * 100}%`, width: `${(v.season.lcStart - v.season.dayEnd) * 100}%` }} />
          <span class="sb-lc" style={{ left: `${v.season.lcStart * 100}%` }} />
          <span class="sb-now" style={{ left: `${v.season.frac * 100}%` }} />
        </span>
      </span>
      <span class="hud-item hud-clock" title="Run clock (stops when paused)" data-testid="hud-clock"><small class="hud-label">Run time</small>⏱ {v.clock}</span>
      <span class={`hud-item hud-duckets ${v.duckets < 0 ? 'neg' : ''} ${v.lowCash ? 'warn' : ''}`} title="Duckets: your cash"><small class="hud-label">Duckets</small>◉ {money(v.duckets)}</span>
      {v.hasShanty && <span class="hud-item hud-favor" title="Favor (barrels), Shanty Town's currency"><small class="hud-label">Favor</small>⚓ {v.favor}</span>}
      {v.debt > 0 && <span class="hud-item hud-debt" title="Debt to the Brewers' Lane moneylender"><small class="hud-label">Debt</small>⛓ {money(v.debt)}</span>}
      <span class="hud-item hud-cv" title={`Company Value. Next biggest: ${v.nextName} (${money(v.nextCV)})`}>
        <small class="hud-label">Company Value · rank</small>
        <span>CV <b>{money(v.cv)}</b> <span class={`rank rank-${v.rank}`}>#{v.rank}</span></span>
      </span>
      <span class="hud-item hud-mono" title={`Monopoly: ${monoPct}% of the way to 2× ${v.nextName}`}>
        <small class="hud-label">Monopoly {monoPct}%</small>
        <span class="mono-bar"><span class="mono-fill" style={{ width: `${monoPct}%` }} /></span>
      </span>
      <span class="hud-item hud-sisters" title="Sister taverns established (3 needed for the sponsorship)">
        <small class="hud-label">Sisters {v.sisters}/3</small>
        <span class="pips">
          {[0, 1, 2].map((i) => (
            <span key={i} class={`sister-pip ${i < v.sisters ? 'on' : ''}`} />
          ))}
        </span>
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
