import type { GameController } from '../../app/controller.ts';
import type { InstitutionId } from '../../content/schema.ts';
import { useEffect, useRef } from 'preact/hooks';
import { companyTaverns, league } from '../../sim/company.ts';
import { establishedSisters } from '../../sim/network.ts';
import { uiFrame } from '../bus.ts';
import { money } from '../describe.ts';
import { Card, inboxItems, visibleCards } from './Cards.tsx';

function Inbox({ ctrl }: { ctrl: GameController }) {
  const items = inboxItems(ctrl);
  if (!items.length) return null;
  return (
    <section class="panel-block inbox">
      <h3>Inbox <span class="badge">{items.length}</span></h3>
      {items.map((p) => <Card key={p.uid} ctrl={ctrl} p={p} hotkeys={false} />)}
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
  // Keep your own row in view when your rank changes.
  useEffect(() => { meRow.current?.scrollIntoView({ block: 'nearest' }); }, [myRank]);
  return (
    <section class="panel-block league" data-testid="league">
      <h3>Company Value <span class="muted">{lg.length} companies</span></h3>
      {lg.map((co, i) => (
        <div class={`league-row ${co.isPlayer ? 'me' : ''} ${co.rival?.isArch ? 'arch' : ''}`} key={co.id} ref={co.isPlayer ? meRow : undefined}>
          <span class="lg-rank">{i + 1}</span>
          <span class="lg-name" title={co.name}>{co.isPlayer ? 'You' : co.name}</span>
          <span class="bar"><span class="fill" style={{ width: `${(Math.max(0, co.cv) / top) * 100}%` }} /></span>
          <span class="lg-cv">{money(co.cv)}</span>
        </div>
      ))}
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
    <section class="decisions" data-testid="cards">
      {cards.length > 0 && <h3>Decisions</h3>}
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
        <Inbox ctrl={ctrl} />
        <League ctrl={ctrl} />
        {world && <Ladder ctrl={ctrl} />}
        {world && <Institutions ctrl={ctrl} />}
      </div>
      <Decisions ctrl={ctrl} />
    </aside>
  );
}
