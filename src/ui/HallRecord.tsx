import type { GameController } from '../app/controller.ts';
import { recordOpen, sound } from './bus.ts';

/**
 * A torn page from the Hoegaarden Hall of Records, tucked in the bottom-left
 * of the board. Click the scrap to read it (the game waits while you do).
 */
export function HallRecord({ ctrl }: { ctrl: GameController }) {
  const r = ctrl.content.records;
  const open = recordOpen.value;
  const toggle = () => {
    recordOpen.value = !recordOpen.value;
    sound('ui');
  };
  if (!open) {
    return (
      <button class="record-tab" onClick={toggle} title={`${r.source}: ${r.title}`} data-testid="record-tab">
        <span class="record-tab-icon" aria-hidden="true">📜</span> {r.tabLabel}
      </button>
    );
  }
  return (
    <div class="record-wrap" onClick={toggle} data-testid="record">
      <article class="record-page" onClick={(e) => e.stopPropagation()} aria-label={r.title}>
        <button class="record-close" onClick={toggle} aria-label="Close">✕</button>
        <p class="record-source">{r.source}</p>
        <h2 class="record-title">{r.title}</h2>
        {r.paragraphs.map((p, i) => <p key={i} class={`record-p ${i === 0 ? 'first' : ''}`}>{p}</p>)}
        <p class="record-signoff">{r.signoff}</p>
        <p class="record-paused">⏸ The game waits while you read. Click outside the page or press Esc to carry on.</p>
      </article>
    </div>
  );
}
