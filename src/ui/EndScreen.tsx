import type { GameController } from '../app/controller.ts';
import { player } from '../sim/lookup.ts';
import { formatClock } from '../sim/time.ts';
import { money } from './describe.ts';
import { LeaderboardSubmit } from './leaderboard/LeaderboardPanel.tsx';
import { vm } from './vm.ts';

const TITLES: Record<string, string> = {
  monopoly: 'Monopoly!',
  sponsor: 'Sponsor of the Drunken Trials',
  lost: 'Another company was chosen',
  bankrupt: 'Bankrupt',
};

export function EndScreen({ ctrl, onNewRun }: { ctrl: GameController; onNewRun: () => void }) {
  const v = vm.value;
  const w = ctrl.world;
  const r = w.run;
  if (!v || (r.status !== 'won' && r.status !== 'lost' && r.status !== 'bankrupt')) return null;
  const kind = r.status === 'won' ? (r.winType ?? 'sponsor') : r.status;
  const lines = kind === 'monopoly' ? ctrl.content.finale.monopoly : kind === 'sponsor' ? ctrl.content.finale.sponsor : kind === 'lost' ? ctrl.content.finale.lost : ctrl.content.finale.bankrupt;
  const ms = (t: number | null) => (t === null ? '—' : formatClock(t * 50));
  const won = r.status === 'won';
  return (
    <div class={`end-screen end-${kind}`} role="dialog" data-testid="end-screen">
      <div class="end-card">
        <h1>{TITLES[kind]}</h1>
        {ctrl.content.finale.placeholder && <div class="placeholder-banner">PLACEHOLDER COPY — finale text to be supplied</div>}
        <div class="finale">
          {lines.map((l, i) => <p key={i} style={{ animationDelay: `${0.4 + i * 1.1}s` }}>{l}</p>)}
        </div>
        <table class="grid-table stats">
          <tbody>
            <tr><td>Run time</td><td>{formatClock(ctrl.clock.simMs)}</td></tr>
            {kind === 'monopoly' && <tr><td>Time to monopoly</td><td><b>{ms(r.splits.monopoly)}</b></td></tr>}
            <tr><td>Final Company Value</td><td><b>{money(r.finalCV ?? player(w).cv)}</b></td></tr>
            <tr><td>Peak Company Value</td><td>{money(r.peakCV)}</td></tr>
            <tr><td>First sister</td><td>{ms(r.splits.firstSister)}</td></tr>
            <tr><td>Third sister</td><td>{ms(r.splits.thirdSister)}</td></tr>
            <tr><td>First time #1</td><td>{ms(r.splits.firstNo1)}</td></tr>
            <tr><td>Pauses / sessions</td><td>{ctrl.clock.pauses} / {ctrl.clock.sessions + 1}</td></tr>
          </tbody>
        </table>
        {won && !ctrl.debug && <LeaderboardSubmit ctrl={ctrl} />}
        {won && ctrl.debug && <p class="small muted">Debug runs are unranked.</p>}
        {!won && r.status === 'lost' && <p class="freeplay-note" data-testid="freeplay-note">{ctrl.content.finale.freeplayNote}</p>}
        <div class="end-actions">
          {r.status !== 'bankrupt' && (
            <button class="btn" onClick={() => ctrl.dispatch({ type: 'freeplay' })} data-testid="freeplay">
              One More Keg (Freeplay)
            </button>
          )}
          <button class="btn btn-primary" onClick={onNewRun}>New run</button>
        </div>
      </div>
    </div>
  );
}
