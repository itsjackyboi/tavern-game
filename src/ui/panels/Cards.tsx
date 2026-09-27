import type { GameController } from '../../app/controller.ts';
import { cityOf, idx, player } from '../../sim/lookup.ts';
import { effectLines } from '../../sim/effectText.ts';
import { promptTitle } from '../../sim/prompts.ts';
import type { ActivePrompt } from '../../sim/types.ts';
import { sound } from '../bus.ts';
import { townStyle } from '../townColors.ts';

// Prompt cards, shared by the decisions area (right) and the inbox pop-out (board).

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
  const secsLeft = Math.ceil(left / 20);
  return (
    <div class={`card tier-${def.tier} tension-${def.tension} ${tavern ? 'has-town' : ''}`} style={townStyle(tavern?.city ?? p.city)} data-testid="prompt-card">
      <div class="card-head">
        <span class="card-icon">{def.icon}</span>
        <span class="card-title">{promptTitle(c, p)}</span>
        {tavern && <span class="card-where town-chip" title={tavern.name}>{cityOf(c, tavern.city).name}</span>}
      </div>
      {def.line && <div class="card-line">{def.line.replace(/\{(\w+)\}/g, (_, k: string) => p.vars[k] ?? k)}</div>}
      <div class="countdown-row">
        <div class="countdown"><span style={{ width: `${frac * 100}%` }} class={frac < 0.3 ? 'hot' : ''} /></div>
        <span class={`secs ${frac < 0.3 ? 'hot' : ''}`}>{secsLeft}s</span>
      </div>
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
              <span class="opt-top">
                {hotkeys && <kbd title={`Shift+${i + 1}`}>⇧{i + 1}</kbd>}
                <span class="opt-label">{o.label}</span>
                {isDefault && <span class="opt-default">if you wait</span>}
                {o.cost !== undefined && <span class="cost">{o.cost}◉{o.favorCost ? ` or ${o.favorCost}⚓` : ''}</span>}
              </span>
              <span class="opt-effects">{[o.hint, ...effectLines(c, o.effects, true).filter((l) => !(o.cost !== undefined && l === `−${o.cost} Duckets`))].filter(Boolean).join(' · ') || (o.cost !== undefined ? 'Just the cost' : 'Nothing happens')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

