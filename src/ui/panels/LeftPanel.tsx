import type { GameController } from '../../app/controller.ts';
import { drinkCss } from '../../art/themes.ts';
import { useState } from 'preact/hooks';
import { cityOf, drinkOf, kegCost, player, playerTaverns, staffAt, upgradeCount } from '../../sim/lookup.ts';
import { INSURANCE_RATE, lossChance, travelTicks } from '../../sim/shipping.ts';
import type { LogEntry, Tavern } from '../../sim/types.ts';
import type { CityId } from '../../content/schema.ts';
import { FOUND_MIN_REP, networkRep } from '../../sim/network.ts';
import { RepSpark, trendOf } from '../RepTrend.tsx';
import { rivalEdge } from '../rivalEdge.ts';
import { intelLevel } from '../../sim/rivals.ts';
import { drawer, hover, noticeHistory, sound, staffTavern, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { townStyle } from '../townColors.ts';
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
          style={townStyle(t.city)}
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

/** Puts `drinkId` on tap `slot`; a drink already on another tap swaps places with it. */
function tapMenu(t: Tavern, slot: number, drinkId: string): string[] {
  const ids = t.menu.map((m) => m.drinkId);
  const from = ids.indexOf(drinkId);
  if (from >= 0) {
    if (slot < ids.length) [ids[from], ids[slot]] = [ids[slot]!, ids[from]!];
    return ids;
  }
  if (slot < ids.length) ids[slot] = drinkId;
  else ids.push(drinkId);
  return ids;
}

/** Inline "Send…" form: ship kegs from this tavern's cellar to one of your others. */
function SendRow({ ctrl, t, drinkId, onDone }: { ctrl: GameController; t: Tavern; drinkId: string; onDone: () => void }) {
  void uiFrame.value; // has hooks, so it must subscribe to frames itself
  const w = ctrl.world;
  const c = ctrl.content;
  const others = playerTaverns(w).filter((x) => x.id !== t.id && x.status !== 'closed');
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [n, setN] = useState(1);
  const [insured, setInsured] = useState(false);
  const have = t.cellar[drinkId] ?? 0;
  const dest = w.taverns[to];
  if (!dest) return null;
  const secs = Math.round(travelTicks(c, t.city, dest.city, upgradeCount(player(w), 'ofern-tunnels') > 0) / 20);
  const risk = Math.round(lossChance(w, c, t.city, dest.city) * 100);
  return (
    <div class="send-row" data-testid="send-row">
      <select value={to} onChange={(e) => setTo((e.target as HTMLSelectElement).value)} aria-label="Send to">
        {others.map((x) => <option key={x.id} value={x.id}>to {cityOf(c, x.city).name}</option>)}
      </select>
      <button class="btn btn-tiny" onClick={() => setN(Math.max(1, n - 1))} aria-label="Fewer kegs">−</button>
      <b>{Math.min(n, have)}</b>
      <button class="btn btn-tiny" onClick={() => setN(Math.min(have, n + 1))} aria-label="More kegs">+</button>
      <label class="check small" title={`Voyage Wager: ${Math.round(INSURANCE_RATE * 100)}% of the cargo's value, paid back if the ship is lost`}>
        <input type="checkbox" checked={insured} onChange={(e) => setInsured((e.target as HTMLInputElement).checked)} />⚓
      </label>
      <button
        class="btn btn-tiny btn-primary"
        disabled={have <= 0}
        data-testid="send-ship"
        onClick={() => { ctrl.dispatch({ type: 'ship', fromId: t.id, toId: to, drinkId, kegs: Math.min(n, have), insured }); sound('buy'); onDone(); }}
        title={`${secs}s at sea · loss risk ${risk}%`}
      >
        Ship
      </button>
      <span class="small muted">{secs}s · {risk}% risk</span>
    </div>
  );
}

function Stock({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  void uiFrame.value; // has hooks, so it must subscribe to frames itself
  const c = ctrl.content;
  const w = ctrl.world;
  const me = player(w);
  const [sending, setSending] = useState<string | null>(null);
  const canSend = playerTaverns(w).some((x) => x.id !== t.id && x.status !== 'closed');
  const setRestock = (auto: boolean, target: number) => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto, target });
  return (
    <section class="panel-block" data-testid="taps">
      <h3>Taps <span class="muted">cellar</span></h3>
      {Array.from({ length: t.taps }, (_, slot) => {
        const m = t.menu[slot];
        if (!m) {
          return (
            <div class="stock-row empty-tap" key={`empty-${slot}`}>
              <select class="tap-select" value="" data-testid="tap-select" aria-label={`Tap ${slot + 1}`}
                onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) ctrl.dispatch({ type: 'setMenu', tavernId: t.id, drinkIds: tapMenu(t, slot, v) }); }}>
                <option value="">(empty tap)</option>
                {me.unlocked.filter((id) => !t.menu.some((x) => x.drinkId === id)).map((id) => <option key={id} value={id}>{drinkOf(c, id).name}</option>)}
              </select>
            </div>
          );
        }
        const d = drinkOf(c, m.drinkId);
        const lvl = t.tapLevels[m.drinkId] ?? 0;
        const cellar = t.cellar[m.drinkId] ?? 0;
        const onOrder = t.orders.filter((o) => o.drinkId === m.drinkId).reduce((s, o) => s + o.kegs, 0);
        const cost = kegCost(w, c, m.drinkId, t.city, me, t);
        return (
          <div key={m.drinkId}>
            <div class="stock-row" title={`${d.name}: tap ${lvl}/${c.economy.kegServings}, ${cellar} kegs in the cellar${onOrder ? `, ${onOrder} on order` : ''}`}>
              <select class="tap-select stock-name" value={m.drinkId} style={{ color: drinkCss(c, d.id) }} data-testid="tap-select" aria-label={`Tap ${slot + 1}`}
                onChange={(e) => ctrl.dispatch({ type: 'setMenu', tavernId: t.id, drinkIds: tapMenu(t, slot, (e.target as HTMLSelectElement).value) })}>
                {me.unlocked.map((id) => <option key={id} value={id} style={{ color: drinkCss(c, id) }}>{drinkOf(c, id).name}</option>)}
              </select>
              <span class="bar"><span class={`fill ${lvl <= 0 ? 'empty' : ''}`} style={{ width: `${(lvl / c.economy.kegServings) * 100}%`, background: drinkCss(c, d.id) }} /></span>
              <span class={`stock-kegs ${cellar === 0 ? 'zero' : ''}`}>{cellar}{onOrder ? `+${onOrder}` : ''}</span>
              <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'orderKegs', tavernId: t.id, drinkId: m.drinkId, kegs: 1 })} title={`Order a keg: ${money(cost)} Duckets`}>
                +1
              </button>
              {canSend && (
                <button class={`btn btn-tiny ${sending === m.drinkId ? 'on' : ''}`} disabled={cellar <= 0} data-testid="send-open"
                  onClick={() => setSending(sending === m.drinkId ? null : m.drinkId)} title={cellar > 0 ? 'Send kegs from this cellar to another of your taverns' : 'Nothing in the cellar to send'}>
                  ⇢
                </button>
              )}
            </div>
            {sending === m.drinkId && <SendRow ctrl={ctrl} t={t} drinkId={m.drinkId} onDone={() => setSending(null)} />}
          </div>
        );
      })}
      <div class="restock-row" title="Order kegs automatically to keep this many of each drink in the cellar">
        <label class="check">
          <input type="checkbox" checked={t.autoRestock} onChange={(e) => setRestock((e.target as HTMLInputElement).checked, t.restockTarget)} />
          auto-restock
        </label>
        <span class="small muted">keep</span>
        <button class="btn btn-tiny" onClick={() => setRestock(t.autoRestock, t.restockTarget - 1)} aria-label="Keep fewer kegs" data-testid="restock-minus">−</button>
        <b data-testid="restock-target">{t.restockTarget}</b>
        <button class="btn btn-tiny" onClick={() => setRestock(t.autoRestock, t.restockTarget + 1)} aria-label="Keep more kegs" data-testid="restock-plus">+</button>
        <span class="small muted">each</span>
      </div>
    </section>
  );
}

/** Morale below this: they'll ask for a raise at season end. Fatigue above this: slow and souring. */
const UNHAPPY = 0.4;
const WORN = 0.7;

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
      {sortStaff(staff).map((s) => {
        const unhappy = s.morale < UNHAPPY;
        const worn = s.fatigue > WORN;
        return (
          <div class={`chip ${unhappy || worn ? 'chip-warn' : ''}`} key={s.id} data-testid={unhappy || worn ? 'staff-warn' : undefined}
            title={`${JOB_NAME[s.role] ?? s.role} · ${TIER_NAME[s.tier]} · ${s.name} · competence ${Math.round(s.competence * 100)} · morale ${Math.round(s.morale * 100)} · fatigue ${Math.round(s.fatigue * 100)}`}>
            <span>{ROLE_ICON[s.role] ?? '•'}</span>
            <span class="chip-job">{JOB_NAME[s.role] ?? s.role}</span>
            <span class={`tier-badge tier-${s.tier}`} title={TIER_NAME[s.tier]}>{TIER_NAME[s.tier]![0]}</span>
            <span class="chip-name">{s.name.split(' ')[0]}</span>
            <span class="mini-bar morale"><span style={{ width: `${s.morale * 100}%` }} /></span>
            <span class="mini-bar fatigue"><span style={{ width: `${s.fatigue * 100}%` }} /></span>
            {unhappy && (
              <span class="chip-fix" title="Unhappy staff ask for a raise at season end, and may walk out if refused">
                <b>unhappy</b>
                <button class="btn btn-tiny btn-primary" data-testid="staff-raise" onClick={() => { ctrl.dispatch({ type: 'raise', staffId: s.id }); sound('confirm'); }}>
                  Raise → {Math.round(s.wage * 1.15 + 1)}◉
                </button>
              </span>
            )}
            {worn && !unhappy && (
              <span class="chip-fix" title="Worn-out staff work slower and lose morale. Fatigue eases at season end; another pair of hands shares the load">
                <b>worn out</b>
                <button class="btn btn-tiny" onClick={() => { staffTavern.value = t.id; drawer.value = 'staff'; }}>Hire help</button>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Rivals({ ctrl, t }: { ctrl: GameController; t: Tavern }) {
  const w = ctrl.world;
  const locals = Object.values(w.taverns).filter((x) => x.city === t.city && x.status !== 'closed' && x.companyId !== w.playerId);
  const total = Object.values(w.taverns).filter((x) => x.city === t.city && x.status !== 'closed').reduce((s, x) => s + x.demand.rate, 0) || 1;
  const mineShare = t.demand.rate / total;
  const { level } = intelLevel(w, t.city);
  return (
    <section class="panel-block" data-testid="rivals">
      <h3>Rivals here <span class="muted small">pull on your patrons</span></h3>
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
        const edge = rivalEdge(w, ctrl.content, r, t, level);
        return (
          <div class="rival-block" key={r.id}>
            <div class="rival-row" title={`${r.name} · ${co.rival?.archetype ?? ''} · rep ${Math.round(r.rep)}${brain?.mood === 'desperate' ? ' · desperate' : ''}. The bar is how hard they're pulling your patrons away.`}>
              <span class={`rival-name ${brain?.isArch ? 'arch' : ''}`}>{r.name}</span>
              <span class="bar"><span class="fill" style={{ width: `${Math.max(6, pressure * 100)}%`, background: `hsl(${hue} 70% 50%)` }} /></span>
              {brain?.mood === 'desperate' && <span class="desperate" title="Desperate">⚠</span>}
            </div>
            <div class={`rival-edge ${edge.hot || pressure > 0.5 ? 'hot' : ''}`} data-testid="rival-edge">{edge.text}</div>
          </div>
        );
      })}
      {locals.length > 0 && level < 2 && <p class="muted small rival-note">A seasoned informant (S) adds their prices and quality.</p>}
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

const KIND_TAG: Record<string, string> = { intel: 'Intel', rumor: 'Rumour', news: 'News', alert: 'Alert', event: 'Event', wind: 'Winds', notice: 'Notice' };
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
/** Alerts (closures, departures, creditors) stay pinned in the feed until clicked. */
const dismissedAlerts = new Set<string>();
const alertKey = (l: LogEntry) => `${l.tick}|${l.text}`;

function FeedLine({ ctrl, l, cls, style, onClick }: { ctrl: GameController; l: { kind: string; text: string; city: CityId | null }; cls?: string; style?: Record<string, string | number>; onClick?: () => void }) {
  return (
    <div class={`tick-line kind-${l.kind} ${l.city ? 'has-town' : ''} ${cls ?? ''}`} style={{ ...style, ...townStyle(l.city) }} onClick={onClick} title={onClick ? 'Click to dismiss' : undefined}>
      <span class={`feed-tag tag-${l.kind}`}>{KIND_TAG[l.kind] ?? l.kind}</span>
      {l.city && <span class="town-chip">{ctrl.content.cities.find((c) => c.id === l.city)?.name}</span>}
      {l.text}
    </div>
  );
}

/**
 * Word around the Isles: news and intel on the competition, newest first.
 * How much you hear about rivals depends on your informants. Hovering
 * something on the floor shows its details here instead. The Log button
 * opens the last 50 lines and pop-up notices.
 */
function EventFeed({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // reads another signal (hover), so it must subscribe to frames itself
  const [logOpen, setLogOpen] = useState(false);
  const [, bump] = useState(0);
  const w = ctrl.world;
  const t = w.taverns[w.focus.tavernId];
  const { level } = t ? intelLevel(w, t.city) : { level: 0 };
  const pinned = w.log.filter((l) => l.kind === 'alert' && !dismissedAlerts.has(alertKey(l))).slice(-3).reverse();
  const recent = w.log.filter((l) => !pinned.includes(l)).slice(-8).reverse();
  const history = [
    ...w.log.map((l, i) => ({ ...l, order: l.tick * 1000 + i })),
    ...noticeHistory.value.map((n, i) => ({ tick: n.tick, kind: n.kind === 'error' ? 'alert' : 'notice', text: n.text, city: null, order: n.tick * 1000 + 500 + i })),
  ].sort((a, b) => b.order - a.order).slice(0, 50);
  return (
    <section class={`panel-block feed intel-${level} ${logOpen ? 'log-open' : ''}`} data-testid="ticker">
      <h3>
        Word around the Isles
        <span class="feed-head-right">
          <button class={`btn btn-tiny ${logOpen ? 'on' : ''}`} data-testid="log-open" onClick={() => setLogOpen(!logOpen)} title="The last 50 lines and pop-up notices">
            {logOpen ? 'Close log' : `Log (${history.length})`}
          </button>
          <span class={`intel-badge lvl-${level}`} title={LEVEL_NOTE[level]}>{LEVEL_NAME[level]}</span>
        </span>
      </h3>
      {logOpen ? (
        <div class="feed-lines log-lines" data-testid="notice-log">
          {history.length === 0 && <div class="tick-line muted">Nothing yet.</div>}
          {history.map((l) => (
            <div key={`${l.order}`} class="log-row">
              <span class="log-when">{Math.floor(l.tick / 20 / 60)}:{String(Math.floor(l.tick / 20) % 60).padStart(2, '0')}</span>
              <FeedLine ctrl={ctrl} l={l} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {level < 3 && <p class="intel-note">{LEVEL_NOTE[level]}</p>}
          {hover.value && <div class="hover-line">{hover.value}</div>}
          <div class="feed-lines">
            {pinned.map((l) => (
              <FeedLine key={alertKey(l)} ctrl={ctrl} l={l} cls="pinned" onClick={() => { dismissedAlerts.add(alertKey(l)); bump((n) => n + 1); }} />
            ))}
            {recent.length === 0 && pinned.length === 0 && <div class="tick-line muted">Quiet, for now.</div>}
            {recent.map((l, i) => (
              <FeedLine key={`${l.tick}-${l.text}`} ctrl={ctrl} l={l} cls={w.tick - l.tick < 200 ? 'fresh' : ''} style={{ opacity: Math.max(0.45, 1 - i * 0.08) }} />
            ))}
          </div>
        </>
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
      {t && <Reputation ctrl={ctrl} t={t} />}
      <EventFeed ctrl={ctrl} />
    </aside>
  );
}
