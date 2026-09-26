import { dismissToast, toasts } from './bus.ts';

/** Big messages across the top of the board. Click one to dismiss it. */
export function Toasts() {
  return (
    <div class="toasts" aria-live="polite" data-testid="toasts">
      {toasts.value.map((t) => (
        <button key={`${t.id}-${t.count}`} class={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)} title="Click to dismiss">
          {t.kind === 'error' && <span class="toast-icon">⚠</span>}
          {t.text}
          {t.count > 1 && <span class="toast-count">×{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
