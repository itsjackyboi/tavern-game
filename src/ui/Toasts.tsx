import { toasts } from './bus.ts';

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}
