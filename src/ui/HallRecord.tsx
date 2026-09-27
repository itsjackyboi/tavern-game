import { useEffect, useState } from 'preact/hooks';
import type { Content } from '../content/schema.ts';
import { sound } from './bus.ts';

/**
 * A torn page from the Hoegaarden Hall of Records, tucked in the bottom-left
 * of the title screen so new players know where (and when) they are.
 */
export function HallRecord({ content }: { content: Content }) {
  const r = content.records;
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen((o) => !o);
    sound('ui');
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
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
      </article>
    </div>
  );
}
