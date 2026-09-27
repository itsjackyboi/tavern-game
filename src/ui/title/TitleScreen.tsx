import { useEffect, useState } from 'preact/hooks';
import { HallRecord } from '../HallRecord.tsx';
import { TOWN_COLOR } from '../townColors.ts';
import { getMode, resetGuides, seenGuides, setMode, type PlayMode } from '../guideMode.ts';
import type { SaveFile } from '../../app/save.ts';
import type { CityId, Content } from '../../content/schema.ts';
import { cityOf } from '../../sim/lookup.ts';
import { savedName, saveName } from '../../leaderboard/outbox.ts';
import { LeaderboardView } from '../leaderboard/LeaderboardPanel.tsx';
import { APP_VERSION } from '../../version.ts';
import { TUTORIAL_DONE_KEY } from '../tutorial/Tutorial.tsx';
import { SealedLetter, type LetterState } from './SealedLetter.tsx';

export type TitleChoice =
  | { kind: 'new'; city: CityId; tavernName: string; playerName: string; timerScale: number; ngPlus: number }
  | { kind: 'continue'; save: SaveFile }
  | { kind: 'tutorial'; tavernName: string; playerName: string };

const CITY_BLURB: Record<CityId, string> = {
  aleforge: '+ cheap, high-quality ale · − high rent, crowded',
  shanty: '+ Favor currency, big pirate tips · − brawls, tribute',
  providence: '+ big-spending Apostles · − tithe, Friar inspections',
  roto: '+ no sales tax, exotic stock · − thieves, volatile prices',
};

const WINS_KEY = 'last-call:wins';

/** Letters, numbers, spaces and . _ ' - only (what the leaderboard accepts). */
const cleanName = (s: string) => s.replace(/[^A-Za-z0-9 _.'-]/g, '').slice(0, 16);
const cleanTavern = (s: string) => s.replace(/[^A-Za-z0-9 _.'&-]/g, '').slice(0, 28);
const PREFS_KEY = 'last-call:title-prefs';

interface Prefs { city: CityId; name: string; assist: number }
function loadPrefs(): Prefs {
  const def: Prefs = { city: 'aleforge', name: '', assist: 1 };
  try {
    const p = { ...def, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
    // The old default was saved as if typed; clear it so the example shows.
    if (p.name === 'The Last Call') p.name = '';
    return p;
  } catch {
    return def;
  }
}
function savePrefs(p: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** The Timers choice on the home page, with what it changes. */
const TIMER_OPTS = [
  { value: 1, label: 'Standard', note: 'Standard timers: patrons wait, thieves and brawls play out, and decisions expire at the normal pace.' },
  { value: 1.5, label: 'Assisted ×1.5', note: 'Assisted ×1.5: patrons wait 50% longer for a seat and a drink, and you get 50% longer to catch thieves, break up brawls and answer most decisions. Runs are tagged Assisted on the leaderboards.' },
  { value: 2, label: 'Assisted ×2', note: 'Assisted ×2: patrons wait twice as long for a seat and a drink, and you get twice as long to catch thieves, break up brawls and answer most decisions. Runs are tagged Assisted on the leaderboards.' },
];

export function TitleScreen({ content, onPlay, loadSave }: { content: Content; onPlay: (c: TitleChoice) => void; loadSave: () => Promise<SaveFile | null> }) {
  const [letter, setLetter] = useState<LetterState>('sealed');
  const prefs = loadPrefs();
  const [city, setCity] = useState<CityId>(prefs.city);
  const [name, setName] = useState(prefs.name);
  const [innkeeper, setInnkeeper] = useState(savedName());
  const [assist, setAssist] = useState(prefs.assist);
  const [mode, setModeState] = useState<PlayMode>(getMode());
  const [guidesSeen, setGuidesSeen] = useState(() => seenGuides().size);
  const pickMode = (m: PlayMode) => { setMode(m); setModeState(m); };
  const [confirmNew, setConfirmNew] = useState(false);
  const [ngPlus, setNgPlus] = useState(false);
  const [save, setSave] = useState<SaveFile | null>(null);
  const [boards, setBoards] = useState(false);
  const read = letter === 'read';
  let wins = 0;
  let tutorialDone = false;
  try {
    wins = Number(localStorage.getItem(WINS_KEY) ?? 0);
    tutorialDone = !!localStorage.getItem(TUTORIAL_DONE_KEY);
  } catch { /* ignore */ }
  const play = () => {
    // Starting over abandons a saved run: ask once more first.
    if (save && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    savePrefs({ city, name, assist });
    saveName(innkeeper.trim());
    onPlay({ kind: 'new', city, tavernName: name.trim() || 'The Last Call', playerName: innkeeper.trim(), timerScale: assist, ngPlus: ngPlus ? 1 : 0 });
  };

  useEffect(() => { void loadSave().then(setSave); }, []);

  return (
    <main class="title-screen">
      <HallRecord content={content} />
      <h1 class="title-logo">Last Call</h1>
      <p class="title-sub">The Long Thirst · Year {content.time.startYear}</p>

      <SealedLetter letter={content.letter} state={letter} onOpen={() => setLetter('open')} onClose={() => setLetter('read')} />

      {save && (
        <div class="continue-box">
          <button class="btn btn-primary" onClick={() => onPlay({ kind: 'continue', save })} data-testid="continue">
            Continue · {save.world.taverns[save.world.focus.tavernId]?.name ?? 'your run'} · Year {Math.floor(save.world.tick / (content.time.seasonTicks.goldsun * 3 + content.time.holidayKegTicks)) + content.time.startYear}
          </button>
          <span class="small muted">Starting a new run abandons it.</span>
        </div>
      )}

      <section class="who-panel" aria-label="Who's pouring?">
        <h2>Who’s pouring?</h2>
        <label class="big-field">
          <span>Your name <small>(innkeeper · shown on the leaderboards)</small></span>
          <input
            type="text" maxLength={16} value={innkeeper} placeholder="e.g. Jack_Anqoak"
            onInput={(e) => setInnkeeper(cleanName((e.target as HTMLInputElement).value))}
            data-testid="innkeeper-name"
          />
        </label>
        <label class="big-field">
          <span>Tavern name <small>(your company goes by it · blank = The Last Call)</small></span>
          <input
            type="text" maxLength={28} value={name} placeholder="e.g. The Gilded Tankard"
            onInput={(e) => setName(cleanTavern((e.target as HTMLInputElement).value))}
            data-testid="tavern-name"
          />
        </label>
      </section>

      <fieldset class="city-picker" aria-label="Home city">
        <legend>Home city</legend>
        {content.cities.map((c) => (
          <button
            key={c.id}
            class={`city-chip ${city === c.id ? 'city-chip-on' : ''}`}
            style={{ '--accent': TOWN_COLOR[c.id] }}
            aria-pressed={city === c.id}
            onClick={() => setCity(c.id)}
            data-testid={`city-${c.id}`}
            title={CITY_BLURB[c.id]}
          >
            {c.name}
          </button>
        ))}
      </fieldset>
      <p class="small city-blurb">{cityOf(content, city).name}: {CITY_BLURB[city]}</p>

      <div class="title-options">
        <div class="timer-pick" role="radiogroup" aria-label="Timers">
          <span class="timer-label">Timers</span>
          {TIMER_OPTS.map((o) => (
            <button
              key={o.value}
              class={`timer-chip ${assist === o.value ? 'on' : ''}`}
              role="radio"
              aria-checked={assist === o.value}
              onClick={() => setAssist(o.value)}
              data-testid={`timers-${o.value}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div class="timer-pick" role="radiogroup" aria-label="Player">
          <span class="timer-label">Player</span>
          {(['beginner', 'experienced'] as const).map((m) => (
            <button key={m} class={`timer-chip ${mode === m ? 'on' : ''}`} role="radio" aria-checked={mode === m} onClick={() => pickMode(m)} data-testid={`mode-${m}`}>
              {m === 'beginner' ? 'Beginner' : 'Experienced'}
            </button>
          ))}
        </div>
        {wins > 0 && (
          <label class="check" title="Rivals start sharper and richer, and hide their plans better">
            <input type="checkbox" checked={ngPlus} onChange={(e) => setNgPlus((e.target as HTMLInputElement).checked)} /> NG+
          </label>
        )}
      </div>

      <div class="title-notes">
        <p class="small timer-note" data-testid="timer-note">{(TIMER_OPTS.find((o) => o.value === assist) ?? TIMER_OPTS[0]!).note}</p>
        <p class="small mode-note" data-testid="mode-note">
            {mode === 'beginner'
              ? 'Beginner: the first time you open each menu, the game pauses and explains what’s on it. '
              : 'Experienced: no menu guides. '}
            This doesn’t change the difficulty; it only helps new players learn how to play.
          {mode === 'beginner' && guidesSeen > 0 && (
              <> <button class="link-btn" onClick={() => { resetGuides(); setGuidesSeen(0); }} data-testid="guides-reset">Show the menu guides again</button></>
            )}
          </p>
      </div>

      <div class="title-actions">
        <button
          class={`btn play-button ${read ? 'play-prominent' : 'play-muted'} ${confirmNew ? 'confirm' : ''}`}
          onClick={play}
          data-testid="play"
        >
          {confirmNew ? 'Abandon saved run?' : save ? 'New run' : 'Play'}
        </button>
        <button
          class={`btn ${tutorialDone ? '' : 'tutorial-new'}`}
          onClick={() => onPlay({ kind: 'tutorial', tavernName: name.trim() || 'The Last Call', playerName: innkeeper.trim() })}
          data-testid="tutorial-start"
          title="A guided first shift: the controls, step by step (not ranked, doesn't touch your saved run)"
        >
          Tutorial
        </button>
        <button class="btn" onClick={() => setBoards(true)} data-testid="open-leaderboard">Leaderboards</button>
      </div>
      {boards && <LeaderboardView onClose={() => setBoards(false)} />}
      <span class="version-tag title-version" data-testid="version">{APP_VERSION}</span>
    </main>
  );
}
