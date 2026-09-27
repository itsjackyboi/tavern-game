import { repTrend } from '../sim/network.ts';
import type { Tavern } from '../sim/types.ts';

// Reputation trend pieces shared by the left panel and the tavern report.

export type TrendDir = 'up' | 'down' | 'flat';

export function trendOf(t: Tavern): { delta: number; dir: TrendDir; text: string } {
  const delta = repTrend(t);
  const dir: TrendDir = delta >= 0.3 ? 'up' : delta <= -0.3 ? 'down' : 'flat';
  const text = dir === 'up' ? `▲ +${delta.toFixed(1)} rising` : dir === 'down' ? `▼ ${delta.toFixed(1)} falling` : '▬ steady';
  return { delta, dir, text };
}

/** Sparkline of the last minute of reputation (0–100 scale). */
export function RepSpark({ t }: { t: Tavern }) {
  const points = [...(t.repTrail ?? []), t.rep];
  if (points.length < 2) return null;
  const lo = Math.max(0, Math.min(...points) - 3);
  const hi = Math.min(100, Math.max(...points) + 3);
  const span = Math.max(1, hi - lo);
  const d = points.map((v, i) => `${(i / (points.length - 1)) * 100},${30 - ((v - lo) / span) * 30}`).join(' ');
  return (
    <svg class="rep-spark" viewBox="0 -2 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={d} />
    </svg>
  );
}
