import type { GameController } from '../../app/controller.ts';
import { idx, player } from '../../sim/lookup.ts';
import { promptTitle } from '../../sim/prompts.ts';
import type { ActivePrompt } from '../../sim/types.ts';
import { sound } from '../bus.ts';

// Prompt cards, shared by the decisions area (left) and the manager inbox (right).

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

export function Card({ ctrl, p, hotkeys }: { ctrl: GameController; p: ActivePrompt; hotkeys: boolean }) {
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

