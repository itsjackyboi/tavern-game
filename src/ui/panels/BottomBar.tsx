import type { GameController } from '../../app/controller.ts';
import { calendarAt } from '../../sim/time.ts';
import { drawer, hover, sound, uiFrame, type DrawerId } from '../bus.ts';

const BUTTONS: Array<[Exclude<DrawerId, null | 'city'>, string, string]> = [
  ['staff', 'Staff', 'S'], ['menu', 'Menu', 'M'], ['upgrades', 'Build', 'U'], ['research', 'Brew', 'K'], ['finance', 'Ledger', 'F'], ['help', 'Help', 'H'],
];

export function BottomBar({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const w = ctrl.world;
  const cal = calendarAt(w.tick, ctrl.content.time);
  const lastCall = cal.phase === 'lastCall' && !!w.floor && !w.floor.lastCallRung;
  const recent = w.log.slice(-3).reverse();
  return (
    <footer class="bottom-bar">
      <button
        class={`btn view-toggle ${w.focus.view === 'world' ? 'on' : ''}`}
        onClick={() => { ctrl.dispatch({ type: 'setView', view: w.focus.view === 'floor' ? 'world' : 'floor' }); sound('map'); }}
        title="Switch between the tavern floor and the Isles map (Tab)"
        data-testid="view-toggle"
      >
        <kbd>Tab</kbd> {w.focus.view === 'floor' ? 'Isles map' : 'Tavern floor'}
      </button>
      {BUTTONS.map(([id, label, key]) => (
        <button key={id} class={`btn ${drawer.value === id ? 'on' : ''}`} onClick={() => { drawer.value = drawer.value === id ? null : id; sound('ui'); }}>
          <kbd>{key}</kbd> {label}
        </button>
      ))}
      <button class={`btn bell ${lastCall ? 'ring' : ''}`} disabled={!lastCall} onClick={() => ctrl.dispatch({ type: 'ringBell' })} title="Ring the Last Call bell (B)">
        <kbd>B</kbd> 🔔
      </button>
      <div class="ticker" data-testid="ticker">
        {hover.value ? (
          <div class="hover-line">{hover.value}</div>
        ) : (
          recent.map((l, i) => (
            <div key={`${l.tick}-${i}`} class={`tick-line kind-${l.kind}`} style={{ opacity: 1 - i * 0.28 }}>
              {l.text}
            </div>
          ))
        )}
      </div>
    </footer>
  );
}
