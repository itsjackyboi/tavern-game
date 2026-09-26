import { useState } from 'preact/hooks';
import type { YearRecord } from '../../sim/types.ts';
import { money } from '../describe.ts';

// Year-over-year profit or loss. One series with polarity: profit rises above
// the zero line in blue, a loss hangs below it in orange (a colour-blind-safe
// pair; direction carries the sign too). The current year is drawn faded as
// "so far". Hover a bar for its income, spending and result.

const W = 480;
const H = 150;
const PAD = { l: 44, r: 8, t: 14, b: 22 };
const BAR_MAX = 24;
const R = 4;
const PROFIT = '#4a8fd9';
const LOSS = '#dd6b3a';

/** A bar grown from the baseline with a 4px rounded data-end, square at the baseline. */
function barPath(x: number, w: number, base: number, end: number): string {
  const up = end < base;
  const h = Math.abs(end - base);
  const r = Math.min(R, h, w / 2);
  if (up) {
    return `M${x},${base} V${end + r} Q${x},${end} ${x + r},${end} H${x + w - r} Q${x + w},${end} ${x + w},${end + r} V${base} Z`;
  }
  return `M${x},${base} V${end - r} Q${x},${end} ${x + r},${end} H${x + w - r} Q${x + w},${end} ${x + w},${end - r} V${base} Z`;
}

function niceStep(span: number): number {
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}

export function ProfitChart({ years, current }: { years: YearRecord[]; current: YearRecord }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = [...years, current];
  const hi = Math.max(0, ...rows.map((r) => r.profit));
  const lo = Math.min(0, ...rows.map((r) => r.profit));
  const step = niceStep(Math.max(1, hi - lo));
  const top = Math.max(step, Math.ceil(hi / step) * step);
  const bottom = Math.min(0, Math.floor(lo / step) * step);
  const y = (v: number) => PAD.t + ((top - v) / (top - bottom)) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / Math.max(rows.length, 8);
  const bw = Math.min(BAR_MAX, slot - 2);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-6; v += step) ticks.push(v);
  const shown = hover !== null ? rows[hover] : null;
  const last = years.length - 1;
  return (
    <figure class="profit-chart" data-testid="profit-chart">
      <figcaption>
        <b>Profit or loss by year</b>
        <span class="muted"> · {shown ? `${shown.year}${hover === rows.length - 1 ? ' (so far)' : ''}: income ${money(shown.income)}, spending ${money(shown.spending)}, ${shown.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(shown.profit))}` : 'hover a bar for details'}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit or loss for each year of the run" onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} class={v === 0 ? 'axis-zero' : 'grid'} />
            <text x={PAD.l - 6} y={y(v) + 4} class="tick" text-anchor="end">{money(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD.l + i * slot + (slot - bw) / 2;
          const partial = i === rows.length - 1;
          const end = y(r.profit);
          const base = y(0);
          const flat = Math.abs(end - base) < 1;
          return (
            <g key={`${r.year}-${i}`} onMouseEnter={() => setHover(i)} class={hover === i ? 'bar hover' : 'bar'}>
              <title>{`${r.year}${partial ? ' (so far)' : ''}: ${r.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(r.profit))}`}</title>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {!flat && <path d={barPath(x, bw, base, end)} fill={r.profit >= 0 ? PROFIT : LOSS} opacity={partial ? 0.45 : 1} />}
              {(i % 2 === 0 || rows.length <= 8 || partial) && (
                <text x={x + bw / 2} y={H - 6} class="tick" text-anchor="middle">{partial ? 'now' : `’${String(r.year).slice(-2)}`}</text>
              )}
              {i === last && !flat && (
                <text x={x + bw / 2} y={r.profit >= 0 ? end - 4 : end + 12} class="value" text-anchor="middle">{money(r.profit)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
