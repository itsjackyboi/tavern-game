import { useState } from 'preact/hooks';
import type { GameController } from '../../app/controller.ts';
import { playerTaverns, staffAt } from '../../sim/lookup.ts';
import { networkRep } from '../../sim/network.ts';
import type { Tavern } from '../../sim/types.ts';
import { uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { trendOf } from '../RepTrend.tsx';
import { STATUS_LABEL, lastSeasonNet, openReport, seasonNet, servicePct, staffIcons, tavernIssues, townName, walkoutShare } from '../tavernHealth.ts';
import { Shell } from './Shell.tsx';

// Every tavern you run, side by side. Click a column to sort, a row for its report.

type Col = 'town' | 'rep' | 'net' | 'last' | 'served' | 'walk' | 'happy' | 'staff' | 'service';

const COLS: Array<[Col, string, string]> = [
  ['town', 'Tavern', 'Town and status'],
  ['rep', 'Rep', 'Reputation and its trend over the last minute'],
  ['net', 'Season', 'Profit this season so far (rent and wages land at season end)'],
  ['last', 'Last', 'Profit last season'],
  ['served', 'Served', 'Drinks served this season'],
  ['walk', 'Walkouts', 'Share of visitors who walked out this season'],
  ['happy', 'Happy', 'Average happiness of visits this season'],
  ['staff', 'Staff', 'Staff (✎ manager)'],
  ['service', 'Service', 'Serving speed while you are away (a visit resets it)'],
];

function value(t: Tavern, col: Col, w: GameController['world']): number | string {
  switch (col) {
    case 'town': return t.city;
    case 'rep': return t.rep;
    case 'net': return seasonNet(t);
    case 'last': return lastSeasonNet(t) ?? 0;
    case 'served': return t.kpi.served;
    case 'walk': return walkoutShare(t.kpi);
    case 'happy': return t.kpi.satN ? t.kpi.satSum / t.kpi.satN : 0;
    case 'staff': return staffAt(w, t.id).length;
    case 'service': return w.focus.tavernId === t.id ? 1 : t.attention;
  }
}

export function NetworkDrawer({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // has its own hooks, so it must subscribe itself to redraw live
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'rep', desc: true });
  const w = ctrl.world;
  const c = ctrl.content;
  const ts = playerTaverns(w).filter((t) => t.status !== 'closed');
  const rows = [...ts].sort((a, b) => {
    const va = value(a, sort.col, w);
    const vb = value(b, sort.col, w);
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sort.desc ? -d : d;
  });
  const sum = (f: (t: Tavern) => number) => ts.reduce((s, t) => s + f(t), 0);
  const click = (col: Col) => setSort((s) => ({ col, desc: s.col === col ? !s.desc : col !== 'town' }));
  return (
    <Shell title="All your taverns" wide>
      <p class="small muted">Click a column to sort, a row to open its report (without going there). Average reputation {Math.round(networkRep(w))}.</p>
      <table class="nw-table" data-testid="network-table">
        <thead>
          <tr>
            {COLS.map(([col, label, tip]) => (
              <th key={col} class={sort.col === col ? 'sorted' : ''} title={tip} onClick={() => click(col)} data-testid={`nw-sort-${col}`}>
                {label}{sort.col === col ? (sort.desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}
            <th>Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const issues = tavernIssues(w, c, t);
            const problem = issues.some((x) => x.level === 'problem');
            const tr = trendOf(t);
            const last = lastSeasonNet(t);
            const building = t.status === 'building';
            const here = w.focus.tavernId === t.id;
            return (
              <tr key={t.id} class={problem ? 'problem' : issues.length ? 'watch' : ''} onClick={() => openReport(t)} data-testid="nw-row">
                <td>{townName(c, t)}{here ? ' ·here' : ''}<br /><span class={`yt-status st-${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
                <td>{building ? '—' : <>{Math.round(t.rep)} <span class={tr.dir === 'up' ? 'up' : tr.dir === 'down' ? 'down' : 'muted'}>{tr.dir === 'up' ? '▲' : tr.dir === 'down' ? '▼' : ''}</span></>}</td>
                <td class={seasonNet(t) >= 0 ? 'up' : 'down'}>{building ? '—' : `${seasonNet(t) >= 0 ? '+' : ''}${money(seasonNet(t))}`}</td>
                <td class={last === null ? '' : last >= 0 ? 'up' : 'down'}>{last === null ? '—' : `${last >= 0 ? '+' : ''}${money(last)}`}</td>
                <td>{Math.round(t.kpi.served)}</td>
                <td>{walkoutShare(t.kpi) ? `${Math.round(walkoutShare(t.kpi) * 100)}%` : '—'}</td>
                <td>{t.kpi.satN ? `${Math.round((t.kpi.satSum / t.kpi.satN) * 100)}%` : '—'}</td>
                <td>{staffIcons(w, t) || '—'}</td>
                <td>{building ? '—' : here ? '100%' : `${servicePct(t)}%`}</td>
                <td class="nw-issue" title={issues.map((x) => x.text).join(', ')}>{issues.length ? `${problem ? '⚠ ' : ''}${issues[0]!.text}${issues.length > 1 ? ` +${issues.length - 1}` : ''}` : '✔'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{Math.round(networkRep(w))} avg</td>
            <td>{money(sum(seasonNet))}</td>
            <td>{money(sum((t) => lastSeasonNet(t) ?? 0))}</td>
            <td>{Math.round(sum((t) => t.kpi.served))}</td>
            <td colSpan={5} />
          </tr>
        </tfoot>
      </table>
    </Shell>
  );
}
