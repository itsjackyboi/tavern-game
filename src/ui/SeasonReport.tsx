import { useEffect } from 'preact/hooks';
import type { GameController } from '../app/controller.ts';
import { seasonReport } from './bus.ts';
import { money } from './describe.ts';
import { openReport } from './tavernHealth.ts';
import { townStyle } from './townColors.ts';

/** How each of your taverns did last season. Click a row for its report; hides itself after 25 s. */
export function SeasonReport({ ctrl }: { ctrl: GameController }) {
  const r = seasonReport.value;
  useEffect(() => {
    if (!r) return;
    const id = window.setTimeout(() => { if (seasonReport.value?.id === r.id) seasonReport.value = null; }, 25000);
    return () => window.clearTimeout(id);
  }, [r?.id]);
  if (!r) return null;
  return (
    <div class="season-report" data-testid="season-report">
      <div class="sr-head">
        <b>Season report</b>
        <button class="btn btn-tiny" aria-label="Close" onClick={() => (seasonReport.value = null)}>✕</button>
      </div>
      {r.rows.map((row) => {
        const t = ctrl.world.taverns[row.tavernId];
        return (
          <button key={row.tavernId} class={`sr-row ${row.bad ? 'bad' : ''}`} style={townStyle(t?.city)} onClick={() => t && openReport(t)} title="Open this tavern's report">
            <span class="sr-town">{row.town}</span>
            <span class={row.net >= 0 ? 'up' : 'down'}>{row.net >= 0 ? '+' : ''}{money(row.net)}◉</span>
            <span class={row.repDelta >= 0.5 ? 'up' : row.repDelta <= -0.5 ? 'down' : 'muted'}>rep {row.repDelta >= 0 ? '+' : ''}{row.repDelta.toFixed(0)}</span>
            <span class="muted">{Math.round(row.served)} served</span>
            <span class="sr-verdict">{row.bad ? '⚠ ' : '✔ '}{row.verdict}</span>
          </button>
        );
      })}
    </div>
  );
}
