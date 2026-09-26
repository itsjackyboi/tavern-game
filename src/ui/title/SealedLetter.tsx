import type { Letter } from '../../content/schema.ts';

export type LetterState = 'sealed' | 'open' | 'read';

// The letter mechanism only. The copy lives in src/content/data/strings/letter.json
// and is placeholder until the owner supplies the real text.
export function SealedLetter({
  letter,
  state,
  onOpen,
  onClose,
}: {
  letter: Letter;
  state: LetterState;
  onOpen: () => void;
  onClose: () => void;
}) {
  if (state === 'open') {
    return (
      <div class="letter-backdrop" role="dialog" aria-label="Your letter" data-testid="letter-open">
        <article class="parchment">
          {letter.placeholder && <div class="placeholder-banner">PLACEHOLDER COPY — real letter to be supplied</div>}
          <p class="letter-salutation">{letter.salutation}</p>
          {letter.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p class="letter-signature">{letter.signature}</p>
          <button class="btn btn-primary" onClick={onClose} data-testid="letter-close" autofocus>
            {letter.closeLabel}
          </button>
        </article>
      </div>
    );
  }
  return (
    <button
      class={`envelope ${state === 'read' ? 'envelope-read' : 'envelope-sealed'}`}
      onClick={onOpen}
      data-testid="letter-envelope"
      aria-label={state === 'read' ? 'Read your letter again' : letter.sealLabel}
    >
      <span class="envelope-flap" />
      <span class="wax-seal" aria-hidden="true">{state === 'read' ? '✓' : 'LC'}</span>
      <span class="envelope-label">{state === 'read' ? 'Read again' : letter.sealLabel}</span>
    </button>
  );
}
