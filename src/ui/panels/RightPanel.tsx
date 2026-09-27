import type { GameController } from '../../app/controller.ts';
import type { InstitutionId } from '../../content/schema.ts';
import { useEffect, useRef, useState } from 'preact/hooks';
import { companyTaverns, league } from '../../sim/company.ts';
import { playerTaverns } from '../../sim/lookup.ts';
import { establishedSisters, repTrend } from '../../sim/network.ts';
import { drawer, sound, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { townStyle } from '../townColors.ts';
import { STATUS_LABEL, openReport, seasonNet, staffIcons, tavernIssues, townName } from '../tavernHealth.ts';
import { Card, inboxItems, visibleCards } from './Cards.tsx';

/**
 * The inbox pops out of the bottom-right corner of the board: rarer but more
 * important than decisions, so it gets a spot of its own. It opens by itself
 * when a new request arrives, folds back to a tab, and is gone when empty.
 */
export function InboxPopout({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // has its own hooks, so it must subscribe itself to redraw live
  const items = inboxItems(ctrl);
  const [open, setOpen] = useState(true);
  const seen = useRef(new Set<number>());
  const newest = items.reduce((m, p) => Math.max(m, p.uid), 0);
  useEffect(() => {
    const fresh = items.some((p) => !seen.current.has(p.uid));
    for (const p of items) seen.current.add(p.uid);
    if (fresh) {
      setOpen(true);
      sound('vip');
    }
  }, [newest, items.length]);
  if (!items.length) return null;
  // With a drawer open the inbox folds to its tab, so it never covers the drawer.
  if (!open || drawer.value) {
    return (
      <button class="inbox-tab" onClick={() => { drawer.value = null; setOpen(true); }} data-testid="inbox-tab">
        📨 Inbox <span class="badge">{items.length}</span>
      </button>
    );
  }
  return (
    <section class="inbox-pop" data-testid="inbox" aria-label="Inbox">
      <div class="inbox-pop-head">
        <b>📨 Inbox</b> <span class="badge">{items.length}</span>
        <span class="muted small">requests that need you</span>
        <button class="btn btn-tiny" onClick={() => setOpen(false)} aria-label="Fold the inbox away" data-testid="inbox-fold">▾</button>
      </div>
      <div class="inbox-pop-body">
        {items.map((p) => <Card key={p.uid} ctrl={ctrl} p={p} hotkeys={false} />)}
      </div>
    </section>
  );
}

const INST: Record<InstitutionId, string> = {
  church: 'Church of Patmos', windsunk: 'Windsunk Council', rotoMarket: 'Roto market', cumstead: 'The Cumstead', cityhall: 'Aleforge City Hall',
};

/** Every company still trading, the player's always included. */
function League({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value; // has its own hooks, so it must subscribe itself to redraw live
  const w = ctrl.world;
  const lg = league(w).filter((co) => co.isPlayer || companyTaverns(w, co).some((t) => t.status !== 'closed'));
  const top = Math.max(1, lg[0]?.cv ?? 1);
  const myRank = lg.findIndex((co) => co.isPlayer);
  const meRow = useRef<HTMLDivElement>(null);
  // Keep your own row in view when your rank or the panel's size changes (not
  // every frame, so you can still scroll the list yourself).
  const nTaverns = playerTaverns(w).length;
  useEffect(() => {
    const show = () => {
      const row = meRow.current;
      const box = row?.closest('.right-scroll');
      if (!row || !box) return;
      const r = row.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const head = box.querySelector('.league h3')?.getBoundingClientRect().height ?? 0;
      if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      else if (r.top < b.top + head) box.scrollTop -= b.top + head - r.top;
    };
    show();
    window.addEventListener('resize', show);
    return () => window.removeEventListener('resize', show);
  }, [myRank, nTaverns]);
  return (
    <section class="panel-block league" data-testid="league">
      <h3>Company Value <span class="muted">{lg.length} companies</span></h3>
      <div class="league-rows">
      {lg.map((co, i) => (
        <div class={`league-row ${co.isPlayer ? 'me' : ''} ${co.rival?.isArch ? 'arch' : ''}`} key={co.id} ref={co.isPlayer ? meRow : undefined}>
          <span class="lg-rank">{i + 1}</span>
          <span class="lg-name" title={co.name}>{co.isPlayer ? 'You' : co.name}</span>
          <span class="bar"><span class="fill" style={{ width: `${(Math.max(0, co.cv) / top) * 100}%` }} /></span>
          <span class="lg-cv">{money(co.cv)}</span>
        </div>
      ))}
      </div>
    </section>
  );
}

/** Every tavern you run: status, reputation, profit, staff, and what's wrong. Click for its report. */
function YourTaverns({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  const c = ctrl.content;
  const ts = playerTaverns(w).filter((t) => t.status !== 'closed');
  return (
    <section class="panel-block your-taverns" data-testid="your-taverns">
      <h3>Your taverns <span class="muted">click for a report</span></h3>
      {ts.map((t, i) => {
        const issues = tavernIssues(w, c, t);
        const problem = issues.some((x) => x.level === 'problem');
        const here = w.focus.tavernId === t.id;
        const net = seasonNet(t);
        const trend = repTrend(t);
        const top = issues[0];
        const building = t.status === 'building';
        return (
          <div
            key={t.id}
            class={`yt-row ${here ? 'here' : ''} ${problem ? 'problem' : issues.length ? 'watch' : ''}`}
            style={townStyle(t.city)}
            role="button"
            tabIndex={0}
            onClick={() => openReport(t)}
            onKeyDown={(e) => { if (e.key === 'Enter') openReport(t); }}
            title={issues.map((x) => `${x.text}: ${x.fix}`).join('\n') || `${t.name}: all well`}
            data-testid="yt-row"
          >
            <div class="yt-line">
              <span class="yt-name">{townName(c, t)}{here && <span class="yt-here"> · here</span>}</span>
              <span class={`yt-status st-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              {!building && <span class="yt-rep" title="Reputation (trend over the last minute)">★{Math.round(t.rep)}<span class={trend >= 0.3 ? 'up' : trend <= -0.3 ? 'down' : 'flat'}>{trend >= 0.3 ? '▲' : trend <= -0.3 ? '▼' : ''}</span></span>}
              {!building && <span class={`yt-profit ${net >= 0 ? 'up' : 'down'}`} title="Profit this season so far (rent and wages are paid at season end)">{net >= 0 ? '+' : ''}{money(net)}◉</span>}
              {!here && !building && (
                <button class="btn btn-tiny yt-go" title={`Go there (key ${i + 1})`} onClick={(e) => { e.stopPropagation(); ctrl.dispatch({ type: 'focus', tavernId: t.id }); }}>⇥</button>
              )}
            </div>
            <div class="yt-line yt-sub">
              <span class="yt-staff" title="Staff (✎ manager)">{building ? '' : staffIcons(w, t) || 'no staff'}</span>
              {building && <span class="yt-issue">opens in {Math.max(0, Math.ceil((t.openTick - w.tick) / 20))}s</span>}
              {top && <span class={`yt-issue ${top.level}`}>{top.level === 'problem' ? '⚠ ' : ''}{top.text}{issues.length > 1 ? ` (+${issues.length - 1})` : ''}</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Ladder({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  const s = establishedSisters(w);
  const r = w.run.splits;
  const steps: Array<[string, boolean]> = [
    ['Taproom', true],
    ['Alehouse Chain (1 sister)', s >= 1 || r.firstSister !== null],
    ['Two-City Concern', s >= 2],
    ['Four-City Company', s >= 3 || r.thirdSister !== null],
    ['#1 in Company Value', r.firstNo1 !== null],
    ['Monopoly (2× the next)', r.monopoly !== null],
  ];
  return (
    <section class="panel-block">
      <h3>Milestones</h3>
      {steps.map(([name, done]) => (
        <div class={`ladder ${done ? 'done' : ''}`} key={name}>{done ? '✔' : '○'} {name}</div>
      ))}
    </section>
  );
}

function Institutions({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  return (
    <section class="panel-block">
      <h3>Standing</h3>
      {(Object.keys(INST) as InstitutionId[]).map((k) => {
        const v = w.institutions[k];
        return (
          <div class="inst-row" key={k} title={`${INST[k]}: ${Math.round(v)}`}>
            <span class="inst-name">{INST[k]}</span>
            <span class="bar center"><span class="fill" style={{ left: v < 0 ? `${50 + v / 2}%` : '50%', width: `${Math.abs(v) / 2}%`, background: v < 0 ? '#d9534f' : '#6fd36f' }} /></span>
          </div>
        );
      })}
    </section>
  );
}

/** Decision cards, pinned to the bottom-right so nothing else jumps around. */
function Decisions({ ctrl }: { ctrl: GameController }) {
  const all = visibleCards(ctrl);
  const cards = all.slice(0, 2);
  const extra = all.length - cards.length;
  return (
    <section class={`decisions ${cards.length ? 'has-cards' : ''}`} data-testid="cards">
      {cards.length > 0 && <h3>Decisions</h3>}
      {cards.length === 0 && <p class="small muted decisions-empty">Decisions appear here.</p>}
      {cards.map((p, i) => <Card key={p.uid} ctrl={ctrl} p={p} hotkeys={i === 0} />)}
      {extra > 0 && <div class="more-cards">+{extra} more waiting</div>}
    </section>
  );
}

export function RightPanel({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const world = ctrl.world.focus.view === 'world';
  return (
    <aside class="right-panel">
      <div class="right-scroll">
        <League ctrl={ctrl} />
        {world && <Ladder ctrl={ctrl} />}
        {world && <Institutions ctrl={ctrl} />}
      </div>
      <YourTaverns ctrl={ctrl} />
      <Decisions ctrl={ctrl} />
    </aside>
  );
}
