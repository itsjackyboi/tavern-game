import type { GameController } from '../app/controller.ts';

// One global keyboard manager on window, so hotkeys work whichever layer
// (Phaser canvas or DOM HUD) has focus. Bindings grow milestone by milestone.

export function installHotkeys(ctrl: GameController): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      if (ctrl.paused) ctrl.resume();
      else ctrl.pause('manual');
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
