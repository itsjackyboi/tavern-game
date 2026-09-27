import { useState } from 'preact/hooks';
import type { GameController } from '../../app/controller.ts';
import { drinkCss } from '../../art/themes.ts';
import { drinkOf, kegCost, player, playerTaverns, seasonTicks, staffAt } from '../../sim/lookup.ts';
import { FOUND_MIN_REP } from '../../sim/network.ts';
import { kegsAtSea } from '../../sim/shipping.ts';
import type { Tavern } from '../../sim/types.ts';
import { drawer, sound, staffTavern, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { Card } from '../panels/Cards.tsx';
import { RepSpark, trendOf } from '../RepTrend.tsx';
import { ROLE_ICON, STATUS_LABEL, lastSeasonNet, seasonNet, servicePct, tavernIssues, walkoutShare } from '../tavernHealth.ts';

// A tavern's report: everything you need to keep it running without going there.

const ESTABLISH_REP = 45;

function Progress({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const len = seasonTicks(ctrl.content);
  if (t.status === 'building') return <p class="small">Being built: opens in {Math.max(0, Math.ceil((t.openTick - w.tick) / 20))}s with a manager, a tapster and a runner.</p>;
  if (t.status !== 'establishing') return null;
  const left = Math.max(0, Math.ceil((len - (w.tick - t.openTick)) / 20));
  const repOk = t.rep >= ESTABLISH_REP;
  return (
    <p class="small tr-progress">
      To become <b>established</b>: {left > 0 ? `${left}s more open` : 'open a full season ✔'} · reputation {Math.round(t.rep)}/{ESTABLISH_REP} {repOk ? '✔' : ''}
    </p>
  );
}

function SupplyLines({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const c = ctrl.content;
  const me = player(w);
  const sources = playerTaverns(w).filter((x) => x.id !== t.id && x.status !== 'closed' && x.status !== 'building');
  const drinks = [...new Set([...t.menu.map((m) => m.drinkId), ...me.unlocked])];
  const [fromId, setFrom] = useState('');
  const [drink, setDrink] = useState('');
  const [keepAt, setKeepAt] = useState(3);
  const [insured, setInsured] = useState(false);
  const from = sources.find((x) => x.id === fromId) ?? sources[0];
  const d = drinks.includes(drink) ? drink : drinks[0];
  const lines = (w.supplyLines ?? []).filter((l) => l.toId === t.id || l.fromId === t.id);
  const atSea = w.shipments.filter((s) => s.toId === t.id);
  return (
    <section class="panel-block" data-testid="supply-lines">
      <h3>Supply lines <span class="muted">kept stocked by sea</span></h3>
      {lines.length === 0 && <p class="small muted">None. A supply line tops a tavern up from another of yours: it ships spare kegs, or buys them there (never on credit).</p>}
      {lines.map((l) => {
        const a = w.taverns[l.fromId];
        const b = w.taverns[l.toId];
        return (
          <div class="tr-line" key={l.id}>
            <span style={{ color: drinkCss(c, l.drinkId) }}>{drinkOf(c, l.drinkId).name}</span>
            <span class="small">{a?.name} → {b?.name} · keep {l.keepAt}{l.insured ? ' · insured' : ''}</span>
            <button class="btn btn-tiny" title="Stop this supply line" onClick={() => ctrl.dispatch({ type: 'removeSupplyLine', id: l.id })}>✕</button>
          </div>
        );
      })}
      {atSea.length > 0 && (
        <p class="small">At sea to here: {atSea.map((s) => `${s.kegs}× ${drinkOf(c, s.drinkId).name} (${Math.max(0, Math.ceil((s.arriveTick - w.tick) / 20))}s)`).join(' · ')}</p>
      )}
      {from ? (
        <div class="ship-form">
          <select value={from.id} onChange={(e) => setFrom((e.target as HTMLSelectElement).value)} data-testid="sl-from">
            {sources.map((x) => <option key={x.id} value={x.id}>from {x.name}</option>)}
          </select>
          <select value={d} onChange={(e) => setDrink((e.target as HTMLSelectElement).value)} data-testid="sl-drink">
            {drinks.map((id) => <option key={id} value={id}>{drinkOf(c, id).name} ({money(kegCost(w, c, id, from.city, me, from))}◉ there)</option>)}
          </select>
          <label class="small">keep <input type="number" min="1" max="12" value={keepAt} onInput={(e) => setKeepAt(Math.max(1, Math.min(12, Number((e.target as HTMLInputElement).value) || 1)))} /> kegs</label>
          <label class="check"><input type="checkbox" checked={insured} onChange={(e) => setInsured((e.target as HTMLInputElement).checked)} /> insured</label>
          <button class="btn btn-primary" data-testid="sl-add" onClick={() => { ctrl.dispatch({ type: 'addSupplyLine', fromId: from.id, toId: t.id, drinkId: d!, keepAt, insured }); sound('buy'); }}>
            Add supply line
          </button>
        </div>
      ) : (
        <p class="small muted">Found another tavern to supply this one from.</p>
      )}
    </section>
  );
}

export function TavernReport({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  void uiFrame.value; // has its own hooks, so it must subscribe itself to redraw live
  const w = ctrl.world;
  const c = ctrl.content;
  const me = player(w);
  const here = w.focus.tavernId === t.id;
  const issues = tavernIssues(w, c, t);
  const trend = trendOf(t);
  const k = t.kpi;
  const last = lastSeasonNet(t);
  const sat = k.satN ? Math.round((k.satSum / k.satN) * 100) : null;
  const staff = staffAt(w, t.id);
  const mgr = t.managerId ? w.staff[t.managerId] : null;
  const asks = w.prompts.active.filter((p) => p.tavernId === t.id);
  const building = t.status === 'building';
  const go = () => {
    ctrl.dispatch({ type: 'focus', tavernId: t.id });
    ctrl.dispatch({ type: 'setView', view: 'floor' });
    drawer.value = null;
  };
  return (
    <div class="tavern-report" data-testid="tavern-report">
      <div class="panel-block tr-head">
        <p>
          <b>{t.name}</b> · <span class={`yt-status st-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          {here && <span class="yt-here"> · you're here</span>}
        </p>
        <Progress ctrl={ctrl} t={t} />
        {!here && <button class="btn btn-primary" disabled={building} onClick={go}>Go to the floor</button>}
      </div>

      {!building && (
        <>
          <section class="panel-block">
            <h3>Needs attention <span class="muted">{issues.length ? `${issues.length}` : 'all well'}</span></h3>
            {issues.length === 0 && <p class="small muted">Nothing wrong right now.</p>}
            {issues.map((i) => (
              <div class={`tr-issue ${i.level}`} key={i.key} data-testid="tr-issue">
                <b>{i.level === 'problem' ? '⚠ ' : ''}{i.text}</b> <span class="small">{i.fix}</span>
              </div>
            ))}
          </section>

          <section class="panel-block">
            <h3>Reputation <span class="muted">sisters need {FOUND_MIN_REP} · established {ESTABLISH_REP}</span></h3>
            <div class="rep-main">
              <span class="rep-num">{Math.round(t.rep)}</span>
              <span class="bar rep-bar">
                <span class="fill" style={{ width: `${t.rep}%` }} />
                <span class="rep-mark" style={{ left: `${FOUND_MIN_REP}%` }} />
                <span class="rep-mark est" style={{ left: `${ESTABLISH_REP}%` }} />
              </span>
            </div>
            <div class={`rep-trend ${trend.dir}`}><span>{trend.text}</span><RepSpark t={t} /></div>
          </section>

          <section class="panel-block">
            <h3>This season <span class="muted">rent and wages land at season end</span></h3>
            <table class="grid-table tr-kpi">
              <tbody>
                <tr><td>Sales</td><td>{money(k.revenue)}◉</td><td>Served</td><td>{Math.round(k.served)}</td></tr>
                <tr><td>Costs so far</td><td>{money(k.costs)}◉</td><td>Walkouts</td><td>{Math.round(k.walkouts)}{walkoutShare(k) ? ` (${Math.round(walkoutShare(k) * 100)}%)` : ''}</td></tr>
                <tr><td>Net so far</td><td class={seasonNet(t) >= 0 ? 'up' : 'down'}>{seasonNet(t) >= 0 ? '+' : ''}{money(seasonNet(t))}◉</td><td>Brawls · thefts</td><td>{Math.round(k.brawls)} · {Math.round(k.thefts)}</td></tr>
                <tr><td>Last season</td><td class={last === null ? '' : last >= 0 ? 'up' : 'down'}>{last === null ? '—' : `${last >= 0 ? '+' : ''}${money(last)}◉`}</td><td>Happiness</td><td>{sat === null ? '—' : `${sat}%`}</td></tr>
              </tbody>
            </table>
          </section>

          <section class="panel-block">
            <h3>Taps and cellar <span class="muted">tap · cellar</span></h3>
            {t.menu.slice(0, t.taps).map((m) => {
              const d = drinkOf(c, m.drinkId);
              const lvl = t.tapLevels[m.drinkId] ?? 0;
              const cellar = t.cellar[m.drinkId] ?? 0;
              const onOrder = t.orders.filter((o) => o.drinkId === m.drinkId).reduce((s, o) => s + o.kegs, 0) + kegsAtSea(w, t.id, m.drinkId);
              const cost = kegCost(w, c, m.drinkId, t.city, me, t);
              return (
                <div class="stock-row" key={m.drinkId}>
                  <span class="stock-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
                  <span class="bar"><span class={`fill ${lvl <= 0 ? 'empty' : ''}`} style={{ width: `${(lvl / c.economy.kegServings) * 100}%`, background: drinkCss(c, d.id) }} /></span>
                  <span class={`stock-kegs ${cellar === 0 ? 'zero' : ''}`} data-testid="tr-kegs">{cellar}{onOrder ? `+${onOrder}` : ''}</span>
                  <button class="btn btn-tiny" data-testid="tr-order" onClick={() => { ctrl.dispatch({ type: 'orderKegs', tavernId: t.id, drinkId: m.drinkId, kegs: 1 }); sound('buy'); }} title={`Order a keg here: ${money(cost)} Duckets`}>+1</button>
                </div>
              );
            })}
            <label class="check">
              <input type="checkbox" checked={t.autoRestock} onChange={(e) => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto: (e.target as HTMLInputElement).checked, target: t.restockTarget })} />
              auto-restock to {t.restockTarget}
            </label>
          </section>

          <section class="panel-block">
            <h3>Staff <span class="muted">{staff.length}/{c.staff.maxStaffPerTavern}</span></h3>
            {mgr ? (
              <div class="chip"><span>{ROLE_ICON.manage}</span> <span class="chip-name">{mgr.name}</span> <span class="small muted">manager · {mgr.tier}</span> <span class="stars">{'★'.repeat(Math.round(mgr.competence * 5))}</span></div>
            ) : <p class="small">No manager: requests go unanswered and service slips faster while you're away.</p>}
            {staff.map((s) => (
              <div class="chip" key={s.id} title={`morale ${Math.round(s.morale * 100)} · fatigue ${Math.round(s.fatigue * 100)}`}>
                <span>{ROLE_ICON[s.role] ?? '•'}</span>
                <span class="chip-name">{s.name}</span>
                <span class="small muted">{s.tier}</span>
                <span class="mini-bar morale"><span style={{ width: `${s.morale * 100}%` }} /></span>
                <span class="mini-bar fatigue"><span style={{ width: `${s.fatigue * 100}%` }} /></span>
              </div>
            ))}
            {!here && (
              <div class="tr-attn" title="While you're away a tavern slowly serves fewer people. A visit resets it; a better manager slows the decline.">
                <span>Attention</span>
                <span class="bar"><span class="fill" style={{ width: `${t.attention * 100}%` }} /></span>
                <span class="small">serving at {servicePct(t)}%</span>
              </div>
            )}
            <button class="btn" data-testid="tr-staff" onClick={() => { staffTavern.value = t.id; drawer.value = 'staff'; }}>Manage staff</button>
          </section>

          {asks.length > 0 && (
            <section class="panel-block">
              <h3>Requests from here</h3>
              {asks.map((p) => <Card key={p.uid} ctrl={ctrl} p={p} hotkeys={false} />)}
            </section>
          )}

          <SupplyLines ctrl={ctrl} t={t} />
        </>
      )}
    </div>
  );
}
