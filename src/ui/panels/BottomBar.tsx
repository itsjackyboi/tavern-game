import type { GameController } from '../../app/controller.ts';
import { calNow } from '../../sim/time.ts';
import { APP_VERSION } from '../../version.ts';
import { drawer, sound, uiFrame, type DrawerId } from '../bus.ts';
import { vm } from '../vm.ts';

const BUTTONS: Array<[Exclude<DrawerId, null | 'city'>, string, string]> = [
  ['staff', 'Staff', 'S'], ['menu', 'Menu', 'M'], ['upgrades', 'Build', 'U'], ['research', 'Brew', 'K'], ['finance', 'Ledger', 'F'], ['network', 'Taverns', 'N'], ['help', 'Help', 'H'],
];

export function BottomBar({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const w = ctrl.world;
  const cal = calNow(w, ctrl.content.time);
  const lastCall = cal.phase === 'lastCall' && !!w.floor && !w.floor.lastCallRung;
  const alerts = vm.value?.floorAlerts ?? 0;
  return (
    <footer class="bottom-bar">
      <button
        class={`btn view-toggle ${w.focus.view === 'world' ? 'on' : ''}`}
        onClick={() => { ctrl.dispatch({ type: 'setView', view: w.focus.view === 'floor' ? 'world' : 'floor' }); sound('map'); }}
        title="Switch between the tavern floor and the Isles map (Tab)"
        data-testid="view-toggle"
      >
        <kbd>Tab</kbd> {w.focus.view === 'floor' ? 'Isles map' : 'Tavern floor'}
        {w.focus.view === 'world' && alerts > 0 && <span class="badge alert-badge" title="Trouble on your floor">{alerts}</span>}
      </button>
      {BUTTONS.map(([id, label, key]) => (
        <button key={id} class={`btn ${drawer.value === id ? 'on' : ''}`} onClick={() => { drawer.value = drawer.value === id ? null : id; sound('ui'); }}>
          <kbd>{key}</kbd> {label}
        </button>
      ))}
      <button class={`btn bell ${lastCall ? 'ring' : ''}`} disabled={!lastCall} onClick={() => ctrl.dispatch({ type: 'ringBell' })} title="Ring the Last Call bell (B)">
        <kbd>B</kbd> 🔔 {w.floor?.closingSince !== undefined ? 'Closing…' : 'Last Call'}
      </button>
      <span class="version-tag" data-testid="version">{APP_VERSION}</span>
    </footer>
  );
}
