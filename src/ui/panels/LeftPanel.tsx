import type { GameController } from '../../app/controller.ts';
import { drinkCss } from '../../art/themes.ts';
import { drinkOf, kegCost, player, playerTaverns, staffAt } from '../../sim/lookup.ts';
import type { Tavern } from '../../sim/types.ts';
import { FOUND_MIN_REP, networkRep } from '../../sim/network.ts';
import { RepSpark, trendOf } from '../RepTrend.tsx';
import { intelLevel } from '../../sim/rivals.ts';
import { hover, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { JOB_NAME, ROLE_ICON, TIER_NAME, sortStaff, tavernIssues } from '../tavernHealth.ts';

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
          title={`${t.name} (key ${i + 1})`}
        >
          <span class="tt-city">{ctrl.content.cities.find((c) => c.id === t.city)?.name}</span>
          {STATUS[t.status] && <span class="tt-status">{STATUS[t.status]}</span>}
          {t.id !== w.focus.tavernId && t.status !== 'building' && t.attention < 0.5 && <span class="tt-alert" title="Needs attention">!</span>}
          {tavernIssues(w, ctrl.content, t).some((x) => x.level === 'problem') && <span class="tt-trouble" title="Something's wrong here: see Your taverns (right)" />}
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
      {sortStaff(staff).map((s) => (
        <div class="chip" key={s.id} title={`${JOB_NAME[s.role] ?? s.role} · ${TIER_NAME[s.tier]} · ${s.name} · competence ${Math.round(s.competence * 100)} · morale ${Math.round(s.morale * 100)} · fatigue ${Math.round(s.fatigue * 100)}`}>
          <span>{ROLE_ICON[s.role] ?? '•'}</span>
          <span class="chip-job">{JOB_NAME[s.role] ?? s.role}</span>
          <span class={`tier-badge tier-${s.tier}`} title={TIER_NAME[s.tier]}>{TIER_NAME[s.tier]![0]}</span>
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

/** Reputation of the tavern you're in, with its recent trend. */
function Reputation({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const { dir, text: trendText } = trendOf(t);
  const net = networkRep(w);
  const many = playerTaverns(w).filter((x) => x.status !== 'building').length > 1;
  return (
    <section class="panel-block rep-block" data-testid="rep-block">
      <h3>
        <span>Reputation{STATUS[t.status] ? <span class="muted"> · {STATUS[t.status]}</span> : null}</span>
        <span class="muted rep-note">{net >= FOUND_MIN_REP ? 'sister taverns open' : `sisters need ${FOUND_MIN_REP}${many ? ' avg' : ''}`}</span>
      </h3>
      <div class="rep-main" title={`0–100. Happy patrons raise it; waits, walkouts, brawls, dry taps and steep prices lower it.${many ? ` Network average ${Math.round(net)}.` : ''}`}>
        <span class="rep-num">{Math.round(t.rep)}</span>
        <span class="bar rep-bar">
          <span class="fill" style={{ width: `${t.rep}%` }} />
          <span class="rep-mark" style={{ left: `${FOUND_MIN_REP}%` }} title={`${FOUND_MIN_REP}: sister taverns`} />
        </span>
      </div>
      <div class={`rep-trend ${dir}`} title="Change over about the last minute">
        <span data-testid="rep-trend">{trendText}</span>
        <RepSpark t={t} />
        {many && <span class="muted rep-net">avg {Math.round(net)}</span>}
      </div>
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

const KIND_TAG: Record<string, string> = { intel: 'Intel', rumor: 'Rumour', news: 'News', alert: 'Alert', event: 'Event', wind: 'Winds' };
const LEVEL_NAME = ['No informant', 'Green informant', 'Seasoned informant', 'Master informant'];
const LEVEL_NOTE = [
  'You only overhear gossip in your own taverns. Hire a Drifter Informant (Staff, S) to learn what rivals are up to.',
  'Rivals’ moves reach you as rumours, often unclear.',
  'Clear reports on rivals’ moves, and a report on local rivals each season.',
  'Near-certain reports, and each season the rivals’ purses and plans.',
];

/**
 * Word around the Isles: news and intel on the competition, newest first.
 * How much you hear about rivals depends on your informants. Hovering
 * something on the floor shows its details here instead.
 */
function EventFeed({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // reads another signal (hover), so it must subscribe to frames itself
  const w = ctrl.world;
  const t = w.taverns[w.focus.tavernId];
  const { level } = t ? intelLevel(w, t.city) : { level: 0 };
  const recent = w.log.slice(-8).reverse();
  return (
    <section class={`panel-block feed intel-${level}`} data-testid="ticker">
      <h3>
        Word around the Isles
        <span class={`intel-badge lvl-${level}`} title={LEVEL_NOTE[level]}>{LEVEL_NAME[level]}</span>
      </h3>
      {level < 3 && <p class="intel-note">{LEVEL_NOTE[level]}</p>}
      {hover.value && <div class="hover-line">{hover.value}</div>}
      <div class="feed-lines">
        {recent.length === 0 && <div class="tick-line muted">Quiet, for now.</div>}
        {recent.map((l, i) => (
          <div key={`${l.tick}-${l.text}`} class={`tick-line kind-${l.kind} ${w.tick - l.tick < 200 ? 'fresh' : ''}`} style={{ opacity: Math.max(0.45, 1 - i * 0.08) }}>
            <span class={`feed-tag tag-${l.kind}`}>{KIND_TAG[l.kind] ?? l.kind}</span>
            {l.text}
          </div>
        ))}
      </div>
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
      {t && <Reputation ctrl={ctrl} t={t} />}
      <EventFeed ctrl={ctrl} />
    </aside>
  );
}
