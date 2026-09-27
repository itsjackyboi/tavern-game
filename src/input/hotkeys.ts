import type { GameController } from '../app/controller.ts';
import type { Command } from '../sim/commands.ts';
import { playerTaverns } from '../sim/lookup.ts';
import { drawer, recordOpen, sound, type DrawerId } from '../ui/bus.ts';
import { visibleCards } from '../ui/panels/Cards.tsx';

// One global keyboard manager on window, so hotkeys work whichever layer
// (Phaser canvas or DOM) has focus.

const DRAWER_KEYS: Record<string, Exclude<DrawerId, null>> = { s: 'staff', m: 'menu', u: 'upgrades', k: 'research', f: 'finance', n: 'network', h: 'help' };

/** Keyboard floor shortcuts: the most urgent thing of each kind. */
function quickFloor(ctrl: GameController, key: string): Command | null {
  const w = ctrl.world;
  const f = w.floor;
  if (!f || w.focus.view !== 'floor') return null;
  const t = w.taverns[f.tavernId]!;
  if (key === 'q') {
    const p = f.patrons.filter((x) => x.state === 'ordered' && !x.claimedBy).sort((a, b) => a.patience - b.patience)[0];
    return p ? { type: 'serve', patronId: p.id } : null;
  }
  if (key === 'w') {
    const p = f.patrons.filter((x) => x.state === 'waiting').sort((a, b) => Number(b.vip) - Number(a.vip) || a.patience - b.patience)[0];
    const tb = f.tables.find((x) => !x.dirty && (!x.seats[0] || !x.seats[1]));
    return p && tb ? { type: 'seat', patronId: p.id, tableId: tb.id } : null;
  }
  if (key === 'e') {
    const tap = [...f.taps].filter((x) => (t.cellar[x.drinkId] ?? 0) > 0).sort((a, b) => (t.tapLevels[a.drinkId] ?? 0) - (t.tapLevels[b.drinkId] ?? 0))[0];
    return tap ? { type: 'restock', drinkId: tap.drinkId } : null;
  }
  if (key === 'c') {
    const tb = f.tables.find((x) => x.dirty && !x.claimedBy);
    return tb ? { type: 'clear', tableId: tb.id } : null;
  }
  return null;
}

export function installHotkeys(ctrl: GameController, onViewChange?: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if (k === 'p' || e.key === 'Escape') {
      e.preventDefault();
      if (e.key === 'Escape' && drawer.value) {
        drawer.value = null;
        return;
      }
      if (recordOpen.value) {
        recordOpen.value = false;
        return;
      }
      if (ctrl.paused) ctrl.resume();
      else ctrl.pause('manual');
      return;
    }
    // While reading How to play, H closes it (and the game carries on).
    if (ctrl.paused === 'help' && k === 'h') {
      drawer.value = null;
      return;
    }
    if (ctrl.paused) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      ctrl.dispatch({ type: 'setView', view: ctrl.world.focus.view === 'floor' ? 'world' : 'floor' });
      sound('map');
      onViewChange?.();
      return;
    }
    // Number row by key position (Shift+1 types "!" on most layouts).
    const digit = /^Digit([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
    if (digit && e.shiftKey) {
      // Shift+1–4: answer the top decision card.
      e.preventDefault();
      const card = visibleCards(ctrl)[0];
      if (card) {
        ctrl.dispatch({ type: 'answer', uid: card.uid, option: Number(digit) - 1 });
        sound('confirm');
      }
      return;
    }
    if (digit && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 1–4: jump straight to one of your taverns.
      const t = playerTaverns(ctrl.world).filter((x) => x.status !== 'building')[Number(digit) - 1];
      if (t && t.id !== ctrl.world.focus.tavernId) {
        ctrl.dispatch({ type: 'focus', tavernId: t.id });
        sound('ui');
      }
      return;
    }
    if (k === 'b') {
      ctrl.dispatch({ type: 'ringBell' });
      return;
    }
    if (DRAWER_KEYS[k]) {
      drawer.value = drawer.value === DRAWER_KEYS[k] ? null : DRAWER_KEYS[k]!;
      sound('ui');
      return;
    }
    const cmd = quickFloor(ctrl, k);
    if (cmd) {
      ctrl.dispatch(cmd);
      sound('ui');
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
