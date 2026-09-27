import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../app/controller.ts';
import { drinkCss } from '../art/themes.ts';
import { drinkOf, player, staffAt } from '../sim/lookup.ts';
import { hireCost } from '../sim/staff.ts';
import { dismissToast, newBrew, sound, toasts, uiFrame } from './bus.ts';

const TABLES_SEEN = 'last-call:nudge-tables';
function seenTables(): boolean {
  try { return localStorage.getItem(TABLES_SEEN) === '1'; } catch { return false; }
}

/**
 * Shown once ever: the first time three or more tables are messy and nobody
 * works the floor, point out that a Server clears tables for you.
 */
function TablesNudge({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const [state, setState] = useState<'wait' | 'show' | 'done'>(() => (seenTables() ? 'done' : 'wait'));
  const w = ctrl.world;
  const f = w.floor;
  const t = w.taverns[w.focus.tavernId];
  const trigger = state === 'wait' && !ctrl.tutorial && w.focus.view === 'floor' && !!f && !!t && f.tavernId === t.id
    && f.tables.filter((tb) => tb.dirty).length >= 3 && !staffAt(w, t.id).some((s) => s.role === 'floor');
  useEffect(() => {
    if (!trigger) return;
    setState('show');
    try { localStorage.setItem(TABLES_SEEN, '1'); } catch { /* private mode: it just shows again next run */ }
  }, [trigger]);
  if (state !== 'show' || !t) return null;
  const cost = hireCost(ctrl.content, 'green');
  return (
    <div class="toast toast-info nudge-toast" data-testid="tables-nudge">
      <span>Tables piling up? <b>A Server clears tables for you</b> (and seats patrons).</span>
      <button class="btn btn-tiny btn-primary" data-testid="nudge-hire"
        onClick={() => { ctrl.dispatch({ type: 'hire', tavernId: t.id, archetype: 'runner', tier: 'green' }); sound('buy'); setState('done'); }}>
        Hire a Server · {cost}◉
      </button>
      <button class="btn btn-tiny" onClick={() => setState('done')} aria-label="Dismiss">✕</button>
    </div>
  );
}

const BREW_SHOW_MS = 15000;

/** A just-discovered recipe, with a button to pour it straight away (or pick which tap to swap). */
function BrewToast({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // has hooks, so it must subscribe to frames itself
  const nb = newBrew.value;
  useEffect(() => {
    if (!nb) return;
    const id = setTimeout(() => { if (newBrew.value === nb) newBrew.value = null; }, BREW_SHOW_MS);
    return () => clearTimeout(id);
  }, [nb]);
  if (!nb) return null;
  const c = ctrl.content;
  const w = ctrl.world;
  const t = w.taverns[nb.tavernId] ?? w.taverns[w.focus.tavernId];
  if (!t || !player(w).unlocked.includes(nb.drinkId)) return null;
  const d = drinkOf(c, nb.drinkId);
  const ids = t.menu.map((m) => m.drinkId);
  const onTap = ids.includes(nb.drinkId);
  const full = ids.length >= t.taps;
  const pour = (replace: string | null) => {
    const next = replace ? ids.map((x) => (x === replace ? nb.drinkId : x)) : [...ids, nb.drinkId];
    ctrl.dispatch({ type: 'setMenu', tavernId: t.id, drinkIds: next });
    sound('confirm');
  };
  return (
    <div class="toast toast-good brew-toast" style={{ borderColor: drinkCss(c, d.id) }} data-testid="brew-toast">
      <span class="toast-swatch" style={{ background: drinkCss(c, d.id) }} />
      <span>New brew discovered: <b>{d.name}</b>!</span>
      {onTap ? (
        <span class="brew-on">On tap ✓</span>
      ) : full ? (
        <span class="brew-swap">
          Swap for:
          {ids.map((x) => (
            <button key={x} class="btn btn-tiny" onClick={() => pour(x)} style={{ color: drinkCss(c, x) }} data-testid="brew-swap">{drinkOf(c, x).name}</button>
          ))}
        </span>
      ) : (
        <button class="btn btn-tiny btn-primary" onClick={() => pour(null)} data-testid="brew-pour">Put on tap</button>
      )}
      <button class="btn btn-tiny" onClick={() => { newBrew.value = null; }} aria-label="Dismiss">✕</button>
    </div>
  );
}

/** Big messages across the top of the board. Click one to dismiss it. */
export function Toasts({ ctrl }: { ctrl: GameController }) {
  return (
    <div class="toasts" aria-live="polite" data-testid="toasts">
      <BrewToast ctrl={ctrl} />
      <TablesNudge ctrl={ctrl} />
      {toasts.value.map((t) => (
        <button key={`${t.id}-${t.count}`} class={`toast toast-${t.kind}`} style={t.color ? { borderColor: t.color } : undefined} onClick={() => dismissToast(t.id)} title="Click to dismiss">
          {t.color && <span class="toast-swatch" style={{ background: t.color }} />}
          {t.kind === 'error' && <span class="toast-icon">⚠</span>}
          {t.text}
          {t.count > 1 && <span class="toast-count">×{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
