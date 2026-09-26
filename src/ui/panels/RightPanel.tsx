import type { GameController } from '../../app/controller.ts';
import type { InstitutionId } from '../../content/schema.ts';
import { league } from '../../sim/company.ts';
import { idx, player } from '../../sim/lookup.ts';
import { establishedSisters } from '../../sim/network.ts';
import { promptTitle } from '../../sim/prompts.ts';
import type { ActivePrompt } from '../../sim/types.ts';
import { sound, uiFrame } from '../bus.ts';
import { money } from '../describe.ts';

export function visibleCards(ctrl: GameController): ActivePrompt[] {
  const c = ctrl.content;
  return ctrl.world.prompts.active
    .filter((p) => idx(c).prompt.get(p.defId)?.tier !== 'strategic')
    .sort((a, b) => a.expiresTick - b.expiresTick);
}

export function inboxItems(ctrl: GameController): ActivePrompt[] {
  const c = ctrl.content;
  return ctrl.world.prompts.active.filter((p) => idx(c).prompt.get(p.defId)?.tier === 'strategic').sort((a, b) => a.expiresTick - b.expiresTick);
}

function Card({ ctrl, p, hotkeys }: { ctrl: GameController; p: ActivePrompt; hotkeys: boolean }) {
  const c = ctrl.content;
  const def = idx(c).prompt.get(p.defId)!;
  const w = ctrl.world;
  const total = p.expiresTick - p.createdTick;
  const left = Math.max(0, p.expiresTick - w.tick);
  const frac = total > 0 ? left / total : 0;
  const me = player(w);
  const tavern = p.tavernId ? w.taverns[p.tavernId] : null;
  return (
    <div class={`card tier-${def.tier} tension-${def.tension}`} data-testid="prompt-card">
      <div class="card-head">
        <span class="card-icon">{def.icon}</span>
        <span class="card-title">{promptTitle(c, p)}</span>
        {tavern && tavern.id !== w.focus.tavernId && <span class="card-where">{tavern.name}</span>}
      </div>
      {def.line && <div class="card-line">{def.line.replace(/\{(\w+)\}/g, (_, k: string) => p.vars[k] ?? k)}</div>}
      <div class="countdown"><span style={{ width: `${frac * 100}%` }} class={frac < 0.3 ? 'hot' : ''} /></div>
      <div class="card-options">
        {def.options.map((o, i) => {
          const isDefault = (p.defaultOverride ?? def.defaultOption) === i;
          const short = o.cost !== undefined && me.cash < o.cost && !(o.favorCost && me.favor >= o.favorCost);
          return (
            <button
              key={i}
              class={`btn btn-option ${isDefault ? 'is-default' : ''}`}
              disabled={short}
              title={isDefault ? 'Happens if you do nothing' : undefined}
              onClick={() => { ctrl.dispatch({ type: 'answer', uid: p.uid, option: i }); sound('confirm'); }}
            >
              {hotkeys && <kbd>{i + 1}</kbd>}
              {o.label}
              {o.cost !== undefined && <span class="cost">{o.cost}◉{o.favorCost ? `/${o.favorCost}⚓` : ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function League({ ctrl }: { ctrl: GameController }) {
  const w = ctrl.world;
  const lg = league(w).slice(0, 7);
  const top = Math.max(1, lg[0]?.cv ?? 1);
  return (
    <section class="panel-block">
      <h3>Company Value</h3>
      {lg.map((co, i) => (
        <div class={`league-row ${co.isPlayer ? 'me' : ''} ${co.rival?.isArch ? 'arch' : ''}`} key={co.id}>
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

export function RightPanel({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const cards = visibleCards(ctrl).slice(0, 2);
  const extra = visibleCards(ctrl).length - cards.length;
  const world = ctrl.world.focus.view === 'world';
  return (
    <aside class="right-panel">
      <section class="cards" data-testid="cards">
        {cards.map((p, i) => <Card key={p.uid} ctrl={ctrl} p={p} hotkeys={i === 0} />)}
        {extra > 0 && <div class="more-cards">+{extra} more waiting</div>}
      </section>
      <Inbox ctrl={ctrl} />
      {world && <League ctrl={ctrl} />}
      {world && <Ladder ctrl={ctrl} />}
      {world && <Institutions ctrl={ctrl} />}
      {!world && <League ctrl={ctrl} />}
    </aside>
  );
}
