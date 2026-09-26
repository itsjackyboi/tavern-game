import type { Content, EffectT, InstitutionId, ModifierDef } from '../content/schema.ts';
import { idx } from './lookup.ts';

// Plain-language lines for what a decision does. Used twice: to preview each
// option on a card, and for the receipt once a choice has been made.

export const INSTITUTION_NAME: Record<InstitutionId, string> = {
  church: 'Church of Patmos', windsunk: 'Windsunk Council', rotoMarket: 'Roto market', cumstead: 'The Cumstead', cityhall: 'Aleforge City Hall',
};

const UNDERCURRENT: Record<string, string> = {
  church: 'Church influence', farmerTension: 'Farmers’ unrest', veilGoodwill: 'Veilwalker goodwill', pirateCulture: 'Pirate influence', consolidation: 'Rivals merging',
};

const signed = (n: number, digits = 0) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;
const mult = (label: string, v: number | undefined) => (v === undefined || v === 1 ? null : `${label} ${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`);

/** A short summary of a modifier's stats, e.g. "patrons +60%, prices −25%". */
export function modifierSummary(m: ModifierDef): string {
  const parts = [
    mult('patrons', m.arrivals), mult('prices', m.price), mult('brawls', m.brawl), mult('theft', m.theft),
    m.quality ? `quality ${signed(m.quality)}` : null, mult('keg cost', m.kegCost), mult('reputation gains', m.repGain),
    mult('reputation swings', m.repSwing), mult('spoilage', m.spoilage === 0 ? undefined : m.spoilage),
    m.shippingLoss ? `shipping losses ${signed(m.shippingLoss * 100)}%` : null, m.tithe ? `tithe ${signed(m.tithe * 100)}%` : null,
    m.tips ? `tips +${Math.round(m.tips * 100)}%` : null, mult('grain prices', m.grainPrice),
    m.categoryBan?.length ? `no ${m.categoryBan.join('/')} sales` : null, m.tabooBlocked ? 'taboo goods blocked' : null,
  ].filter(Boolean);
  return parts.join(', ');
}

/** One line per effect. `preview` phrases chances as odds; otherwise the chance was already resolved by the caller. */
export function effectLine(c: Content, e: EffectT, preview = true): string | null {
  switch (e.type) {
    case 'duckets': return `${signed(e.amount)} Duckets`;
    case 'favor': return `${signed(e.amount)} Favor`;
    case 'rep': return `Reputation ${signed(e.amount)}${e.scope === 'network' ? ' (all your taverns)' : e.scope === 'city' ? ' (this city)' : ''}`;
    case 'standing': return `${INSTITUTION_NAME[e.inst]} standing ${signed(e.amount)}`;
    case 'modifier': {
      const m = idx(c).mod.get(e.id);
      if (!m) return null;
      const what = modifierSummary(m);
      return `${m.name} for ${e.seasons} season${e.seasons === 1 ? '' : 's'}${what ? ` (${what})` : ''}`;
    }
    case 'undercurrent': return `${UNDERCURRENT[e.key] ?? e.key} ${e.amount >= 0 ? 'rises' : 'falls'}`;
    case 'morale': return `Staff morale ${signed(e.amount * 100)}`;
    case 'stock': return `Cellar kegs ${signed(e.fraction * 100)}%`;
    case 'spiritweed': return `${signed(e.amount)} Spiritweed`;
    case 'closeTavern': return `Tavern shut for ${Math.round(e.seconds)}s`;
    case 'loseStaff': return e.best ? 'Your best worker leaves' : 'A worker leaves';
    case 'rivalCash': return `Rivals’ Duckets ${signed(e.amount)}`;
    case 'rivalRep': return `Rivals’ reputation ${signed(e.amount)}`;
    case 'prompt': return preview ? 'Something may follow' : null;
    case 'flag': return null;
    case 'chance': {
      if (!preview) return null;
      const yes = effectLines(c, e.then, true).join(', ') || 'nothing';
      const no = effectLines(c, e.else ?? [], true).join(', ') || 'nothing';
      return `${Math.round(e.p * 100)}%: ${yes}; otherwise ${no}`;
    }
  }
}

export function effectLines(c: Content, effects: EffectT[], preview = true): string[] {
  return effects.map((e) => effectLine(c, e, preview)).filter((x): x is string => !!x);
}
