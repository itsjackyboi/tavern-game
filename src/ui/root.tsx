import { useEffect, useRef, useState } from 'preact/hooks';
import { GameController, type NewRunConfig } from '../app/controller.ts';
import { clearSave, readSave, type SaveFile } from '../app/save.ts';
import { installTestHooks } from '../app/testHooks.ts';
import { bindAudio } from '../audio/director.ts';
import { startAudio } from '../audio/engine.ts';
import type { Content } from '../content/schema.ts';
import { installHotkeys } from '../input/hotkeys.ts';
import { startOutbox } from '../leaderboard/outbox.ts';
import type { GameViews } from '../views/PhaserGame.ts';
import { drawer, toast, uiFrame } from './bus.ts';
import { RESULT_TEXT } from './describe.ts';
import { Drawers } from './drawers/Drawers.tsx';
import { EndScreen } from './EndScreen.tsx';
import { Hud } from './hud/Hud.tsx';
import { BottomBar } from './panels/BottomBar.tsx';
import { LeftPanel } from './panels/LeftPanel.tsx';
import { RightPanel } from './panels/RightPanel.tsx';
import { PauseVeil } from './PauseVeil.tsx';
import { TitleScreen, type TitleChoice } from './title/TitleScreen.tsx';
import { Toasts } from './Toasts.tsx';
import { bindViewModel, vm } from './vm.ts';

export function urlFlags() {
  const q = new URLSearchParams(location.search);
  const city = q.get('city');
  const cities = ['aleforge', 'shanty', 'providence', 'roto'] as const;
  const speed = Number(q.get('speed') ?? '1');
  return {
    debug: q.has('debug'),
    seed: q.get('seed'),
    city: (cities as readonly string[]).includes(city ?? '') ? (city as (typeof cities)[number]) : null,
    speed: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 16) : 1,
  };
}

function newSeed(): string {
  // Seeds are chosen outside the sim; the sim itself never touches Math.random.
  return Math.floor(Math.random() * 2 ** 32).toString(36);
}

export function App({ content }: { content: Content }) {
  const flags = urlFlags();
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  useEffect(() => startOutbox(), []);

  const begin = (choice: TitleChoice) => {
    startAudio();
    if (choice.kind === 'continue') {
      setCtrl(new GameController(content, { save: choice.save, debug: flags.debug }));
      return;
    }
    clearSave();
    const cfg: NewRunConfig = {
      seed: flags.seed ?? newSeed(),
      homeCity: flags.city ?? choice.city,
      tavernName: choice.tavernName,
      timerScale: choice.timerScale,
      ngPlus: choice.ngPlus,
      debug: flags.debug,
    };
    const c = new GameController(content, cfg);
    if (flags.debug) c.speed = flags.speed;
    setCtrl(c);
  };

  if (!ctrl) return <TitleScreen content={content} onPlay={begin} loadSave={readSave} />;
  return <GameScreen key={ctrl.world.meta.seed} ctrl={ctrl} onNewRun={() => { clearSave(); setCtrl(null); }} />;
}

function GameScreen({ ctrl, onNewRun }: { ctrl: GameController; onNewRun: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const views = useRef<GameViews | null>(null);

  useEffect(() => {
    let destroyed = false;
    const unbindVm = bindViewModel(ctrl);
    const unbindKeys = installHotkeys(ctrl);
    const unbindAudio = bindAudio(ctrl);
    if (ctrl.debug || import.meta.env.DEV) installTestHooks(ctrl);
    const unsub = ctrl.subscribe(() => {
      views.current?.setView(ctrl.world.focus.view);
      for (const f of ctrl.takeFeedback()) {
        if (f.result === 'ok' || f.result === 'found') {
          if (f.cmd.type === 'found') toast('Construction begins. It opens next season.', 'good');
          if (f.cmd.type === 'hire') toast('Hired.', 'good');
          continue;
        }
        const text = RESULT_TEXT[f.result];
        if (text && f.cmd.type !== 'answer') toast(text, 'error');
        if (f.cmd.type === 'answer' && f.result === 'cash') toast(RESULT_TEXT.cash!, 'error');
      }
    });
    void import('../views/PhaserGame.ts').then(({ createPhaserGame }) => {
      if (destroyed || !host.current) return;
      views.current = createPhaserGame(host.current, ctrl);
      ctrl.start();
    });
    return () => {
      destroyed = true;
      ctrl.stop();
      unbindVm();
      unbindKeys();
      unbindAudio();
      unsub();
      views.current?.destroy();
      drawer.value = null;
    };
  }, [ctrl]);

  void uiFrame.value;
  const v = vm.value;
  return (
    <div class={`game-screen view-${v?.view ?? 'floor'} ${v?.paused ? 'is-paused' : ''}`}>
      <Hud ctrl={ctrl} />
      <div class="main">
        <LeftPanel ctrl={ctrl} />
        <div class="board">
          <div class="board-canvas" ref={host} data-testid="board" />
          <Drawers ctrl={ctrl} />
          <PauseVeil ctrl={ctrl} />
        </div>
        <RightPanel ctrl={ctrl} />
      </div>
      <BottomBar ctrl={ctrl} />
      <Toasts />
      <EndScreen ctrl={ctrl} onNewRun={onNewRun} />
    </div>
  );
}

export type { SaveFile };
