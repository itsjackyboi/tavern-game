import { signal } from '@preact/signals';
import type { GameController, PauseReason } from '../app/controller.ts';
import { league } from '../sim/company.ts';
import { cityOf, drinkOf, kegCost, player, playerTaverns, seasonTicks, staffAt } from '../sim/lookup.ts';
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
  /** 'debt' < 'out' (can't afford a keg) < 'low' (can't cover a season's rent and wages). */
  money: 'debt' | 'out' | 'low' | null;
  /** Drinks on the focused tavern's taps with nothing left anywhere. */
  dryTaps: string[];
  /** Brawls, thieves and nearly-lost orders on the focused floor. */
  floorAlerts: number;
  /** Seconds until bankruptcy while creditors are circling, else null. */
  bankruptIn: number | null;
  /** Progress through the current season: 0..1, where day ends and Last Call starts, seconds to Last Call. */
  season: { frac: number; dayEnd: number; lcStart: number; lcIn: number | null; holiday: boolean };
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
  const c = ctrl.content;
  const t = w.taverns[w.focus.tavernId];
  const mine = playerTaverns(w).filter((x) => x.status !== 'closed');
  const onTap = t ? t.menu.slice(0, t.taps) : [];
  const cheapest = t && onTap.length ? Math.min(...onTap.map((m) => kegCost(w, c, m.drinkId, t.city, me, t))) : 0;
  const upkeep = mine.reduce((sum, x) => sum + cityOf(c, x.city).rentPerSeason + staffAt(w, x.id).reduce((a, st) => a + st.wage, 0), 0);
  const money: ViewModel['money'] = me.cash < 0 ? 'debt' : me.cash < cheapest ? 'out' : me.cash < upkeep ? 'low' : null;
  const dryTaps = t
    ? onTap.filter((m) => (t.tapLevels[m.drinkId] ?? 0) <= 0 && (t.cellar[m.drinkId] ?? 0) <= 0 && !t.orders.some((o) => o.drinkId === m.drinkId)).map((m) => drinkOf(c, m.drinkId).name)
    : [];
  const f = w.floor;
  const floorAlerts = f
    ? f.incidents.length + f.patrons.filter((p) => p.state === 'sneaking' || (p.state === 'ordered' && p.patience < p.patienceMax * 0.3)).length
    : 0;
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
    money,
    dryTaps,
    floorAlerts,
    season: {
      frac: cal.progress,
      dayEnd: cal.segment === 'holidayKeg' || cal.segment === 'veilfrost' ? 0 : c.time.dayFraction,
      lcStart: cal.segment === 'holidayKeg' ? 1 : 1 - c.time.lastCallTicks / cal.segmentTicks,
      lcIn: cal.phase === 'lastCall' || cal.segment === 'holidayKeg' ? null : Math.max(0, Math.ceil((cal.segmentTicks - c.time.lastCallTicks - cal.segmentTick) / 20)),
      holiday: cal.segment === 'holidayKeg',
    },
    bankruptIn: w.run.lowCashSince === null ? null : Math.max(0, Math.ceil((w.run.lowCashSince + seasonTicks(c) - w.tick) / 20)),
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
