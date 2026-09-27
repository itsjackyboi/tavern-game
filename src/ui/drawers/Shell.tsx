import { drawer } from '../bus.ts';

/** The frame every drawer shares: a title, a close button and a scrolling body. */
export function Shell({ title, children, wide }: { title: string; children: preact.ComponentChildren; wide?: boolean }) {
  return (
    <div class={`drawer ${wide ? 'drawer-wide' : ''}`} data-testid="drawer">
      <div class="drawer-head">
        <h2>{title}</h2>
        <button class="btn btn-small" onClick={() => (drawer.value = null)} aria-label="Close">✕</button>
      </div>
      <div class="drawer-body">{children}</div>
    </div>
  );
}
