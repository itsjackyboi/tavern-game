import type { CityId, Content, EffectT } from '../content/schema.ts';
import { spend, track } from './economy/ledger.ts';
import { effectLine } from './effectText.ts';
import { syncFloor } from './floor/floor.ts';
import { log } from './log.ts';
import { addModifier, clamp, fmt, idx, managerOf, player, playerTaverns, staffAt } from './lookup.ts';
import { chance } from './rng.ts';
import { makeStaff } from './world.ts';
import type { ActivePrompt, Tavern, World } from './types.ts';

// Decision cards: tactical (seconds), strategic (the world-map inbox) and
// crises. Content defines options as EffectSpec lists; this file interprets them.

export interface PromptContext {
  tavernId?: string | null;
  city?: CityId | null;
  vars?: Record<string, string>;
  subjectId?: string | null;
  delaySeconds?: number;
  defaultOverride?: number | null;
}

export function spawnPrompt(w: World, c: Content, defId: string, ctx: PromptContext = {}): ActivePrompt | null {
  const def = idx(c).prompt.get(defId);
  if (!def) return null;
  if (ctx.delaySeconds && ctx.delaySeconds > 0) {
    w.prompts.pending.push({
      defId, atTick: w.tick + Math.round(ctx.delaySeconds * 20), tavernId: ctx.tavernId ?? null, city: ctx.city ?? null,
      vars: ctx.vars ?? {}, subjectId: ctx.subjectId ?? null,
    });
    return null;
  }
  // Don't stack duplicates for the same place.
  if (w.prompts.active.some((p) => p.defId === defId && p.tavernId === (ctx.tavernId ?? null))) return null;
  const t = ctx.tavernId ? w.taverns[ctx.tavernId] : undefined;
  const city = ctx.city ?? t?.city ?? null;
  const scale = def.tier === 'strategic' ? 1 : w.meta.timerScale;
  const p: ActivePrompt = {
    uid: w.prompts.nextUid++,
    defId,
    tavernId: ctx.tavernId ?? null,
    city,
    vars: { tavern: t?.name ?? '', city: city ? (c.cities.find((x) => x.id === city)?.name ?? '') : '', ...(ctx.vars ?? {}) },
    createdTick: w.tick,
    expiresTick: w.tick + Math.round(def.seconds * 20 * scale),
    subjectId: ctx.subjectId ?? null,
    defaultOverride: ctx.defaultOverride ?? null,
  };
  w.prompts.active.push(p);
  (w.events.promptSeen ??= {})[defId] = w.tick;
  return p;
}

export function promptTitle(c: Content, p: ActivePrompt): string {
  const def = idx(c).prompt.get(p.defId);
  return def ? fmt(def.title, p.vars) : p.defId;
}

function targetTavern(w: World, p: ActivePrompt): Tavern | null {
  if (p.tavernId && w.taverns[p.tavernId]) return w.taverns[p.tavernId]!;
  if (p.city) return playerTaverns(w).find((t) => t.city === p.city) ?? null;
  return w.taverns[w.focus.tavernId] ?? null;
}

/**
 * Applies a prompt's effects. `out`, when given, collects a plain-language line
 * for each effect that actually happened (chances already resolved), for the receipt.
 */
export function applyEffects(w: World, c: Content, effects: EffectT[], p: ActivePrompt, skipDuckets = false, out?: string[]): void {
  const me = player(w);
  const t = targetTavern(w, p);
  const title = promptTitle(c, p);
  for (const e of effects) {
    if (out && e.type !== 'chance' && !(e.type === 'duckets' && skipDuckets && e.amount < 0)) {
      const line = effectLine(c, e, false);
      if (line) out.push(line);
    }
    switch (e.type) {
      case 'duckets':
        if (skipDuckets && e.amount < 0) break;
        if (e.amount >= 0) { me.cash += e.amount; me.ledger.other -= e.amount; track(me, e.amount, 'Decisions', title); }
        else spend(me, -e.amount, 'other', 'Decisions', title);
        break;
      case 'favor':
        me.favor = Math.max(0, me.favor + e.amount);
        break;
      case 'rep': {
        const targets = e.scope === 'network' ? playerTaverns(w) : e.scope === 'city' ? playerTaverns(w).filter((x) => x.city === p.city) : t ? [t] : [];
        for (const x of targets) x.rep = clamp(x.rep + e.amount, 0, 100);
        break;
      }
      case 'standing':
        w.institutions[e.inst] = clamp(w.institutions[e.inst] + e.amount, -100, 100);
        break;
      case 'modifier': {
        const scope = e.scope ?? 'tavern';
        const target = scope === 'tavern' ? (t?.id ?? '') : scope === 'city' ? (p.city ?? t?.city ?? '') : scope === 'company' ? me.id : 'all';
        if (target) addModifier(w, c, e.id, e.seasons, scope, target);
        break;
      }
      case 'undercurrent': {
        const u = w.undercurrents;
        if (e.key === 'church' || e.key === 'pirateCulture') {
          const city = p.city ?? t?.city;
          if (city) {
            if (e.key === 'church') u.church[city] = clamp(u.church[city] + e.amount, 0, 100);
            else u.pirateCulture[city] = clamp(u.pirateCulture[city] + e.amount, 0, 1);
          }
        } else if (e.key === 'farmerTension') u.farmerTension = clamp(u.farmerTension + e.amount, 0, 100);
        else if (e.key === 'veilGoodwill') {
          u.veilGoodwill = clamp(u.veilGoodwill + e.amount, -100, 100);
          if (e.amount > 0) u.vowThisYear = true;
        } else u.consolidation = clamp(u.consolidation + e.amount, 0, 1);
        break;
      }
      case 'morale': {
        const pool = p.subjectId && w.staff[p.subjectId] ? [w.staff[p.subjectId]!] : t ? staffAt(w, t.id) : [];
        for (const s of pool) s.morale = clamp(s.morale + e.amount, 0, 1);
        break;
      }
      case 'stock':
        if (t) for (const [d, n] of Object.entries(t.cellar)) t.cellar[d] = Math.max(0, Math.round(n * (1 + e.fraction)));
        break;
      case 'spiritweed':
        me.spiritweed = Math.max(0, me.spiritweed + e.amount);
        break;
      case 'closeTavern':
        if (t) {
          t.closedUntil = Math.max(t.closedUntil, w.tick + Math.round(e.seconds * 20));
          log(w, 'alert', `${t.name} is shut for a while.`, t.city);
        }
        break;
      case 'loseStaff': {
        let s = p.subjectId ? w.staff[p.subjectId] : undefined;
        if (!s && t) {
          const pool = staffAt(w, t.id);
          s = e.best ? pool.sort((a, b) => b.competence - a.competence)[0] : pool[0];
        }
        if (s) {
          log(w, 'alert', `${s.name} has left.`, t?.city ?? null);
          const tv = w.taverns[s.tavernId];
          if (tv?.managerId === s.id) tv.managerId = null;
          delete w.staff[s.id];
          if (w.floor) syncFloor(w, c);
        }
        break;
      }
      case 'hire': {
        if (!t) break;
        if (staffAt(w, t.id).length >= c.staff.maxStaffPerTavern) {
          log(w, 'alert', `No room at ${t.name} for another hand: staff is full.`, t.city);
          break;
        }
        const s = makeStaff(w, c, { archetype: e.archetype, tier: e.tier, tavernId: t.id, stream: 'staff' });
        log(w, 'news', `${s.name} joins ${t.name}.`, t.city);
        if (w.floor?.tavernId === t.id) syncFloor(w, c);
        break;
      }
      case 'rivalCash':
      case 'rivalRep': {
        const city = p.city ?? t?.city;
        for (const rt of Object.values(w.taverns)) {
          if (rt.status === 'closed' || rt.companyId === me.id || (city && rt.city !== city)) continue;
          if (e.type === 'rivalRep') rt.rep = clamp(rt.rep + e.amount, 0, 100);
          else w.companies[rt.companyId]!.cash += e.amount;
        }
        break;
      }
      case 'prompt':
        spawnPrompt(w, c, e.id, { tavernId: p.tavernId, city: p.city, vars: p.vars, delaySeconds: e.delaySeconds });
        break;
      case 'flag':
        w.events.flags[e.id] = e.value;
        break;
      case 'chance':
        applyEffects(w, c, chance(w, 'events', e.p) ? e.then : (e.else ?? []), p, skipDuckets, out);
        break;
    }
  }
}

export type AnswerResult = 'ok' | 'cash' | 'gone';

/** Resolves a prompt with the player's choice. Options with a Duckets cost need the cash (or Favor in Shanty Town). */
export function answerPrompt(w: World, c: Content, uid: number, option: number, viaTimeout = false): AnswerResult {
  const p = w.prompts.active.find((x) => x.uid === uid);
  if (!p) return 'gone';
  const def = idx(c).prompt.get(p.defId)!;
  const opt = def.options[option];
  if (!opt) return 'gone';
  const me = player(w);
  let payWithFavor = false;
  if (opt.cost && me.cash < opt.cost) {
    if (opt.favorCost && me.favor >= opt.favorCost) payWithFavor = true;
    else if (!viaTimeout) return 'cash';
  } else if (opt.favorCost && me.favor >= opt.favorCost && me.cash < (opt.cost ?? 0) * 2) {
    payWithFavor = true;
  }
  w.prompts.active = w.prompts.active.filter((x) => x.uid !== uid);
  const parts: string[] = [];
  if (payWithFavor) {
    me.favor -= opt.favorCost!;
    parts.push(`Paid ${opt.favorCost} Favor instead of Duckets`);
  }
  if (opt.hint) parts.push(opt.hint);
  applyEffects(w, c, opt.effects, p, payWithFavor, parts);
  w.prompts.outcomes.push({ seq: ++w.prompts.outcomeSeq, title: promptTitle(c, p), option: opt.label, auto: viaTimeout, parts, city: (p.tavernId ? w.taverns[p.tavernId]?.city : null) ?? p.city ?? null });
  if (w.prompts.outcomes.length > 12) w.prompts.outcomes.shift();
  if (viaTimeout) w.prompts.missed += 1;
  else w.prompts.answered += 1;
  // Answering a sister's inbox item counts as checking in on it.
  if (p.tavernId && w.taverns[p.tavernId] && !viaTimeout) w.taverns[p.tavernId]!.attention = Math.min(1, w.taverns[p.tavernId]!.attention + 0.35);
  return 'ok';
}

/** The option a prompt resolves to if ignored: a manager's own call for proposals, else the content default. */
export function defaultOptionFor(w: World, c: Content, p: ActivePrompt): number {
  if (p.defaultOverride !== null) return p.defaultOverride;
  return idx(c).prompt.get(p.defId)!.defaultOption;
}

/** 1 Hz: pending prompts fire; expired prompts auto-resolve to their default. */
export function stepPrompts(w: World, c: Content): void {
  if (w.prompts.pending.length) {
    const due = w.prompts.pending.filter((x) => x.atTick <= w.tick);
    w.prompts.pending = w.prompts.pending.filter((x) => x.atTick > w.tick);
    for (const d of due) spawnPrompt(w, c, d.defId, { tavernId: d.tavernId, city: d.city, vars: d.vars, subjectId: d.subjectId });
  }
  for (const p of [...w.prompts.active]) {
    if (p.expiresTick > w.tick) continue;
    answerPrompt(w, c, p.uid, defaultOptionFor(w, c, p), true);
  }
  // Keep the list readable: strategic items never pile up beyond 6.
  const strategic = w.prompts.active.filter((p) => idx(c).prompt.get(p.defId)?.tier === 'strategic');
  if (strategic.length > 6) {
    const oldest = strategic.sort((a, b) => a.createdTick - b.createdTick)[0]!;
    answerPrompt(w, c, oldest.uid, defaultOptionFor(w, c, oldest), true);
  }
}

/** Manager proposals: the manager's own default depends on competence (good managers approve good ideas). */
export function managerProposal(w: World, c: Content, t: Tavern, defId: string): void {
  const mgr = managerOf(w, t);
  const good = (mgr?.competence ?? 0.4) >= 0.62;
  spawnPrompt(w, c, defId, { tavernId: t.id, defaultOverride: good ? 0 : 1 });
}
