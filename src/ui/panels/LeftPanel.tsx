import type { GameController } from '../../app/controller.ts';
import { drinkCss } from '../../art/themes.ts';
import { drinkOf, kegCost, player, playerTaverns, staffAt } from '../../sim/lookup.ts';
import type { Tavern } from '../../sim/types.ts';
import { hover, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';

const ROLE_ICON: Record<string, string> = { bar: '🍺', floor: '🏃', door: '✊', cellar: '🛢', stage: '♪', intel: '👁', manage: '✎' };
const STATUS: Record<string, string> = { building: 'building', establishing: 'establishing', established: '', struggling: 'struggling', closed: 'closed' };

function TavernTabs({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  return (
    <div class="tavern-tabs">
      {playerTaverns(w).map((t, i) => (
        <button
          key={t.id}
          class={`tavern-tab ${t.id === w.focus.tavernId ? 'on' : ''} status-${t.status}`}
          disabled={t.status === 'building'}
          onClick={() => ctrl.dispatch({ type: 'focus', tavernId: t.id })}
          title={`${t.name} (Ctrl+${i + 1})`}
        >
          <span class="tt-city">{ctrl.content.cities.find((c) => c.id === t.city)?.name}</span>
          <span class="tt-rep" style={{ '--rep': `${t.rep}%` }}>{Math.round(t.rep)}</span>
          {STATUS[t.status] && <span class="tt-status">{STATUS[t.status]}</span>}
          {t.id !== w.focus.tavernId && t.status !== 'building' && t.attention < 0.5 && <span class="tt-alert" title="Needs attention">!</span>}
        </button>
      ))}
    </div>
  );
}

function Stock({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const c = ctrl.content;
  const w = ctrl.world;
  return (
    <section class="panel-block">
      <h3>Taps <span class="muted">cellar</span></h3>
      {t.menu.slice(0, t.taps).map((m) => {
        const d = drinkOf(c, m.drinkId);
        const lvl = t.tapLevels[m.drinkId] ?? 0;
        const cellar = t.cellar[m.drinkId] ?? 0;
        const onOrder = t.orders.filter((o) => o.drinkId === m.drinkId).reduce((s, o) => s + o.kegs, 0);
        const cost = kegCost(w, c, m.drinkId, t.city, player(w), t);
        return (
          <div class="stock-row" key={m.drinkId} title={`${d.name}: tap ${lvl}/${c.economy.kegServings}, ${cellar} kegs in the cellar${onOrder ? `, ${onOrder} on order` : ''}`}>
            <span class="stock-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
            <span class="bar"><span class={`fill ${lvl <= 0 ? 'empty' : ''}`} style={{ width: `${(lvl / c.economy.kegServings) * 100}%`, background: drinkCss(c, d.id) }} /></span>
            <span class={`stock-kegs ${cellar === 0 ? 'zero' : ''}`}>{cellar}{onOrder ? `+${onOrder}` : ''}</span>
            <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'orderKegs', tavernId: t.id, drinkId: m.drinkId, kegs: 1 })} title={`Order a keg: ${money(cost)} Duckets`}>
              +1
            </button>
          </div>
        );
      })}
      <label class="check" title="Order kegs automatically to keep the cellar stocked">
        <input type="checkbox" checked={t.autoRestock} onChange={(e) => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto: (e.target as HTMLInputElement).checked, target: t.restockTarget })} />
        auto-restock to {t.restockTarget}
      </label>
    </section>
  );
}

function StaffChips({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const staff = staffAt(w, t.id);
  const mgr = t.managerId ? w.staff[t.managerId] : null;
  return (
    <section class="panel-block">
      <h3>Staff <span class="muted">{staff.length}/{ctrl.content.staff.maxStaffPerTavern}</span></h3>
      {mgr && (
        <div class="chip" title={`${mgr.name}, manager (${mgr.tier}) · competence ${Math.round(mgr.competence * 100)}`}>
          <span>{ROLE_ICON.manage}</span> <span class="chip-name">{mgr.name}</span>
          <span class="stars">{'★'.repeat(Math.round(mgr.competence * 5))}</span>
        </div>
      )}
      {staff.length === 0 && <p class="muted small">Just you. Hire help (S).</p>}
      {staff.map((s) => (
        <div class="chip" key={s.id} title={`${s.name} · ${s.tier} · competence ${Math.round(s.competence * 100)} · morale ${Math.round(s.morale * 100)} · fatigue ${Math.round(s.fatigue * 100)}`}>
          <span>{ROLE_ICON[s.role] ?? '•'}</span>
          <span class="chip-name">{s.name.split(' ')[0]}</span>
          <span class="mini-bar morale"><span style={{ width: `${s.morale * 100}%` }} /></span>
          <span class="mini-bar fatigue"><span style={{ width: `${s.fatigue * 100}%` }} /></span>
        </div>
      ))}
    </section>
  );
}

function Rivals({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const locals = Object.values(w.taverns).filter((x) => x.city === t.city && x.status !== 'closed' && x.companyId !== w.playerId);
  const total = Object.values(w.taverns).filter((x) => x.city === t.city && x.status !== 'closed').reduce((s, x) => s + x.demand.rate, 0) || 1;
  const mineShare = t.demand.rate / total;
  return (
    <section class="panel-block">
      <h3>Rivals here</h3>
      <div class="rival-row me" title="Your share of patrons in this city">
        <span class="rival-name">You</span>
        <span class="bar"><span class="fill share" style={{ width: `${mineShare * 100}%` }} /></span>
      </div>
      {locals.map((r) => {
        const co = w.companies[r.companyId]!;
        const brain = co.rival;
        const share = r.demand.rate / total;
        const pressure = Math.min(1, share * 2 * (brain?.aggression ?? 0.5) * (1 + (brain?.tier ?? 0) * 0.35));
        const hue = Math.round(120 - pressure * 120);
        return (
          <div class="rival-row" key={r.id} title={`${r.name} · ${co.rival?.archetype ?? ''} · rep ${Math.round(r.rep)}${brain?.mood === 'desperate' ? ' · desperate' : ''}`}>
            <span class={`rival-name ${brain?.isArch ? 'arch' : ''}`}>{r.name}</span>
            <span class="bar"><span class="fill" style={{ width: `${Math.max(6, pressure * 100)}%`, background: `hsl(${hue} 70% 50%)` }} /></span>
            {brain?.mood === 'desperate' && <span class="desperate" title="Desperate">⚠</span>}
          </div>
        );
      })}
    </section>
  );
}

function Shipments({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  if (!w.shipments.length) return null;
  return (
    <section class="panel-block">
      <h3>At sea</h3>
      {w.shipments.map((s) => {
        const to = w.taverns[s.toId];
        const left = Math.max(0, Math.ceil((s.arriveTick - w.tick) / 20));
        return (
          <div class="small" key={s.id}>
            {s.kegs}× {drinkOf(ctrl.content, s.drinkId).name} → {to?.name ?? '?'} · {left}s{s.insured ? ' · insured' : ''}
          </div>
        );
      })}
    </section>
  );
}

/** The Isles' news, newest first. Hovering something on the floor shows its details here instead. */
function EventFeed({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // reads another signal (hover), so it must subscribe to frames itself
  const recent = ctrl.world.log.slice(-6).reverse();
  return (
    <section class="panel-block feed" data-testid="ticker">
      <h3>Word around the Isles</h3>
      {hover.value ? (
        <div class="hover-line">{hover.value}</div>
      ) : (
        recent.map((l, i) => (
          <div key={`${l.tick}-${i}`} class={`tick-line kind-${l.kind}`} style={{ opacity: 1 - i * 0.12 }}>
            {l.text}
          </div>
        ))
      )}
    </section>
  );
}

export function LeftPanel({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const w = ctrl.world;
  const t = w.taverns[w.focus.tavernId];
  return (
    <aside class="left-panel">
      <div class="left-scroll">
        <TavernTabs ctrl={ctrl} />
        {t && <h2 class="tavern-title" title={t.name}>{t.name}</h2>}
        {t && <Stock ctrl={ctrl} t={t} />}
        {t && w.focus.view === 'floor' && <StaffChips ctrl={ctrl} t={t} />}
        {t && <Rivals ctrl={ctrl} t={t} />}
        <Shipments ctrl={ctrl} />
      </div>
      <EventFeed ctrl={ctrl} />
    </aside>
  );
}
