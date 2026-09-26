import { useEffect, useState } from 'preact/hooks';
import type { SaveFile } from '../../app/save.ts';
import { PALETTES } from '../../art/palettes.ts';
import type { CityId, Content } from '../../content/schema.ts';
import { cityOf } from '../../sim/lookup.ts';
import { LeaderboardView } from '../leaderboard/LeaderboardPanel.tsx';
import { APP_VERSION } from '../../version.ts';
import { TUTORIAL_DONE_KEY } from '../tutorial/Tutorial.tsx';
import { SealedLetter, type LetterState } from './SealedLetter.tsx';

export type TitleChoice =
  | { kind: 'new'; city: CityId; tavernName: string; timerScale: number; ngPlus: number }
  | { kind: 'continue'; save: SaveFile }
  | { kind: 'tutorial'; tavernName: string };

const CITY_BLURB: Record<CityId, string> = {
  aleforge: '+ cheap, high-quality ale · − high rent, crowded',
  shanty: '+ Favor currency, big pirate tips · − brawls, tribute',
  providence: '+ big-spending Apostles · − tithe, Friar inspections',
  roto: '+ no sales tax, exotic stock · − thieves, volatile prices',
};

const WINS_KEY = 'last-call:wins';
const PREFS_KEY = 'last-call:title-prefs';

interface Prefs { city: CityId; name: string; assist: number }
function loadPrefs(): Prefs {
  const def: Prefs = { city: 'aleforge', name: 'The Last Call', assist: 1 };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return def;
  }
}
function savePrefs(p: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function TitleScreen({ content, onPlay, loadSave }: { content: Content; onPlay: (c: TitleChoice) => void; loadSave: () => Promise<SaveFile | null> }) {
  const [letter, setLetter] = useState<LetterState>('sealed');
  const prefs = loadPrefs();
  const [city, setCity] = useState<CityId>(prefs.city);
  const [name, setName] = useState(prefs.name);
  const [assist, setAssist] = useState(prefs.assist);
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
    onPlay({ kind: 'new', city, tavernName: name, timerScale: assist, ngPlus: ngPlus ? 1 : 0 });
  };

  useEffect(() => { void loadSave().then(setSave); }, []);

  return (
    <main class="title-screen">
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

      <fieldset class="city-picker" aria-label="Home city">
        <legend>Home city</legend>
        {content.cities.map((c) => (
          <button
            key={c.id}
            class={`city-chip ${city === c.id ? 'city-chip-on' : ''}`}
            style={{ '--accent': PALETTES[c.palette]?.accent ?? '#ccc' }}
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
        <label>Tavern name <input type="text" maxLength={28} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
        <label title="Longer reaction windows. Runs go on the Assisted leaderboard.">
          Timers
          <select value={assist} onChange={(e) => setAssist(Number((e.target as HTMLSelectElement).value))}>
            <option value={1}>Standard</option>
            <option value={1.5}>Assisted ×1.5</option>
            <option value={2}>Assisted ×2</option>
          </select>
        </label>
        {wins > 0 && (
          <label class="check" title="Rivals start sharper and richer, and hide their plans better">
            <input type="checkbox" checked={ngPlus} onChange={(e) => setNgPlus((e.target as HTMLInputElement).checked)} /> NG+
          </label>
        )}
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
          onClick={() => onPlay({ kind: 'tutorial', tavernName: name })}
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
