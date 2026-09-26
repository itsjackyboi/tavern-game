import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import { calendarAt, endTick, formatClock, ticksPerYear } from '../../src/sim/time.ts';

const t = loadContent().time;

describe('calendar', () => {
  it('starts at Year 448, Stormtide, day', () => {
    const c = calendarAt(0, t);
    expect(c).toMatchObject({ year: 448, segment: 'stormtide', phase: 'day', isNight: false, shiftIndex: 0 });
  });

  it('one year is three season-shifts plus the Holiday Keg', () => {
    expect(ticksPerYear(t)).toBe(1300 * 3 + 160);
    expect(calendarAt(1300, t).segment).toBe('goldsun');
    expect(calendarAt(2600, t).segment).toBe('veilfrost');
    expect(calendarAt(3900, t).segment).toBe('holidayKeg');
    expect(calendarAt(3900, t).phase).toBe('holiday');
    expect(calendarAt(ticksPerYear(t), t)).toMatchObject({ year: 449, segment: 'stormtide', shiftIndex: 3 });
  });

  it('flips day to night at the Hangover bell, then Last Call ends the shift', () => {
    const bell = Math.ceil(1300 * t.dayFraction);
    expect(calendarAt(bell - 1, t).phase).toBe('day');
    expect(calendarAt(bell, t).phase).toBe('night');
    expect(calendarAt(1300 - t.lastCallTicks, t).phase).toBe('lastCall');
  });

  it('Veilfrost is night for the whole shift', () => {
    for (let k = 2600; k < 3900; k += 50) expect(calendarAt(k, t).isNight).toBe(true);
    expect(calendarAt(2600, t).phase).toBe('night');
  });

  it('the run covers 16 years (448 to 463) and then passes the end', () => {
    const end = endTick(t);
    expect(end).toBe(16 * ticksPerYear(t));
    expect(calendarAt(end - 1, t)).toMatchObject({ year: 463, segment: 'holidayKeg', pastEnd: false });
    expect(calendarAt(end, t).pastEnd).toBe(true);
    expect(calendarAt(end - 1, t).shiftIndex).toBe(47);
  });

  it('run length is about 54 minutes of sim time', () => {
    const minutes = endTick(t) / t.ticksPerSecond / 60;
    expect(minutes).toBeGreaterThan(50);
    expect(minutes).toBeLessThan(60);
  });

  it('formats the run clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});
