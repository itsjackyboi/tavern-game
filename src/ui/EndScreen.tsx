import type { GameController } from '../app/controller.ts';
import { league } from '../sim/company.ts';
import { player, playerTaverns } from '../sim/lookup.ts';
import { formatClock } from '../sim/time.ts';
import { money } from './describe.ts';
import { RunRecordStatus } from './leaderboard/LeaderboardPanel.tsx';
import { vm } from './vm.ts';

/** The name your company goes by: your first tavern's. */
function companyName(ctrl: GameController): string {
  return playerTaverns(ctrl.world)[0]?.name ?? 'your company';
}

export function EndScreen({ ctrl, onNewRun }: { ctrl: GameController; onNewRun: () => void }) {
  const v = vm.value;
  const w = ctrl.world;
  const r = w.run;
  if (!v || (r.status !== 'won' && r.status !== 'lost' && r.status !== 'bankrupt')) return null;
  const kind = r.status === 'won' ? (r.winType ?? 'sponsor') : r.status;
  const f = ctrl.content.finale;
  // The company Thomas Thatcher Sr. picked instead: the biggest one that isn't yours.
  const rival = league(w).find((co) => !co.isPlayer);
  const winner = rival?.name ?? 'another company';
  const fill = (l: string) => l.replace(/\{company\}/g, companyName(ctrl)).replace(/\{winner\}/g, winner);
  const lines = (kind === 'monopoly' ? f.monopoly : kind === 'sponsor' ? f.sponsor : kind === 'lost' ? f.lost : f.bankrupt).map(fill);
  const placeholder = lines.some((l) => l.includes('[PLACEHOLDER'));
  const won = r.status === 'won';
  const cv = r.finalCV ?? player(w).cv;
  return (
    <div class={`end-screen end-${kind}`} role="dialog" data-testid="end-screen">
      <div class="end-card">
        <h1>{fill(f.titles[kind as keyof typeof f.titles])}</h1>
        {placeholder && <div class="placeholder-banner">PLACEHOLDER COPY — text to be supplied</div>}
        <div class="finale">
          {lines.map((l, i) => <p key={i} style={{ animationDelay: `${0.4 + i * 1.1}s` }}>{l}</p>)}
        </div>
        {r.status === 'lost' && rival && (
          <p class="lost-why" data-testid="lost-why">{rival.cv > cv ? `${rival.name} was the bigger company.` : `${rival.name} was chosen instead.`}</p>
        )}
        <div class="end-stats" data-testid="end-stats">
          <div><span>Total time</span><b>{formatClock(ctrl.clock.simMs)}</b></div>
          <div><span>Your Company Value</span><b>{money(cv)}</b></div>
          {r.status === 'lost' && rival && (
            <>
              <div><span>{rival.name}</span><b>{money(rival.cv)}</b></div>
              <div data-testid="cv-gap"><span>Difference</span><b class={rival.cv > cv ? 'gap-behind' : 'gap-ahead'}>{rival.cv > cv ? '−' : '+'}{money(Math.abs(rival.cv - cv))}</b></div>
            </>
          )}
        </div>
        <RunRecordStatus ctrl={ctrl} />
        {!won && r.status === 'lost' && <p class="freeplay-note" data-testid="freeplay-note">{f.freeplayNote}</p>}
        <div class="end-actions">
          <button class="btn btn-primary" onClick={onNewRun} data-testid="return-menu">Return to menu</button>
          {r.status !== 'bankrupt' && (
            <button class="btn btn-small" onClick={() => ctrl.dispatch({ type: 'freeplay' })} data-testid="freeplay">
              One More Keg (Freeplay)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
