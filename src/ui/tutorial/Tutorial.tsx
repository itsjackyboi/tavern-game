import { useEffect, useRef, useState } from 'preact/hooks';
import { READING_PAUSES, type GameController } from '../../app/controller.ts';
import { BAR_ROW } from '../../sim/floor/layout.ts';
import { idx } from '../../sim/lookup.ts';
import { spawnPrompt } from '../../sim/prompts.ts';
import type { World } from '../../sim/types.ts';
import { drawer, onCommand, tutorialTarget, uiFrame } from '../bus.ts';

// A guided first shift. It only explains *how* to do things, never what's a
// good idea: the strategy is the player's to find.

export const TUTORIAL_DONE_KEY = 'last-call:tutorial-done';

interface Progress {
  cmds: Set<string>;
  sawWorld: boolean;
  sawPause: boolean;
  sawDrawer: boolean;
  since: number;
}

interface Step {
  title: string;
  text: (ctrl: GameController) => string;
  /** Which bit of the screen to highlight (CSS hook on <body data-tut>). */
  spot?: 'decisions' | 'drawers' | 'view-toggle' | 'bell' | 'taps' | 'hud';
  target?: (w: World) => { x: number; y: number } | null;
  done?: (ctrl: GameController, p: Progress) => boolean;
  /** Seconds after which the step offers to move on by itself (e.g. nothing to clear yet). */
  autoSkip?: number;
  manual?: boolean;
}

const waiting = (w: World) => w.floor?.patrons.find((p) => p.state === 'waiting') ?? null;
const ordered = (w: World) => w.floor?.patrons.find((p) => p.state === 'ordered') ?? null;

const STEPS: Step[] = [
  {
    title: 'Welcome to your tavern',
    text: () =>
      'This is the tavern floor. Your company is ranked by Company Value (top of the screen and the list on the right). ' +
      'You win by reaching twice the value of the next company, or by being the biggest company in all four cities when Year 463 ends. ' +
      'This short tour shows the controls.',
    spot: 'hud',
    manual: true,
  },
  {
    title: 'Seat a patron',
    text: () => 'Patrons queue at the door. Drag one onto a clean table (it glows green), or click them and then click the table.',
    target: (w) => waiting(w),
    done: (_c, p) => p.cmds.has('seat'),
  },
  {
    title: 'Pour and serve',
    text: () => 'Seated patrons order after a moment; the drink shows in a bubble above them. Click the bubble: you walk to the tap, pour, and carry it over.',
    target: (w) => ordered(w),
    done: (_c, p) => p.cmds.has('serve'),
  },
  {
    title: 'Kegs and taps',
    text: () =>
      'Each tap has a fill bar in its drink’s own colour; the number under it is kegs in the cellar. Click a tap to change its keg. The +1 buttons in Taps (left) order kegs, which arrive after a short wait. Money spent or earned pops up at the bottom of the board, and the Ledger (F) lists it all.',
    spot: 'taps',
    target: (w) => {
      const t = w.floor ? w.taverns[w.floor.tavernId] : null;
      const tap = w.floor && t ? [...w.floor.taps].sort((a, b) => (t.tapLevels[a.drinkId] ?? 0) - (t.tapLevels[b.drinkId] ?? 0))[0] : null;
      return tap ? { x: tap.x, y: BAR_ROW - 1 } : null;
    },
    done: (_c, p) => p.cmds.has('restock') || p.cmds.has('orderKegs'),
  },
  {
    title: 'Clear tables',
    text: () => 'When patrons leave, their table is left messy and nobody can sit there. Click a messy table to clear it.',
    target: (w) => w.floor?.tables.find((t) => t.dirty) ?? null,
    done: (_c, p) => p.cmds.has('clear'),
    autoSkip: 45,
  },
  {
    title: 'Decisions',
    text: () =>
      'Decisions appear at the bottom-right with a chime. Each choice lists what it will do. Answer with the mouse or Shift+1–3; the bar shows how long you have, and if time runs out the “if you wait” option happens. Afterwards a receipt at the bottom of the board shows what it did.',
    spot: 'decisions',
    done: (_c, p) => p.cmds.has('answer'),
  },
  {
    title: 'The drawers',
    text: () => 'The buttons along the bottom open drawers: Staff (S), Menu (M), Build (U), Brew (K), Ledger (F) and Help (H). Open any one; Esc closes it.',
    spot: 'drawers',
    done: (_c, p) => p.sawDrawer && drawer.value === null,
  },
  {
    title: 'The Isles map',
    text: () => 'Press Tab (or the button bottom-left) to see the Isles: the four cities, your taverns and your rivals. Press Tab again to come back. Word around the Isles (left) carries news of your rivals; informants on your staff hear far more.',
    spot: 'view-toggle',
    done: (ctrl, p) => p.sawWorld && ctrl.world.focus.view === 'floor',
  },
  {
    title: 'Pausing',
    text: () => 'P (or Esc) pauses and stops the clock. The pause menu also has sound settings and Return to title. Pause, then resume.',
    done: (ctrl, p) => p.sawPause && !ctrl.paused,
  },
  {
    title: 'Last Call',
    text: (ctrl) => {
      const cal = ctrl.calendar();
      const left = Math.max(0, Math.ceil((cal.segmentTicks - ctrl.content.time.lastCallTicks - cal.segmentTick) / 20));
      return (
        'Each season ends with Last Call: the bell button lights up. Ring it (B) to close the doors at all your taverns; patrons inside get one last drink. ' +
        'If you don’t, the doors close on their own at the end of the season. ' +
        (cal.phase === 'lastCall' ? 'It’s Last Call now!' : `Next Last Call in about ${left}s.`)
      );
    },
    spot: 'bell',
    done: (_c, p) => p.cmds.has('ringBell'),
  },
  {
    title: 'That’s the loop',
    text: () => 'You know the controls. This run is yours to keep playing (it isn’t ranked or saved), or return to the title to start a real one. Help (H) has every key.',
    manual: true,
  },
];

export function Tutorial({ ctrl, onExit }: { ctrl: GameController; onExit: () => void }) {
  void uiFrame.value;
  const [step, setStep] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Each new lesson pauses the game until it has been read.
  const [reading, setReading] = useState(true);
  const prog = useRef<Progress>({ cmds: new Set(), sawWorld: false, sawPause: false, sawDrawer: false, since: performance.now() });
  const spawned = useRef(false);

  useEffect(() => onCommand((type, result) => { if (result === 'ok') prog.current.cmds.add(type); }), []);

  const s = STEPS[step];
  const p = prog.current;
  if (ctrl.world.focus.view === 'world') p.sawWorld = true;
  if (ctrl.paused && !READING_PAUSES.has(ctrl.paused)) p.sawPause = true;
  if (drawer.value) p.sawDrawer = true;

  const next = () => {
    const n = step + 1;
    prog.current = { cmds: new Set(), sawWorld: false, sawPause: false, sawDrawer: false, since: performance.now() };
    if (n >= STEPS.length - 1) {
      try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { /* ignore */ }
    }
    setStep(Math.min(n, STEPS.length - 1));
    setReading(true);
  };

  useEffect(() => {
    if (reading && !hidden) {
      if (!ctrl.paused) ctrl.pause('lesson');
    } else if (ctrl.paused === 'lesson') ctrl.resume();
  }, [reading, hidden, step]);
  useEffect(() => () => { if (ctrl.paused === 'lesson') ctrl.resume(); }, []);
  const gotIt = () => {
    prog.current.since = performance.now();
    setReading(false);
  };

  // Advance when the step's action has been done.
  useEffect(() => {
    if (s && !hidden && !reading && !s.manual && s.done?.(ctrl, p)) next();
  });

  // Point at the step's target on the floor, and highlight its part of the screen.
  useEffect(() => {
    tutorialTarget.value = !hidden && s?.target ? s.target(ctrl.world) : null;
    document.body.dataset.tut = !hidden && s?.spot ? s.spot : '';
  });
  useEffect(() => () => { tutorialTarget.value = null; document.body.dataset.tut = ''; }, []);

  // No decision has turned up by itself? Bring one in so the step can be tried.
  useEffect(() => {
    if (!s || s.spot !== 'decisions' || spawned.current) return;
    const tacticalUp = ctrl.world.prompts.active.some((a) => idx(ctrl.content).prompt.get(a.defId)?.tier !== 'strategic');
    if (!tacticalUp && performance.now() - p.since > 4000) {
      spawned.current = true;
      spawnPrompt(ctrl.world, ctrl.content, 'hall-contest', { tavernId: ctrl.world.focus.tavernId });
    }
  });

  if (hidden || !s) return null;
  const late = s.autoSkip !== undefined && performance.now() - p.since > s.autoSkip * 1000;
  const last = step === STEPS.length - 1;
  return (
    <div class="coach" role="dialog" aria-label="Tutorial" data-testid="tutorial">
      <div class="coach-head">
        <span class="coach-step">Tutorial {Math.min(step + 1, STEPS.length)}/{STEPS.length}</span>
        <b>{s.title}</b>
      </div>
      <p class="coach-text">{s.text(ctrl)}</p>
      {reading && !s.manual && <p class="coach-paused">⏸ Paused while you read.</p>}
      <div class="coach-actions">
        {reading && !s.manual && <button class="btn btn-primary btn-small" onClick={gotIt} data-testid="tutorial-go">Got it, let me try</button>}
        {s.manual && !last && <button class="btn btn-primary btn-small" onClick={next} data-testid="tutorial-next">Next</button>}
        {last && <button class="btn btn-primary btn-small" onClick={() => setHidden(true)} data-testid="tutorial-keep">Keep playing</button>}
        {last && <button class="btn btn-small" onClick={onExit}>Return to title</button>}
        {!s.manual && !reading && <button class={`btn btn-small ${late ? 'btn-primary' : ''}`} onClick={next} data-testid="tutorial-skip">Skip step</button>}
        {!last && <button class="btn btn-small" onClick={() => setHidden(true)} data-testid="tutorial-end">End tutorial</button>}
      </div>
    </div>
  );
}
