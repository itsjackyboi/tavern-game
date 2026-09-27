import type { GameController } from '../app/controller.ts';
import { loanCap } from '../sim/company.ts';
import { player } from '../sim/lookup.ts';
import { money } from './describe.ts';
import { sound } from './bus.ts';
import { moneyNotes, receipts, visibleNotes } from './moneyFeed.ts';
import { vm } from './vm.ts';
import { townStyle } from './townColors.ts';

const MONEY: Record<'debt' | 'out' | 'low', string> = {
  debt: 'In debt: you owe more than you hold. Earn it back before the moneylenders lose patience.',
  out: 'Out of Duckets: you can’t pay for kegs (auto-restock has stopped), wages or upgrades.',
  low: 'Low on Duckets: not enough for next season’s rent and wages.',
};

/** Colours a receipt line by whether it helped or hurt. */
function partTone(p: string): string {
  if (/−\d|falls|leaves|shut|lost/.test(p)) return 'bad';
  if (/\+\d|rises/.test(p)) return 'good';
  return '';
}

/** Along the bottom of the board: decision receipts, money in and out, and standing warnings. */
export function Alerts({ ctrl }: { ctrl: GameController }) {
  const v = vm.value;
  if (!v) return null;
  const c = ctrl.content;
  const cap = loanCap(c, player(ctrl.world));
  const rate = Math.round(c.economy.loanRatePerSeason * 100);
  const borrow = (v.money === 'debt' || v.money === 'out' || v.bankruptIn !== null) && cap >= 100 && (
    <span class="alert-borrow">
      {[200, 100].filter((n) => cap >= n).map((n) => (
        <button key={n} class={`btn btn-tiny ${n === 200 ? 'btn-primary' : ''}`} data-testid={`borrow-${n}`}
          onClick={() => { ctrl.dispatch({ type: 'loan', amount: n }); sound('buy'); }}>
          Borrow {n}◉
        </button>
      ))}
      <span class="small">interest {rate}% a season</span>
    </span>
  );
  const notes = visibleNotes(moneyNotes.value);
  const recs = receipts.value;
  return (
    <div class="board-bottom">
      {recs.length > 0 && (
        <div class="receipts" data-testid="receipts">
          {recs.map((r) => (
            <div class={`receipt ${r.city ? 'has-town' : ''}`} key={r.id} style={townStyle(r.city)}>
              <div class="receipt-head">
                <span class="receipt-tag">{r.auto ? 'Decided for you (time ran out)' : 'Your decision'}</span>
                <b>{r.title}</b> → {r.option}
              </div>
              <div class="receipt-parts">
                {r.parts.length === 0 && <span class="muted">No immediate effect.</span>}
                {r.parts.map((p, i) => <span key={i} class={`part ${partTone(p)}`}>{p}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div class="money-notes" data-testid="money-notes">
          {notes.map((n) => (
            <div class={`money-note ${n.amount >= 0 ? 'in' : 'out'} ${n.city ? 'has-town' : ''}`} key={n.id} style={townStyle(n.city)}>
              <span class="mn-amount">{n.amount >= 0 ? '+' : '−'}{money(Math.abs(n.amount))} ◉</span>
              <span class="mn-key">{n.key}</span>
              <span class="mn-detail">{n.detail}{n.count > 1 ? ` and ${n.count - 1} more` : ''}</span>
            </div>
          ))}
        </div>
      )}
      <div class="alerts" data-testid="alerts">
        {v.money && (
          <div class={`alert alert-${v.money}`} data-testid="money-alert">
            <span class="alert-icon">◉</span> {MONEY[v.money]}
            {v.bankruptIn === null && borrow}
          </div>
        )}
        {v.bankruptIn !== null && (
          <div class="alert alert-debt" data-testid="bankrupt-alert">
            <span class="alert-icon">⛓</span> Creditors are circling: bankrupt in {v.bankruptIn}s unless you raise cash.
            {borrow}
          </div>
        )}
        {v.view === 'floor' && v.dryTaps.length > 0 && (
          <div class="alert alert-dry" data-testid="dry-alert">
            <span class="alert-icon">🍺</span> Tap dry, cellar empty: {v.dryTaps.join(', ')}. Order kegs (+1 on the left).
          </div>
        )}
      </div>
    </div>
  );
}
