import type { SeasonId, TimeTuning } from '../content/schema.ts';

// The calendar is derived from the tick count; nothing else stores the date.
// One season = one shift (a representative day and night). A year is three
// season-shifts plus the Holiday Keg. See docs/PLAN.md §2.1.

export type Segment = SeasonId | 'holidayKeg';
export type Phase = 'day' | 'night' | 'lastCall' | 'holiday';

export interface Calendar {
  year: number;
  /** 0-based year index since startYear. */
  yearIndex: number;
  segment: Segment;
  /** 0..2 for seasons, 3 for the Holiday Keg. */
  segmentIndex: number;
  /** Ticks elapsed within the current segment. */
  segmentTick: number;
  segmentTicks: number;
  /** 0..1 progress through the current segment. */
  progress: number;
  phase: Phase;
  isNight: boolean;
  /** Global season-shift counter (0-based), counting only the three seasons. */
  shiftIndex: number;
  /** True once the calendar has passed the end of endYear. */
  pastEnd: boolean;
}

export function ticksPerYear(t: TimeTuning): number {
  return t.seasonOrder.reduce((sum, s) => sum + t.seasonTicks[s], 0) + t.holidayKegTicks;
}

/** Tick at which the run's last year ends (the Year-463 verdict). */
export function endTick(t: TimeTuning): number {
  return (t.endYear - t.startYear + 1) * ticksPerYear(t);
}

export function calendarAt(tick: number, t: TimeTuning): Calendar {
  const perYear = ticksPerYear(t);
  const yearIndex = Math.floor(tick / perYear);
  let rem = tick - yearIndex * perYear;
  let segmentIndex = 0;
  let segment: Segment = 'holidayKeg';
  let segmentTicks = t.holidayKegTicks;
  for (let i = 0; i < t.seasonOrder.length; i++) {
    const s = t.seasonOrder[i] as SeasonId;
    const len = t.seasonTicks[s];
    if (rem < len) {
      segment = s;
      segmentIndex = i;
      segmentTicks = len;
      break;
    }
    rem -= len;
    segmentIndex = i + 1;
  }
  const segmentTick = rem;
  const progress = segmentTick / segmentTicks;

  let phase: Phase;
  if (segment === 'holidayKeg') phase = 'holiday';
  else if (segmentTick >= segmentTicks - t.lastCallTicks) phase = 'lastCall';
  else if (segment === 'veilfrost') phase = 'night';
  else phase = progress < t.dayFraction ? 'day' : 'night';

  const isNight = phase === 'night' || phase === 'lastCall' || phase === 'holiday' || segment === 'veilfrost';
  const shiftIndex = yearIndex * t.seasonOrder.length + Math.min(segmentIndex, t.seasonOrder.length - 1);

  return {
    year: t.startYear + yearIndex,
    yearIndex,
    segment,
    segmentIndex,
    segmentTick,
    segmentTicks,
    progress,
    phase,
    isNight,
    shiftIndex,
    pastEnd: tick >= endTick(t),
  };
}

export const SEGMENT_LABEL: Record<Segment, string> = {
  stormtide: 'Stormtide',
  goldsun: 'Goldsun',
  veilfrost: 'Veilfrost',
  holidayKeg: 'Holiday Keg',
};

/** Formats sim milliseconds as the run clock, m:ss (or h:mm:ss). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Calendar time: world ticks minus any closing-time hold (the calendar waits for the last patrons). */
export function calTick(w: { tick: number; clockHold?: number }): number {
  return w.tick - (w.clockHold ?? 0);
}

/** The calendar as it stands now, allowing for closing-time holds. */
export function calNow(w: { tick: number; clockHold?: number }, t: TimeTuning): Calendar {
  return calendarAt(calTick(w), t);
}
