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
import { drinkCss } from '../art/themes.ts';
import { drinkOf, player, playerTaverns, seasonTicks } from '../sim/lookup.ts';
import { drawer, emitCommand, seasonReport, sound, staffTavern, toast, uiFrame } from './bus.ts';
import { RESULT_TEXT } from './describe.ts';
import { Drawers } from './drawers/Drawers.tsx';
import { EndScreen } from './EndScreen.tsx';
import { Hud } from './hud/Hud.tsx';
import { Alerts } from './Alerts.tsx';
import { autoSubmit, submission } from './leaderboard/submission.ts';
import { bindMoneyFeed } from './moneyFeed.ts';
import { BottomBar } from './panels/BottomBar.tsx';
import { LeftPanel } from './panels/LeftPanel.tsx';
import { RightPanel } from './panels/RightPanel.tsx';
import { PauseVeil } from './PauseVeil.tsx';
import { TitleScreen, type TitleChoice } from './title/TitleScreen.tsx';
import { Toasts } from './Toasts.tsx';
import { SeasonReport } from './SeasonReport.tsx';
import { MenuGuide } from './MenuGuide.tsx';
import { lastSeasonNet, seasonVerdict, townName } from './tavernHealth.ts';
import { Tutorial } from './tutorial/Tutorial.tsx';
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
    if (choice.kind === 'tutorial') {
      // A fixed, gentle start. The tutorial never touches the saved run.
      setCtrl(new GameController(content, { seed: 'tutorial', homeCity: 'aleforge', tavernName: choice.tavernName, playerName: choice.playerName, tutorial: true, timerScale: 5, debug: flags.debug }));
      return;
    }
    clearSave();
    const cfg: NewRunConfig = {
      seed: flags.seed ?? newSeed(),
      homeCity: flags.city ?? choice.city,
      tavernName: choice.tavernName,
      playerName: choice.playerName,
      timerScale: choice.timerScale,
      ngPlus: choice.ngPlus,
      debug: flags.debug,
    };
    const c = new GameController(content, cfg);
    if (flags.debug) c.speed = flags.speed;
    setCtrl(c);
  };

  if (!ctrl) return <TitleScreen content={content} onPlay={begin} loadSave={readSave} />;
  const exit = async () => {
    // Save & return to title: Continue on the title screen picks the run back up.
    const s = ctrl.world.run.status;
    if (s === 'playing' || s === 'freeplay') await ctrl.save();
    setCtrl(null);
  };
  return (
    <GameScreen
      key={`${ctrl.world.meta.seed}-${ctrl.tutorial}`}
      ctrl={ctrl}
      onNewRun={() => { if (!ctrl.tutorial) clearSave(); setCtrl(null); }}
      onExit={() => void exit()}
    />
  );
}

function GameScreen({ ctrl, onNewRun, onExit }: { ctrl: GameController; onNewRun: () => void; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const views = useRef<GameViews | null>(null);

  useEffect(() => {
    let destroyed = false;
    const unbindVm = bindViewModel(ctrl);
    const unbindKeys = installHotkeys(ctrl);
    const unbindAudio = bindAudio(ctrl);
    const unbindMoney = bindMoneyFeed(ctrl);
    // Reading How to play pauses the game; closing it picks up where you left off.
    const unbindHelp = drawer.subscribe((d) => {
      if (d !== 'staff') staffTavern.value = null;
      if (d === 'help' && !ctrl.paused) ctrl.pause('help');
      else if (d !== 'help' && ctrl.paused === 'help') ctrl.resume();
    });
    if (ctrl.debug || import.meta.env.DEV) installTestHooks(ctrl);
    let winRecorded = ctrl.world.run.status === 'won';
    const ended = (s: string) => s === 'won' || s === 'lost' || s === 'bankrupt';
    let endSent = ended(ctrl.world.run.status) || ctrl.world.run.verdictDone;
    submission.value = { state: 'idle' };
    let bellWas = ctrl.world.floor?.lastCallRung ?? false;
    let seasonsWas = ctrl.world.events.seasonsClosed ?? 0;
    let yearsWas = ctrl.world.companies[ctrl.world.playerId]?.yearHistory.length ?? 0;
    const unsub = ctrl.subscribe(() => {
      views.current?.setView(ctrl.world.focus.view);
      const bell = ctrl.world.floor?.lastCallRung ?? false;
      if (bell && !bellWas) toast('Doors closed: no more patrons tonight. Serve the last orders; the next season starts once they leave.', 'good');
      bellWas = bell;
      // A season (and at the Holiday Keg's end, a year) closed: say how it went, once.
      const me = ctrl.world.companies[ctrl.world.playerId];
      const seasons = ctrl.world.events.seasonsClosed ?? 0;
      if (seasons !== seasonsWas) {
        seasonsWas = seasons;
        const open = playerTaverns(ctrl.world).filter((t) => t.status !== 'closed' && t.status !== 'building' && t.lastKpi);
        if (open.length >= 2 && !ctrl.tutorial) {
          seasonReport.value = {
            id: seasons,
            rows: open.map((t) => {
              const v = seasonVerdict(t, ctrl.world, seasonTicks(ctrl.content));
              return {
                tavernId: t.id, name: t.name, town: townName(ctrl.content, t), net: lastSeasonNet(t) ?? 0, repDelta: t.lastRepDelta ?? 0,
                served: t.lastKpi!.served, walkouts: t.lastKpi!.walkouts, verdict: v.text, bad: v.bad,
              };
            }),
          };
        }
        if (me) {
          const p = Math.round(me.seasonProfit);
          toast(`Season closed: ${p >= 0 ? 'profit +' : 'loss −'}${Math.abs(p).toLocaleString()} Duckets`, p >= 0 ? 'good' : 'info');
        }
      }
      if (me && me.yearHistory.length !== yearsWas) {
        yearsWas = me.yearHistory.length;
        const y = me.yearHistory[me.yearHistory.length - 1];
        if (y) toast(`Year ${y.year} closed: ${y.profit >= 0 ? 'profit +' : 'loss −'}${Math.abs(Math.round(y.profit)).toLocaleString()} Duckets (see the Ledger)`, y.profit >= 0 ? 'good' : 'info');
      }
      // A run just finished: log it to the sheet (wins, losses and bankruptcies alike).
      if (!endSent && ended(ctrl.world.run.status)) {
        endSent = true;
        autoSubmit(ctrl);
      }
      if (!winRecorded && ctrl.world.run.status === 'won') {
        winRecorded = true;
        // Any win unlocks NG+ on the title screen.
        try { localStorage.setItem('last-call:wins', String(Number(localStorage.getItem('last-call:wins') ?? 0) + 1)); } catch { /* ignore */ }
      }
      for (const f of ctrl.takeFeedback()) {
        emitCommand(f.cmd.type, f.result);
        if (f.cmd.type === 'research' && f.result === 'found') {
          const me = player(ctrl.world);
          const id = me.unlocked[me.unlocked.length - 1];
          if (id) {
            toast(`New brew discovered: ${drinkOf(ctrl.content, id).name}! Put it on a tap in Menu (M).`, 'good', drinkCss(ctrl.content, id));
            sound('discover');
          }
          continue;
        }
        if (f.cmd.type === 'research' && f.result === 'nothing') {
          toast('Nothing new came of that batch. The pair is crossed off.', 'info');
          continue;
        }
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
      unbindMoney();
      unbindHelp();
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
          <Alerts />
          <Toasts />
          <SeasonReport ctrl={ctrl} />
          <MenuGuide ctrl={ctrl} />
          <Drawers ctrl={ctrl} />
          {ctrl.tutorial && <Tutorial ctrl={ctrl} onExit={onExit} />}
          <PauseVeil ctrl={ctrl} onExit={onExit} />
        </div>
        <RightPanel ctrl={ctrl} />
      </div>
      <BottomBar ctrl={ctrl} />
      <EndScreen ctrl={ctrl} onNewRun={onNewRun} />
    </div>
  );
}

export type { SaveFile };
