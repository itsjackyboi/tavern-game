import type { Category, CityId, Content } from '../content/schema.ts';
import { log } from './log.ts';
import {
  cityOf, drinkOf, fmt, idx, modsFor, playerTaverns, prefOf, servingPrice, drinkQuality, isOpenNow,
} from './lookup.ts';
import { lotsFree } from './network.ts';
import { chance, pick } from './rng.ts';
import { calNow } from './time.ts';
import type { Company, LogEntry, Tavern, World } from './types.ts';

// What you hear, and how precisely. Every line is something you can act on:
// what a rival did and what patrons prefer. With no informant you overhear the
// gist in your own taverns; green, seasoned and master informants add the
// prices, qualities and how long a rival can keep it up (strings/intel.json).

const price = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** One line from a kind at an informant level (0 none … 3 master). */
export function intelLine(w: World, c: Content, kind: string, tier: number, city: CityId | null, vars: Record<string, string>): void {
  const tiers = c.intel[kind];
  if (!tiers) return;
  const lvl = Math.max(0, Math.min(3, tier));
  const text = fmt(pick(w, 'log', tiers[lvl]!), { city: city ? cityOf(c, city).name : 'the Isles', ...vars }).replace(/\s+/g, ' ').trim();
  const kindTag: LogEntry['kind'] = lvl === 0 ? 'rumor' : 'intel';
  log(w, kindTag, text, city);
}

/** Facts about a rival tavern against yours in the same town, as template vars. */
export function rivalVars(w: World, c: Content, co: Company, rival: Tavern, category: Category | null, drinkId?: string): Record<string, string> {
  const mine = playerTaverns(w).find((t) => t.city === rival.city && t.status !== 'building' && t.status !== 'closed');
  const cat = category ?? (drinkId ? drinkOf(c, drinkId).category : null);
  const pickIn = (t: Tavern) => (drinkId && t.menu.some((m) => m.drinkId === drinkId) ? drinkId : t.menu.find((m) => cat && drinkOf(c, m.drinkId).category === cat)?.drinkId);
  const theirs = pickIn(rival);
  const yours = mine ? pickIn(mine) : undefined;
  const rm = modsFor(w, c, rival);
  const mm = mine ? modsFor(w, c, mine) : null;
  const cashSeasons = co.cash / Math.max(50, 110);
  const vars: Record<string, string> = {
    rival: rival.name,
    category: cat ?? 'drink',
    drink: drinkId ? drinkOf(c, drinkId).name : theirs ? drinkOf(c, theirs).name : 'a drink',
    theirPrice: theirs ? price(servingPrice(c, rival, theirs, rm)) : '?',
    theirQ: theirs ? String(Math.round(drinkQuality(w, c, rival, theirs, rm))) : '?',
    yours: mine && yours && mm ? `yours: ${price(servingPrice(c, mine, yours, mm))}◉` : 'you don’t pour any',
    yourQ: mine && yours && mm ? `yours: Q${Math.round(drinkQuality(w, c, mine, yours, mm))}` : 'you don’t pour any',
    cityNote: rival.city === 'aleforge' ? 'Aleforge weighs quality most.' : '',
    hold: cashSeasons < 1 ? 'only until the season ends' : cashSeasons < 3 ? 'for a season or two' : 'for a long while',
    lots: String(Math.max(0, lotsFree(w, c, rival.city))),
    cash: String(Math.max(0, Math.round(co.cash / 50) * 50)),
    tavern: mine?.name ?? 'your tavern',
    crowd: mine ? `your ${cityOf(c, rival.city).name} patrons` : `${cityOf(c, rival.city).name}'s drinkers`,
    Crowd: mine ? `Your ${cityOf(c, rival.city).name} patrons` : `${cityOf(c, rival.city).name}'s drinkers`,
    verdict: '',
  };
  if (mine && yours && theirs && mm) {
    const d = drinkQuality(w, c, rival, theirs, rm) - drinkQuality(w, c, mine, yours, mm);
    vars.verdict = d > 2 ? 'Theirs is better: improve yours (Build, Brew) or pour something else.' : d < -2 ? 'Yours is better: hold your quality and they’ll lose.' : 'About even: price will decide it.';
  }
  return vars;
}

/** Tier heard in a town: your informant level there, blurred by the rival's secrecy; null if you'd hear nothing. */
export function heardTier(w: World, city: CityId, level: number, secrecy: number): number | null {
  const mine = playerTaverns(w).some((t) => t.city === city && t.status !== 'building');
  if (level === 0 && !mine) return null;
  let tier = level;
  if (tier > 0 && chance(w, 'log', secrecy)) tier -= 1;
  // Without an informant you overhear only some of it.
  if (tier === 0 && !chance(w, 'log', 0.6)) return null;
  return tier;
}

const TALK_EVERY = 900; // ticks (45 s)
const TALK_COOLDOWN = 3600; // the same line about the same thing, at most every 3 minutes

/**
 * Patrons talking in your taverns: what they'd like more of, what's too dear,
 * whose drinks are better or cheaper. One line every 45 s at most.
 */
export function patronTalk(w: World, c: Content, level: (city: CityId) => number): void {
  if (w.tick % TALK_EVERY !== 1) return;
  const open = playerTaverns(w).filter((t) => t.status !== 'building' && isOpenNow(w, t));
  if (!open.length) return;
  const focus = open.find((t) => t.id === w.focus.tavernId);
  const t = focus && (open.length === 1 || chance(w, 'log', 0.6)) ? focus : pick(w, 'log', open);
  const seen = (w.events.talkSeen ??= {});
  const cands: Array<{ key: string; kind: string; tier: number; vars: Record<string, string> }> = [];
  const mods = modsFor(w, c, t);
  const night = calNow(w, c.time).isNight;
  const segs = Object.entries(t.demand.segRates).map(([id, r]) => [idx(c).seg.get(id)!, r] as const).filter(([s]) => !!s);
  const segTotal = segs.reduce((s, [, r]) => s + r, 0) || 1;
  const lvl = level(t.city);
  const base = { tavern: t.name };

  // Too dear.
  for (const m of t.menu.slice(0, t.taps)) {
    const priceMult = m.price * (1 + t.priceBias) * mods.price;
    const feel = segs.reduce((s, [seg, r]) => s + ((priceMult - 1) / seg.spend) * r, 0) / segTotal;
    if (feel >= 0.3) {
      const p = servingPrice(c, t, m.drinkId, mods);
      cands.push({ key: `dear:${t.id}:${m.drinkId}`, kind: 'talkDear', tier: 2, vars: { ...base, drink: drinkOf(c, m.drinkId).name, price: price(p), fair: price(p / (1 + (feel - 0.1))) } });
    }
  }
  // Walking out.
  const n = t.kpi.served + t.kpi.walkouts;
  if (n > 20 && t.kpi.walkouts / n > 0.2) cands.push({ key: `waits:${t.id}`, kind: 'talkWaits', tier: 2, vars: { ...base, walk: String(Math.round((t.kpi.walkouts / n) * 100)) } });
  // Asking for something you don't pour.
  const poured = new Set(t.menu.slice(0, t.taps).map((m) => drinkOf(c, m.drinkId).category));
  for (const [seg, r] of segs) {
    if (r / segTotal < 0.15) continue;
    const want = (['ale', 'stout', 'grog', 'tonic', 'spirits', 'cider', 'wine'] as Category[])
      .filter((cat) => !poured.has(cat) && prefOf(seg, cat, night) >= 0.5)
      .sort((a, b) => prefOf(seg, b, night) - prefOf(seg, a, night))[0];
    if (want) cands.push({ key: `want:${t.id}:${seg.id}:${want}`, kind: 'talkWanted', tier: lvl, vars: { ...base, segment: seg.name, category: want, share: String(Math.round((r / segTotal) * 100)) } });
  }
  // A rival's drink is better or cheaper.
  for (const rival of Object.values(w.taverns)) {
    if (rival.city !== t.city || rival.companyId === w.playerId || rival.status === 'closed' || rival.status === 'building') continue;
    const co = w.companies[rival.companyId]!;
    const rm = modsFor(w, c, rival);
    for (const m of t.menu.slice(0, t.taps)) {
      const cat = drinkOf(c, m.drinkId).category;
      const theirs = rival.menu.find((x) => drinkOf(c, x.drinkId).category === cat);
      if (!theirs) continue;
      const vars = rivalVars(w, c, co, rival, cat);
      if (drinkQuality(w, c, rival, theirs.drinkId, rm) >= drinkQuality(w, c, t, m.drinkId, mods) + 6) {
        cands.push({ key: `better:${t.id}:${rival.id}:${cat}`, kind: 'talkBetter', tier: lvl, vars: { ...vars, tavern: t.name } });
      }
      if (servingPrice(c, rival, theirs.drinkId, rm) <= servingPrice(c, t, m.drinkId, mods) * 0.88) {
        cands.push({ key: `cheaper:${t.id}:${rival.id}:${cat}`, kind: 'talkCheaper', tier: lvl, vars: { ...vars, tavern: t.name } });
      }
    }
  }
  const fresh = cands.filter((x) => w.tick - (seen[x.key] ?? -Infinity) >= TALK_COOLDOWN);
  if (!fresh.length) return;
  const say = pick(w, 'log', fresh);
  seen[say.key] = w.tick;
  if (Object.keys(seen).length > 200) for (const [k, at] of Object.entries(seen)) if (w.tick - at > TALK_COOLDOWN) delete seen[k];
  intelLine(w, c, say.kind, say.tier, t.city, say.vars);
}
