import { useState } from 'preact/hooks';
import type { GameController } from '../../app/controller.ts';
import { drinkCss } from '../../art/themes.ts';
import type { CityId, IngredientId } from '../../content/schema.ts';
import type { Staff } from '../../sim/types.ts';
import { MAX_TAPS, upgradePrice } from '../../sim/actions.ts';
import { loanCap } from '../../sim/company.ts';
import { FINANCING } from '../../sim/economy/ledger.ts';
import {
  cityOf, drinkOf, drinkQuality, idx, ingredientPrice, kegCost, modsFor, player, playerTaverns, prefOf, servingPrice, staffAt, upgradeCount,
} from '../../sim/lookup.ts';
import { FOUND_MIN_REP, canFound, foundingCost, lotsFree, networkRep } from '../../sim/network.ts';
import { calendarAt } from '../../sim/time.ts';
import { INSURANCE_RATE, lossChance, travelTicks } from '../../sim/shipping.ts';
import { hireCost, trainCost } from '../../sim/staff.ts';
import type { Tavern } from '../../sim/types.ts';
import { audio } from '../../audio/engine.ts';
import { ProfitChart } from '../ledger/ProfitChart.tsx';
import { drawer, selectedCity, sound, uiFrame } from '../bus.ts';
import { RESULT_TEXT, describeDrink, describeUpgrade, money, recipeText } from '../describe.ts';

type StaffTier = Staff['tier'];

function focusTavern(ctrl: GameController): Tavern | undefined {
  return ctrl.world.taverns[ctrl.world.focus.tavernId];
}

function Shell({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div class="drawer" data-testid="drawer">
      <div class="drawer-head">
        <h2>{title}</h2>
        <button class="btn btn-small" onClick={() => (drawer.value = null)} aria-label="Close">✕</button>
      </div>
      <div class="drawer-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- staff

const TIERS: StaffTier[] = ['green', 'seasoned', 'master'];

function StaffDrawer({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // components with local state must subscribe themselves to redraw live
  const [firing, setFiring] = useState<string | null>(null);
  const t = focusTavern(ctrl);
  if (!t) return null;
  const c = ctrl.content;
  const w = ctrl.world;
  const staff = staffAt(w, t.id);
  const mgr = t.managerId ? w.staff[t.managerId] : null;
  const isFlagship = playerTaverns(w)[0]?.id === t.id;
  return (
    <Shell title={`Staff · ${t.name}`}>
      <table class="grid-table">
        <thead>
          <tr><th>Hire</th>{TIERS.map((tier) => <th key={tier}>{c.staff.tiers.find((x) => x.id === tier)!.name}</th>)}</tr>
        </thead>
        <tbody>
          {c.staff.archetypes.map((a) => (
            <tr key={a.id}>
              <td title={`Role: ${a.role}`}>{a.name}</td>
              {TIERS.map((tier) => {
                const td = c.staff.tiers.find((x) => x.id === tier)!;
                return (
                  <td key={tier}>
                    <button class="btn btn-tiny" onClick={() => { ctrl.dispatch({ type: 'hire', tavernId: t.id, archetype: a.id, tier }); sound('hire'); }} title={`Wage ${Math.round(td.wage * a.wageMult)}/season · competence ${Math.round(td.competence[0] * 100)}–${Math.round(td.competence[1] * 100)}`}>
                      {hireCost(c, tier)}◉
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="small muted">Staff take tasks by role: tapsters pour, runners seat and clear, bruisers stop brawls and thieves, cellarers restock, fiddlers lift the mood, informants read rivals. They're a little slower than you.</p>
      {!isFlagship && (
        <section class="panel-block">
          <h3>Manager</h3>
          {mgr ? <p>{mgr.name} · {c.staff.managers[t.city]} · {mgr.tier} · competence {Math.round(mgr.competence * 100)}</p> : <p class="warn">No manager: this tavern runs poorly.</p>}
          {TIERS.map((tier) => (
            <button key={tier} class="btn btn-small" onClick={() => ctrl.dispatch({ type: 'hireManager', tavernId: t.id, tier })}>
              {mgr ? 'Replace with' : 'Hire'} {tier} · {hireCost(c, tier, true)}◉
            </button>
          ))}
        </section>
      )}
      <section class="panel-block">
        <h3>On the payroll</h3>
        {staff.length === 0 && <p class="muted">Nobody yet.</p>}
        {staff.map((s) => (
          <div class="staff-row" key={s.id}>
            <span class="staff-name" title={s.archetype}>{s.name}</span>
            <span class="small">{s.role} · {s.tier} · C{Math.round(s.competence * 100)}</span>
            <span class="mini-bar morale" title={`Morale ${Math.round(s.morale * 100)}`}><span style={{ width: `${s.morale * 100}%` }} /></span>
            <span class="mini-bar fatigue" title={`Fatigue ${Math.round(s.fatigue * 100)}`}><span style={{ width: `${s.fatigue * 100}%` }} /></span>
            <span class="small">{s.wage}◉</span>
            <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'train', staffId: s.id })} title="Train: +6 competence">Train {trainCost(s)}</button>
            <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'raise', staffId: s.id })} title="Raise: +15% wage, +morale">Raise</button>
            <button
              class={`btn btn-tiny danger ${firing === s.id ? 'confirm' : ''}`}
              onClick={() => { if (firing === s.id) { ctrl.dispatch({ type: 'fire', staffId: s.id }); setFiring(null); } else setFiring(s.id); }}
              onBlur={() => setFiring(null)}
            >
              {firing === s.id ? 'Sure?' : 'Fire'}
            </button>
          </div>
        ))}
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------- menu

function MenuDrawer({ ctrl }: { ctrl: GameController }) {
  const t = focusTavern(ctrl);
  if (!t) return null;
  const c = ctrl.content;
  const w = ctrl.world;
  const me = player(w);
  const mods = modsFor(w, c, t);
  const onMenu = t.menu.map((m) => m.drinkId);
  const city = cityOf(c, t.city);
  const setMenu = (ids: string[]) => ctrl.dispatch({ type: 'setMenu', tavernId: t.id, drinkIds: ids });
  return (
    <Shell title={`Menu & prices · ${t.name}`}>
      <p class="small muted">{t.taps} of {MAX_TAPS} taps. Buy more with a Brass Tap Line (U).</p>
      {t.menu.map((m) => {
        const d = drinkOf(c, m.drinkId);
        const cost = kegCost(w, c, m.drinkId, t.city, me, t);
        const price = servingPrice(c, t, m.drinkId, mods);
        const margin = price - cost / c.economy.kegServings;
        return (
          <div class="menu-row" key={m.drinkId}>
            <div class="menu-top">
              <span class="drink-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
              <span class="small">Q{Math.round(drinkQuality(w, c, t, m.drinkId, mods))}</span>
              {city.contraband.includes(m.drinkId) && <span class="tag warn" title="Contraband here: sells, but draws the wardens">contraband</span>}
              {d.taboo && city.tabooAtNightOnly && <span class="tag" title="Taboo: sells after dark only">night only</span>}
              <button class="btn btn-tiny" onClick={() => setMenu(onMenu.filter((x) => x !== m.drinkId))}>Remove</button>
            </div>
            <div class="menu-price">
              <input type="range" min="0.6" max="1.8" step="0.05" value={m.price}
                onInput={(e) => ctrl.dispatch({ type: 'setPrice', tavernId: t.id, drinkId: m.drinkId, mult: Number((e.target as HTMLInputElement).value) })} />
              <span class="small">{price.toFixed(1)}◉ a pour · keg {money(cost)}◉ · margin {margin.toFixed(1)}</span>
            </div>
            <div class="menu-order">
              <span class="small">Cellar {t.cellar[m.drinkId] ?? 0}</span>
              {[1, 3].map((n) => (
                <button key={n} class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'orderKegs', tavernId: t.id, drinkId: m.drinkId, kegs: n })}>+{n} keg{n > 1 ? 's' : ''} {money(cost * n)}◉</button>
              ))}
            </div>
          </div>
        );
      })}
      <section class="panel-block">
        <h3>Known recipes</h3>
        {me.unlocked.filter((id) => !onMenu.includes(id)).map((id) => {
          const d = drinkOf(c, id);
          return (
            <div class="menu-row compact" key={id}>
              <span class="drink-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
              <span class="small">{describeDrink(d)}</span>
              <button class="btn btn-tiny" disabled={onMenu.length >= t.taps} onClick={() => setMenu([...onMenu, id])}>Add</button>
            </div>
          );
        })}
        {me.unlocked.every((id) => onMenu.includes(id)) && <p class="small muted">Discover more at the brewing bench (K).</p>}
      </section>
      <section class="panel-block">
        <h3>Restock policy</h3>
        <label class="check"><input type="checkbox" checked={t.autoRestock} onChange={(e) => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto: (e.target as HTMLInputElement).checked, target: t.restockTarget })} /> Auto-order kegs</label>
        <div class="stepper">
          Keep <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto: t.autoRestock, target: t.restockTarget - 1 })}>−</button>
          <b>{t.restockTarget}</b>
          <button class="btn btn-tiny" onClick={() => ctrl.dispatch({ type: 'setRestock', tavernId: t.id, auto: t.autoRestock, target: t.restockTarget + 1 })}>+</button> kegs of each in the cellar
        </div>
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------- upgrades

function UpgradesDrawer({ ctrl }: { ctrl: GameController }) {
  const t = focusTavern(ctrl);
  if (!t) return null;
  const c = ctrl.content;
  const me = player(ctrl.world);
  const row = (u: (typeof c.upgrades)[number], owner: Tavern | typeof me) => {
    const price = upgradePrice(c, owner, u.id);
    const n = upgradeCount(owner, u.id);
    return (
      <div class="upgrade-row" key={u.id}>
        <div>
          <b>{u.name}</b> {u.max > 1 && <span class="small muted">{n}/{u.max}</span>}
          <div class="small">{describeUpgrade(u)}</div>
        </div>
        <button class="btn btn-small" disabled={price === null} onClick={() => { ctrl.dispatch({ type: 'upgrade', tavernId: u.scope === 'company' ? null : t.id, upgradeId: u.id }); sound('buy'); }}>
          {price === null ? 'Owned' : `${money(price)}◉`}
        </button>
      </div>
    );
  };
  return (
    <Shell title={`Build · ${t.name}`}>
      <p class="small muted">{t.tables} tables · {t.taps} taps · decor {Math.round(t.decor * 100)}</p>
      {c.upgrades.filter((u) => u.scope === 'tavern' && (!u.city || u.city === t.city)).map((u) => row(u, t))}
      <section class="panel-block">
        <h3>Company</h3>
        {c.upgrades.filter((u) => u.scope === 'company').map((u) => row(u, me))}
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------- research

const INGS: IngredientId[] = ['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit', 'spiritweed', 'imports'];

const FEEL: Array<[number, string, string]> = [
  [-0.12, 'cheap', 'feel-cheap'], [0.1, 'fair', 'feel-fair'], [0.3, 'steep', 'feel-steep'], [Infinity, 'very steep', 'feel-dear'],
];

/**
 * How each drink on tap is selling at the focused tavern: its share of orders
 * (this season and last), who likes it, and how patrons feel about its price.
 */
function SalesPanel({ ctrl }: { ctrl: GameController }) {
  const c = ctrl.content;
  const w = ctrl.world;
  const t = focusTavern(ctrl);
  if (!t) return null;
  const onTap = t.menu.slice(0, t.taps);
  const night = calendarAt(w.tick, c.time).isNight;
  const sold = (id: string) => (t.kpi.byDrink[id] ?? 0) + (t.lastKpi?.byDrink[id] ?? 0);
  const total = onTap.reduce((sum, m) => sum + sold(m.drinkId), 0);
  const segs = Object.entries(t.demand.segRates).map(([id, rate]) => [c.segments.find((x) => x.id === id)!, rate] as const).filter(([seg]) => !!seg);
  const segTotal = segs.reduce((sum, [, r]) => sum + r, 0) || 1;
  const mods = modsFor(w, c, t);
  return (
    <section class="panel-block sales" data-testid="sales">
      <h3>Selling at {t.name} <span class="muted">this season + last</span></h3>
      {onTap.map((m) => {
        const d = drinkOf(c, m.drinkId);
        const share = total > 0 ? sold(m.drinkId) / total : 0;
        const likes = segs.filter(([seg]) => prefOf(seg, d.category, night) > 0).reduce((sum, [, r]) => sum + r, 0) / segTotal;
        const priceMult = m.price * (1 + t.priceBias) * mods.price;
        const feelScore = segs.reduce((sum, [seg, r]) => sum + ((priceMult - 1) / seg.spend) * r, 0) / segTotal;
        const [, feel, cls] = FEEL.find(([lim]) => feelScore < lim)!;
        return (
          <div class="sales-row" key={m.drinkId}>
            <span class="swatch" style={{ background: drinkCss(c, d.id) }} />
            <span class="drink-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
            <span class="bar" title={`${sold(m.drinkId)} served`}><span class="fill" style={{ width: `${share * 100}%`, background: drinkCss(c, d.id) }} /></span>
            <span class="sales-pct">{Math.round(share * 100)}%</span>
            <div class="sales-detail small">
              {sold(m.drinkId)} served · liked by {Math.round(likes * 100)}% of today’s patrons · {servingPrice(c, t, m.drinkId, mods).toFixed(1)}◉ a pour ({Math.round(m.price * 100)}% of list) · price feels <b class={cls}>{feel}</b>
            </div>
          </div>
        );
      })}
      {total === 0 && <p class="small muted">Nothing sold yet this season.</p>}
      <p class="small muted">Change prices in Menu (M).</p>
    </section>
  );
}

function ResearchDrawer({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // components with local state must subscribe themselves to redraw live
  const [pick, setPick] = useState<IngredientId[]>([]);
  const c = ctrl.content;
  const w = ctrl.world;
  const me = player(w);
  const toggle = (i: IngredientId) => setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].slice(-2)));
  const key = pick.length === 2 ? [...pick].sort().join('+') : '';
  const tried = key && w.research.tried.includes(key);
  return (
    <Shell title="Brewing bench">
      <SalesPanel ctrl={ctrl} />
      <h3 class="bench-title">Try a new recipe</h3>
      <p class="small muted">Combine two ingredients to try for a new recipe. Each attempt costs {c.economy.researchCost}◉. Spiritweed only comes from Veilwalker vows (you hold {me.spiritweed}).</p>
      <div class="ing-grid">
        {INGS.map((i) => (
          <button key={i} class={`btn ing ${pick.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)}>
            {c.ingredients.find((x) => x.id === i)!.name}
          </button>
        ))}
      </div>
      <button class="btn btn-primary" disabled={pick.length !== 2 || !!tried} onClick={() => { ctrl.dispatch({ type: 'research', a: pick[0]!, b: pick[1]! }); setPick([]); sound('brew'); }}>
        {tried ? 'Already tried' : `Brew a test batch (${c.economy.researchCost}◉)`}
      </button>
      <section class="panel-block">
        <h3>Your recipes</h3>
        {me.unlocked.map((id) => {
          const d = drinkOf(c, id);
          return (
            <div class="recipe" key={id}>
              <span class="drink-name" style={{ color: drinkCss(c, d.id) }}>{d.name}</span>
              <div class="small">{describeDrink(d)} · {recipeText(c, d)}</div>
            </div>
          );
        })}
      </section>
      <p class="small muted">Tried: {w.research.tried.length} of 28 pairs.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- finance

function FinanceDrawer({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  const c = ctrl.content;
  const me = player(w);
  const cap = loanCap(c, me);
  const flows = Object.entries(me.flows).filter(([k, v]) => k !== FINANCING && Math.abs(v) >= 0.5);
  const income = flows.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const spending = flows.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const inSum = income.reduce((s, [, v]) => s + v, 0);
  const outSum = -spending.reduce((s, [, v]) => s + v, 0);
  let yIn = 0;
  let yOut = 0;
  for (const [k, v] of Object.entries(me.flowsYear)) {
    if (k === FINANCING) continue;
    if (v >= 0) yIn += v;
    else yOut -= v;
  }
  const current = { year: c.time.startYear + me.yearHistory.length, income: yIn, spending: yOut, profit: yIn - yOut };
  const recent = [...me.recent].reverse().slice(0, 12);
  return (
    <Shell title="Ledger">
      <table class="grid-table money-table" data-testid="ledger-totals">
        <thead><tr><th>Money in, whole run</th><th>Duckets</th></tr></thead>
        <tbody>
          {income.map(([k, v]) => <tr key={k}><td>{k}</td><td class="pos">+{money(v)}</td></tr>)}
          {income.length === 0 && <tr><td class="muted" colSpan={2}>Nothing yet</td></tr>}
          <tr class="subhead"><th>Money out, whole run</th><th /></tr>
          {spending.map(([k, v]) => <tr key={k}><td>{k}</td><td class="neg">−{money(-v)}</td></tr>)}
          {spending.length === 0 && <tr><td class="muted" colSpan={2}>Nothing yet</td></tr>}
          <tr class="total"><td>Net</td><td class={inSum - outSum >= 0 ? 'pos' : 'neg'}>{inSum - outSum >= 0 ? '+' : '−'}{money(Math.abs(inSum - outSum))}</td></tr>
        </tbody>
      </table>
      <ProfitChart years={me.yearHistory} current={current} />
      <section class="panel-block">
        <h3>Latest money in and out <span class="muted">(drink sales not listed)</span></h3>
        {recent.length === 0 && <p class="small muted">Nothing yet.</p>}
        {recent.map((e) => (
          <div class="money-row" key={e.seq}>
            <span class={e.amount >= 0 ? 'pos' : 'neg'}>{e.amount >= 0 ? '+' : '−'}{money(Math.abs(e.amount))}</span>
            <span>{e.key}</span>
            <span class="muted small">{e.detail}</span>
          </div>
        ))}
      </section>
      <section class="panel-block" data-testid="decision-log">
        <h3>Recent decisions and what they did</h3>
        {w.prompts.outcomes.length === 0 && <p class="small muted">None yet.</p>}
        {[...w.prompts.outcomes].reverse().slice(0, 6).map((o) => (
          <div class="decision-row" key={o.seq}>
            <span>{o.title} → <b>{o.option}</b>{o.auto ? <span class="muted"> (time ran out)</span> : null}</span>
            <span class="small muted">{o.parts.join(' · ') || 'No immediate effect'}</span>
          </div>
        ))}
      </section>
      <p class="small">Cash {money(me.cash)}◉ · Profit trend {money(me.profitYear)}◉ a year · Company Value {money(me.cv)}</p>
      <section class="panel-block">
        <h3>Brewers' Lane moneylender</h3>
        <p class="small">Debt {money(me.debt)}◉ at {Math.round(c.economy.loanRatePerSeason * 100)}% a season · can borrow {money(cap)}◉ more</p>
        {[200, 500, 1000].map((n) => (
          <button key={n} class="btn btn-small" disabled={cap < n} onClick={() => ctrl.dispatch({ type: 'loan', amount: n })}>Borrow {n}</button>
        ))}
        {[200, 500].map((n) => (
          <button key={`r${n}`} class="btn btn-small" disabled={me.debt <= 0} onClick={() => ctrl.dispatch({ type: 'repay', amount: n })}>Repay {n}</button>
        ))}
      </section>
      <section class="panel-block">
        <h3>Grain source</h3>
        {([['cumstead', "John Cum's Cumstead", 'cheapest grain · depends on one farm'], ['mixed', 'Mixed', 'market price'], ['smallholders', 'Brandywine smallholders', '+20% grain · +3 quality on grain drinks']] as const).map(([id, name, note]) => (
          <label class="radio" key={id}>
            <input type="radio" name="grain" checked={me.grainSource === id} onChange={() => ctrl.dispatch({ type: 'grain', source: id })} /> {name} <span class="small muted">{note}</span>
          </label>
        ))}
      </section>
      <p class="small muted">Favor {Math.floor(me.favor)}⚓ · Spiritweed {me.spiritweed}</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- city (world map)

function CityDrawer({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // components with local state must subscribe themselves to redraw live
  const city = selectedCity.value;
  const [shipFrom, setShipFrom] = useState<string>('');
  const [shipDrink, setShipDrink] = useState<string>('');
  const [kegs, setKegs] = useState(2);
  const [insured, setInsured] = useState(false);
  if (!city) return null;
  const c = ctrl.content;
  const w = ctrl.world;
  const me = player(w);
  const def = cityOf(c, city);
  const mine = playerTaverns(w).find((t) => t.city === city);
  const check = canFound(w, c, city);
  const mods = modsFor(w, c, null, city);
  const taverns = Object.values(w.taverns).filter((t) => t.city === city && t.status !== 'closed');
  const total = taverns.reduce((s, t) => s + t.demand.rate, 0) || 1;
  const others = playerTaverns(w).filter((t) => t.city !== city && t.status !== 'building');
  const from = w.taverns[shipFrom] ?? others[0];
  const fromDrinks = from ? Object.entries(from.cellar).filter(([, n]) => n > 0).map(([d]) => d) : [];
  const drink = fromDrinks.includes(shipDrink) ? shipDrink : fromDrinks[0];
  return (
    <Shell title={def.name}>
      {mine ? (
        <div class="panel-block">
          <p><b>{mine.name}</b> · rep {Math.round(mine.rep)} · {mine.status}</p>
          <button class="btn btn-primary" disabled={mine.status === 'building'} onClick={() => { ctrl.dispatch({ type: 'focus', tavernId: mine.id }); ctrl.dispatch({ type: 'setView', view: 'floor' }); drawer.value = null; }}>
            Go to the floor
          </button>
        </div>
      ) : (
        <div class="panel-block">
          <p>Found a sister tavern here: {money(foundingCost(w, c, city))}◉ · {lotsFree(w, c, city)} lot(s) free · needs network rep {FOUND_MIN_REP} (yours {Math.round(networkRep(w))})</p>
          <button class="btn btn-primary" disabled={check !== 'ok'} onClick={() => { ctrl.dispatch({ type: 'found', city }); sound('buy'); }} data-testid="found">
            {check === 'ok' ? 'Found a tavern' : RESULT_TEXT[check]}
          </button>
          <p class="small muted">Rent {def.rentPerSeason}◉/season{def.annualFee ? ` · flat fee ${def.annualFee}◉/year` : ''}{def.salesTax ? ` · sales tax ${Math.round(def.salesTax * 100)}%` : ''}</p>
        </div>
      )}
      <section class="panel-block">
        <h3>Price board</h3>
        <table class="grid-table">
          <tbody>
            {c.ingredients.filter((i) => i.buyable).map((i) => {
              const p = ingredientPrice(w, c, city, i.id, me, mods);
              const base = i.basePrice * i.cityMult[city];
              const h = w.cities[city].history[i.id];
              const trend = h.length > 1 ? h[h.length - 1]! - h[Math.max(0, h.length - 6)]! : 0;
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{p.toFixed(1)}</td>
                  <td class={p > base * 1.1 ? 'up' : p < base * 0.9 ? 'down' : ''}>{trend > 0.02 ? '▲' : trend < -0.02 ? '▼' : '•'}</td>
                  <td><Spark values={h} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p class="small muted">Keg costs here: {me.unlocked.slice(0, 6).map((d) => `${drinkOf(c, d).name.split(' ')[0]} ${money(kegCost(w, c, d, city, me, null))}`).join(' · ')}</p>
      </section>
      <section class="panel-block">
        <h3>Taverns</h3>
        {taverns.map((t) => {
          const co = w.companies[t.companyId]!;
          return (
            <div class={`league-row ${co.isPlayer ? 'me' : ''} ${co.rival?.isArch ? 'arch' : ''}`} key={t.id}>
              <span class="lg-name" title={co.name}>{t.name}</span>
              <span class="small">rep {Math.round(t.rep)}</span>
              <span class="bar"><span class="fill" style={{ width: `${(t.demand.rate / total) * 100}%` }} /></span>
            </div>
          );
        })}
      </section>
      {mine && others.length > 0 && from && (
        <section class="panel-block">
          <h3>Ship kegs here</h3>
          <div class="ship-form">
            <select value={from.id} onChange={(e) => setShipFrom((e.target as HTMLSelectElement).value)}>
              {others.map((t) => <option key={t.id} value={t.id}>from {t.name}</option>)}
            </select>
            <select value={drink} onChange={(e) => setShipDrink((e.target as HTMLSelectElement).value)}>
              {fromDrinks.map((d) => <option key={d} value={d}>{drinkOf(c, d).name} ({from.cellar[d]})</option>)}
            </select>
            <input type="number" min="1" max="20" value={kegs} onInput={(e) => setKegs(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))} />
            <label class="check"><input type="checkbox" checked={insured} onChange={(e) => setInsured((e.target as HTMLInputElement).checked)} /> Voyage Wager ({Math.round(INSURANCE_RATE * 100)}%)</label>
            {drink && (
              <p class="small muted">
                {Math.round(travelTicks(c, from.city, city, upgradeCount(me, 'ofern-tunnels') > 0) / 20)}s at sea · loss risk {Math.round(lossChance(w, c, from.city, city) * 100)}%
              </p>
            )}
            <button class="btn btn-primary" disabled={!drink} onClick={() => { ctrl.dispatch({ type: 'ship', fromId: from.id, toId: mine.id, drinkId: drink!, kegs, insured }); sound('buy'); }}>
              Ship
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <svg class="spark" width="48" height="12" />;
  const min = Math.min(...values, 0.9);
  const max = Math.max(...values, 1.1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 46 + 1},${11 - ((v - min) / (max - min)) * 10}`).join(' ');
  return (
    <svg class="spark" width="48" height="12" viewBox="0 0 48 12">
      <polyline points={pts} fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  );
}

// ---------------------------------------------------------------- help

export function SoundSettings() {
  const [, bump] = useState(0);
  const v = audio.vol;
  const set = (k: 'master' | 'sfx' | 'music' | 'amb', x: number) => { v[k] = x; audio.applyVolumes(); bump((n) => n + 1); };
  const rows: Array<['master' | 'sfx' | 'music' | 'amb', string]> = [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['amb', 'Ambience']];
  return (
    <section class="panel-block">
      <h3>Sound</h3>
      <label class="check"><input type="checkbox" checked={v.muted} onChange={(e) => { v.muted = (e.target as HTMLInputElement).checked; audio.applyVolumes(); bump((n) => n + 1); }} /> Mute everything</label>
      {rows.map(([k, label]) => (
        <label class="slider" key={k}>
          <span>{label}</span>
          <input type="range" min={0} max={1} step={0.05} value={v[k]} onInput={(e) => set(k, Number((e.target as HTMLInputElement).value))} />
        </label>
      ))}
    </section>
  );
}

function HelpDrawer() {
  return (
    <Shell title="How to play">
      <section class="panel-block">
        <h3>Goal</h3>
        <p>Become the biggest tavern company in the Isles. <b>Monopoly</b>: reach twice the Company Value of the next-biggest company and you win on the spot. Otherwise, at the end of Year 463 the Trials' sponsor is the biggest company established in all four cities.</p>
      </section>
      <section class="panel-block">
        <h3>The screen</h3>
        <ul class="small">
          <li><b>Top:</b> year and season, day/night, run clock, Duckets, Company Value and rank, the monopoly bar, and your sister taverns.</li>
          <li><b>Left:</b> your tavern's taps, staff and local rivals, then <b>Word around the Isles</b>: news and intel on your competition. Without an informant you only hear gossip; hire a Drifter Informant (seasoned or master for more) to learn what rivals are doing, and get a report on them each season.</li>
          <li><b>Right:</b> every company's Company Value, yours highlighted; decisions waiting for you at the bottom.</li>
          <li><b>Decisions:</b> each choice lists its effects; the bar and seconds show the time left; the “if you wait” option happens if you don't choose. A receipt then shows what happened.</li>
          <li><b>Bottom of the board:</b> money in (blue) and out (orange) with the reason, and red banners that stay until a problem is fixed (money, dry taps). The Ledger (F) has the full account.</li>
        </ul>
      </section>
      <section class="panel-block">
        <h3>The floor</h3>
        <ul class="small">
          <li><b>Drag</b> a waiting patron onto a clean table (or click them, then the table).</li>
          <li><b>Click</b> an order bubble to pour and carry it yourself. Owner-served pours tip more.</li>
          <li><b>Click</b> a red <b>!</b> to break up a brawl, a <b>$</b> to catch a thief, a <b>★</b> to greet a VIP.</li>
          <li><b>Click</b> a tap to change its keg; <b>click</b> a messy table to clear it.</li>
          <li>Right-click cancels your queue. At Last Call, ring the bell (B).</li>
        </ul>
      </section>
      <section class="panel-block">
        <h3>Keys</h3>
        <p class="small"><kbd>Tab</kbd> floor/map · <kbd>P</kbd> pause · <kbd>1</kbd>–<kbd>3</kbd> answer the top card · <kbd>Q</kbd> serve the most urgent order · <kbd>W</kbd> seat the longest wait · <kbd>E</kbd> restock the emptiest tap · <kbd>C</kbd> clear a table · <kbd>B</kbd> bell · <kbd>S</kbd> staff · <kbd>M</kbd> menu · <kbd>U</kbd> build · <kbd>K</kbd> brew · <kbd>F</kbd> ledger · <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>4</kbd> switch tavern</p>
      </section>
      <SoundSettings />
    </Shell>
  );
}

export function Drawers({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  switch (drawer.value) {
    case 'staff': return <StaffDrawer ctrl={ctrl} />;
    case 'menu': return <MenuDrawer ctrl={ctrl} />;
    case 'upgrades': return <UpgradesDrawer ctrl={ctrl} />;
    case 'research': return <ResearchDrawer ctrl={ctrl} />;
    case 'finance': return <FinanceDrawer ctrl={ctrl} />;
    case 'city': return <CityDrawer ctrl={ctrl} />;
    case 'help': return <HelpDrawer />;
    default: return null;
  }
}

void idx;
void ({} as CityId);
