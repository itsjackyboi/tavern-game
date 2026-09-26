import { vm } from './vm.ts';

const MONEY: Record<'debt' | 'out' | 'low', string> = {
  debt: 'In debt: you owe more than you hold. Earn it back before the moneylenders lose patience.',
  out: 'Out of Duckets: you can’t pay for kegs, wages or upgrades.',
  low: 'Low on Duckets: not enough for next season’s rent and wages.',
};

/** Standing warnings pinned over the top of the board until the problem goes away. */
export function Alerts() {
  const v = vm.value;
  if (!v) return null;
  return (
    <div class="alerts" data-testid="alerts">
      {v.money && (
        <div class={`alert alert-${v.money}`} data-testid="money-alert">
          <span class="alert-icon">◉</span> {MONEY[v.money]}
        </div>
      )}
      {v.bankruptIn !== null && (
        <div class="alert alert-debt" data-testid="bankrupt-alert">
          <span class="alert-icon">⛓</span> Creditors are circling: bankrupt in {v.bankruptIn}s unless you raise cash.
        </div>
      )}
      {v.view === 'floor' && v.dryTaps.length > 0 && (
        <div class="alert alert-dry" data-testid="dry-alert">
          <span class="alert-icon">🍺</span> Tap dry, cellar empty: {v.dryTaps.join(', ')}. Order kegs (+1 on the left).
        </div>
      )}
    </div>
  );
}
