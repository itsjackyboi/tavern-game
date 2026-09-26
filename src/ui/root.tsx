import { useEffect, useRef, useState } from 'preact/hooks';
import { GameController } from '../app/controller.ts';
import { installTestHooks } from '../app/testHooks.ts';
import type { CityId, Content } from '../content/schema.ts';
import { installHotkeys } from '../input/hotkeys.ts';
import { Hud } from './hud/Hud.tsx';
import { PauseVeil } from './PauseVeil.tsx';
import { TitleScreen } from './title/TitleScreen.tsx';
import { bindViewModel } from './vm.ts';

function urlFlags() {
  const q = new URLSearchParams(location.search);
  const city = q.get('city');
  const cities: CityId[] = ['aleforge', 'shanty', 'providence', 'roto'];
  return {
    debug: q.has('debug'),
    seed: q.get('seed'),
    city: cities.includes(city as CityId) ? (city as CityId) : null,
  };
}

function newSeed(): string {
  // Seeds are chosen outside the sim; the sim itself never touches Math.random.
  return Math.floor(Math.random() * 2 ** 32).toString(36);
}

export function App({ content }: { content: Content }) {
  const flags = urlFlags();
  const [run, setRun] = useState<{ ctrl: GameController } | null>(null);

  const startRun = (homeCity: CityId) => {
    const ctrl = new GameController(content, {
      seed: flags.seed ?? newSeed(),
      homeCity: flags.city ?? homeCity,
      debug: flags.debug,
    });
    setRun({ ctrl });
  };

  if (!run) return <TitleScreen content={content} onPlay={startRun} />;
  return <GameScreen ctrl={run.ctrl} />;
}

function GameScreen({ ctrl }: { ctrl: GameController }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let game: { destroy(removeCanvas: boolean): void } | null = null;
    const unbindVm = bindViewModel(ctrl);
    const unbindKeys = installHotkeys(ctrl);
    if (ctrl.debug || import.meta.env.DEV) installTestHooks(ctrl);
    void import('../views/PhaserGame.ts').then(({ createPhaserGame }) => {
      if (destroyed || !host.current) return;
      game = createPhaserGame(host.current, ctrl);
      ctrl.start();
    });
    return () => {
      destroyed = true;
      ctrl.stop();
      unbindVm();
      unbindKeys();
      game?.destroy(true);
    };
  }, [ctrl]);

  return (
    <div class="game-screen">
      <Hud ctrl={ctrl} />
      <div class="board">
        <div class="board-canvas" ref={host} data-testid="board" />
        <PauseVeil ctrl={ctrl} />
      </div>
    </div>
  );
}
