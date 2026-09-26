import type { GameController } from '../app/controller.ts';
import { idx } from '../sim/lookup.ts';
import { calendarAt } from '../sim/time.ts';
import { onSound } from '../ui/bus.ts';
import { audio } from './engine.ts';

// Chooses the music and ambience for the current view, ducks under tense
// prompts, and routes game/UI sound events to the engine.

export function bindAudio(ctrl: GameController): () => void {
  const offSound = onSound((k) => audio.play(k));
  let lastAlerts = 0;
  const tick = () => {
    const w = ctrl.world;
    const c = ctrl.content;
    const t = w.taverns[w.focus.tavernId];
    const cal = calendarAt(w.tick, c.time);
    let song: string | null = 'world';
    if (w.focus.view === 'floor' && t) {
      if (t.city === 'providence') song = cal.isNight ? 'providence-night' : 'providence-day';
      else song = t.city;
    }
    if (ctrl.paused) song = null;
    audio.setSong(song);
    const tense = w.prompts.active.some((p) => (idx(c).prompt.get(p.defId)?.tension ?? 0) >= 2);
    audio.setDuck(tense || w.floor?.incidents.length !== 0 && w.focus.view === 'floor' && (w.floor?.incidents.length ?? 0) > 1);
    audio.setAmbience(ctrl.paused ? 'title' : w.focus.view, w.floor?.patrons.length ?? 0);
    const alerts = w.log.filter((l) => l.kind === 'alert').length;
    if (alerts > lastAlerts) audio.play('alert');
    lastAlerts = alerts;
  };
  const timer = window.setInterval(tick, 250);
  tick();
  return () => {
    offSound();
    window.clearInterval(timer);
    audio.setSong(null);
  };
}
