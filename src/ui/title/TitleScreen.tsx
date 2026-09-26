import { useState } from 'preact/hooks';
import { PALETTES } from '../../art/palettes.ts';
import type { CityId, Content } from '../../content/schema.ts';
import { SealedLetter, type LetterState } from './SealedLetter.tsx';

export function TitleScreen({ content, onPlay }: { content: Content; onPlay: (city: CityId) => void }) {
  const [letter, setLetter] = useState<LetterState>('sealed');
  const [city, setCity] = useState<CityId>('aleforge');
  const read = letter === 'read';

  return (
    <main class="title-screen">
      <h1 class="title-logo">Last Call</h1>
      <p class="title-sub">
        The Long Thirst · Year {content.time.startYear}
      </p>

      <SealedLetter
        letter={content.letter}
        state={letter}
        onOpen={() => setLetter('open')}
        onClose={() => setLetter('read')}
      />

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
          >
            {c.name}
          </button>
        ))}
      </fieldset>

      <button
        class={`btn play-button ${read ? 'play-prominent' : 'play-muted'}`}
        onClick={() => onPlay(city)}
        data-testid="play"
      >
        Play
      </button>
    </main>
  );
}
