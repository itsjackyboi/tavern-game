import type { GameController } from '../app/controller.ts';
import { idx } from '../sim/lookup.ts';
import { calNow } from '../sim/time.ts';
import { onSound } from '../ui/bus.ts';
import { problemKeys } from '../ui/tavernHealth.ts';
import { audio } from './engine.ts';

// Chooses the music and ambience for the current view, ducks under tense
// prompts, and routes game/UI sound events to the engine.

export function bindAudio(ctrl: GameController): () => void {
  const offSound = onSound((k) => audio.play(k));
  let lastUid = 0;
  let lastIntelTick = ctrl.world.tick;
  let lastAlerts = 0;
  // Trouble at a tavern: chime once per new problem, at most every 4 s.
  let knownProblems = new Set(problemKeys(ctrl.world, ctrl.content));
  let lastTrouble = 0;
  const tick = () => {
    const w = ctrl.world;
    const c = ctrl.content;
    const t = w.taverns[w.focus.tavernId];
    const cal = calNow(w, c.time);
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
    // A new decision arrives: a two-note chime so it isn't missed.
    const newest = w.prompts.nextUid;
    if (newest > lastUid) {
      if (lastUid > 0) audio.play('vip');
      lastUid = newest;
    }
    // Fresh intel from an informant: a soft chime.
    const intel = w.log.filter((l) => l.kind === 'intel').length;
    const newestIntel = w.log.length ? w.log[w.log.length - 1]!.tick : 0;
    if (intel > 0 && newestIntel > lastIntelTick && w.log[w.log.length - 1]!.kind === 'intel') audio.play('greet');
    lastIntelTick = newestIntel;
    const alerts = w.log.filter((l) => l.kind === 'alert').length;
    if (alerts > lastAlerts) audio.play('alert');
    lastAlerts = alerts;
    const probs = new Set(problemKeys(w, c));
    const fresh = [...probs].some((k) => !knownProblems.has(k));
    knownProblems = probs;
    if (fresh && !ctrl.paused && performance.now() - lastTrouble > 4000) {
      lastTrouble = performance.now();
      audio.play('trouble');
    }
  };
  const timer = window.setInterval(tick, 250);
  tick();
  return () => {
    offSound();
    window.clearInterval(timer);
    audio.setSong(null);
  };
}
