import { signal } from '@preact/signals';
import type { GameController, PauseReason } from '../app/controller.ts';
import { league } from '../sim/company.ts';
import { player, playerTaverns } from '../sim/lookup.ts';
import { establishedSisters } from '../sim/network.ts';
import { SEGMENT_LABEL, formatClock, type Phase } from '../sim/time.ts';
import { uiFrame } from './bus.ts';

// The HUD reads a small view model derived from the world at up to 10 Hz.
// Panels read the world directly but re-render on the same 10 Hz beat (uiFrame).

export interface ViewModel {
  year: number;
  segment: string;
  phase: Phase;
  clock: string;
  duckets: number;
  favor: number;
  cv: number;
  rank: number;
  companies: number;
  nextName: string;
  nextCV: number;
  monopolyProgress: number;
  sisters: number;
  paused: PauseReason | null;
  view: 'floor' | 'world';
  status: string;
  hasShanty: boolean;
  debt: number;
  lowCash: boolean;
}

export const vm = signal<ViewModel | null>(null);

export function computeVm(ctrl: GameController): ViewModel {
  const w = ctrl.world;
  const me = player(w);
  const cal = ctrl.calendar();
  const lg = league(w);
  const rank = lg.findIndex((co) => co.id === me.id) + 1;
  const next = lg.find((co) => co.id !== me.id);
  const ratio = ctrl.content.economy.monopolyRatio;
  return {
    year: cal.year,
    segment: SEGMENT_LABEL[cal.segment],
    phase: cal.phase,
    clock: formatClock(ctrl.clock.simMs),
    duckets: Math.round(me.cash),
    favor: Math.floor(me.favor),
    cv: me.cv,
    rank,
    companies: lg.length,
    nextName: next?.name ?? '-',
    nextCV: next?.cv ?? 0,
    monopolyProgress: next && next.cv > 0 ? Math.max(0, Math.min(1, me.cv / (ratio * next.cv))) : 0,
    sisters: establishedSisters(w),
    paused: ctrl.paused,
    view: w.focus.view,
    status: w.run.status,
    hasShanty: playerTaverns(w).some((t) => t.city === 'shanty'),
    debt: Math.round(me.debt),
    lowCash: w.run.lowCashSince !== null,
  };
}

export function bindViewModel(ctrl: GameController): () => void {
  let last = 0;
  let lastPaused: PauseReason | null = null;
  let lastStatus = '';
  const update = (force = false) => {
    const now = performance.now();
    const statusChanged = ctrl.world.run.status !== lastStatus;
    if (!force && now - last < 100 && ctrl.paused === lastPaused && !statusChanged) return;
    last = now;
    lastPaused = ctrl.paused;
    lastStatus = ctrl.world.run.status;
    vm.value = computeVm(ctrl);
    uiFrame.value++;
  };
  update(true);
  return ctrl.subscribe(() => update());
}
