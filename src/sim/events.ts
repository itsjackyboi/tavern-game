import { CITY_IDS, type CityId, type Content, type IngredientId } from '../content/schema.ts';
import { priceShock } from './economy/market.ts';
import { log, rumor } from './log.ts';
import { addModifier, cityOf, idx, player, playerTaverns, seasonTicks } from './lookup.ts';
import { applyEffects, managerProposal, spawnPrompt } from './prompts.ts';
import { chance, pick, rand } from './rng.ts';
import type { Calendar } from './time.ts';
import type { Staff, Tavern, World } from './types.ts';

// Scheduled and random events on the season clock (docs/PLAN.md §2.9).

function rivalNameIn(w: World, city: CityId | null): string {
  const rivals = Object.values(w.taverns).filter((t) => t.status !== 'closed' && t.companyId !== w.playerId && (!city || t.city === city));
  return rivals.length ? pick(w, 'events', rivals).name : 'A rival';
}

function lookup(w: World, key: string): number {
  const [a, b] = key.split('.');
  const u = w.undercurrents;
  switch (a) {
    case 'church': return u.church[b as CityId] ?? 0;
    case 'pirateCulture': return u.pirateCulture[b as CityId] ?? 0;
    case 'standing': return w.institutions[b as keyof World['institutions']] ?? 0;
    case 'flag': return w.events.flags[b ?? ''] ?? 0;
    case 'farmerTension': return u.farmerTension;
    case 'veilGoodwill': return u.veilGoodwill;
    default: return 0;
  }
}

/** Probability a crisis fires this season. Exported for the Monte Carlo test. */
export function crisisHazard(c: Content, shift: number, lastCrisisShift: number, fired: number): number {
  const ev = c.events;
  if (fired >= ev.crisisMaxPerRun) return 0;
  const since = Math.max(ev.crisisGraceSeasons, lastCrisisShift + ev.crisisGapSeasons);
  if (shift < since) return 0;
  const eligibleFor = shift - since;
  return Math.min(0.6, ev.crisisBaseHazard * (1 + (eligibleFor / 6) ** 2) * 0.85 ** fired);
}

function rollCrisis(w: World, c: Content, shift: number): void {
  const ev = w.events;
  const h = crisisHazard(c, shift, ev.lastCrisisShift, ev.crisesFired.length);
  if (h <= 0 || !chance(w, 'crisis', h)) return;
  const mine = new Set(playerTaverns(w).map((t) => t.city));
  const pool = c.crises
    .filter((cr) => !ev.crisesFired.includes(cr.id))
    .filter((cr) => !cr.cities.length || cr.cities.some((x) => mine.has(x)))
    .map((cr) => {
      let wt = cr.weight;
      for (const b of cr.boosts) {
        const v = lookup(w, b.key);
        if ((b.above !== undefined && v > b.above) || (b.below !== undefined && v < b.below)) wt *= b.mult;
      }
      return [cr, wt] as const;
    });
  if (!pool.length) return;
  const total = pool.reduce((s, [, wt]) => s + wt, 0);
  let r = rand(w, 'crisis') * total;
  let pickCr = pool[0]![0];
  for (const [cr, wt] of pool) {
    r -= wt;
    if (r <= 0) { pickCr = cr; break; }
  }
  ev.crisesFired.push(pickCr.id);
  ev.lastCrisisShift = shift;
  const city = pickCr.cities.find((x) => mine.has(x)) ?? null;
  const tavern = city ? playerTaverns(w).find((t) => t.city === city) : playerTaverns(w)[0];
  const scope = idx(c).prompt.get(pickCr.prompt)?.scope;
  const pseudo = {
    uid: 0, defId: pickCr.prompt, tavernId: tavern?.id ?? null, city: city ?? tavern?.city ?? null,
    vars: {}, createdTick: w.tick, expiresTick: w.tick, subjectId: null, defaultOverride: null,
  };
  applyEffects(w, c, pickCr.onStart, pseudo);
  if (pickCr.id === 'veil-turns') {
    const good = w.undercurrents.veilGoodwill >= 0;
    addModifier(w, c, good ? 'veil-blessing' : 'veil-curse', 3, 'company', w.playerId);
  }
  if (pickCr.id === 'cumstead-blight') priceShock(w, 'aleforge', 'barley', 1.4);
  const staff = tavern ? bestStaff(w, tavern) : null;
  spawnPrompt(w, c, pickCr.prompt, {
    tavernId: scope === 'isles' ? null : (tavern?.id ?? null),
    city: city ?? tavern?.city ?? null,
    vars: { rival: rivalNameIn(w, tavern?.city ?? null), staff: staff?.name ?? 'your best hand' },
    subjectId: staff?.id ?? null,
  });
  log(w, 'event', `Crisis: ${idx(c).prompt.get(pickCr.prompt)?.title.replace(/\{\w+\}/g, '').trim()}`, city);
}

function bestStaff(w: World, t: Tavern): Staff | null {
  return Object.values(w.staff).filter((s) => s.tavernId === t.id && s.role !== 'manage').sort((a, b) => b.competence - a.competence)[0] ?? null;
}

function featureHoliday(w: World, c: Content, cal: Calendar): void {
  const mine = new Set(playerTaverns(w).map((t) => t.city));
  const options = c.holidays.filter((h) => h.season === cal.segment && (!h.cities.length || h.cities.some((x) => mine.has(x))));
  if (!options.length || (cal.segment !== 'holidayKeg' && !chance(w, 'events', 0.55))) {
    w.events.holiday = null;
    return;
  }
  const h = pick(w, 'events', options);
  const len = cal.segment === 'holidayKeg' ? c.time.holidayKegTicks / seasonTicks(c) : 1;
  if (h.cities.length) for (const city of h.cities) addModifier(w, c, h.modifier, len, 'city', city);
  else addModifier(w, c, h.modifier, len, 'global', 'all');
  w.events.holiday = { id: h.id, shift: cal.shiftIndex };
  log(w, 'news', `${h.name}!`, h.cities[0] ?? null);
}

function eraEvents(w: World, c: Content, cal: Calendar): void {
  const fired = w.events.erasFired;
  const once = (id: string, fn: () => void) => {
    if (!fired.includes(id)) {
      fired.push(id);
      fn();
    }
  };
  const act2 = c.rivalTuning.act2Year;
  const act3 = c.rivalTuning.act3Year;
  if (cal.year === act2 - 1 && cal.segment === 'holidayKeg') once('election', () => spawnPrompt(w, c, 'election', { city: 'aleforge' }));
  if (cal.year >= act2) once('thatcher', () => log(w, 'news', 'Thomas Thatcher Sr. is the new Mayor of Aleforge.', 'aleforge'));
  if (cal.year >= act3) {
    once('trials', () => {
      spawnPrompt(w, c, 'trials-announced', {});
      addModifier(w, c, 'trials-fever', (c.time.endYear - act3 + 1) * 3, 'city', 'aleforge');
      log(w, 'news', 'Thatcher Sr. will restore the Drunken Trials. A sponsor will be chosen in 463.', 'aleforge');
    });
  }
}

/** Called at the start of every season-shift and of the Holiday Keg. */
export function onSegmentStart(w: World, c: Content, cal: Calendar): void {
  const me = player(w);
  const shift = cal.shiftIndex;
  featureHoliday(w, c, cal);
  eraEvents(w, c, cal);
  if (cal.segment === 'holidayKeg') return;
  rollCrisis(w, c, shift);

  // Regional supply events move prices (and Roto echoes them).
  if (chance(w, 'market', 0.45)) {
    const city = pick(w, 'market', CITY_IDS);
    const ing = pick(w, 'market', ['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit'] as IngredientId[]);
    const up = chance(w, 'market', 0.6);
    priceShock(w, city, ing, up ? 1.35 : 0.75);
    const name = c.ingredients.find((i) => i.id === ing)!.name;
    rumor(w, c, up ? 'priceSpike' : 'priceDrop', city, { ingredient: name });
  }
  if (chance(w, 'log', 0.35)) rumor(w, c, chance(w, 'log', 0.3) ? 'prophecy' : 'general', null);

  const ev = c.events;
  for (const t of playerTaverns(w)) {
    if (t.status === 'building') continue;
    if (t.city === 'shanty' && shift >= w.cities.shanty.tributeDueShift) {
      w.cities.shanty.tributeDueShift = shift + ev.tributeEverySeasons;
      spawnPrompt(w, c, 'windsunk-tribute', { tavernId: t.id, delaySeconds: 6 + rand(w, 'events') * 25 });
    }
    if (t.city === 'providence' && chance(w, 'events', ev.inspectionChance * (1 - w.institutions.church / 200))) {
      spawnPrompt(w, c, 'friar-inspection', { tavernId: t.id, delaySeconds: 5 + rand(w, 'events') * 35 });
    }
    if (t.city === 'aleforge' && cal.segment === 'goldsun' && chance(w, 'events', 0.5)) {
      spawnPrompt(w, c, 'hall-contest', { tavernId: t.id, delaySeconds: 10 + rand(w, 'events') * 20 });
    }
    if (chance(w, 'events', 0.12)) spawnPrompt(w, c, 'bad-keg', { tavernId: t.id, delaySeconds: 10 + rand(w, 'events') * 40 });
    const isSister = t.id !== playerTaverns(w)[0]?.id;
    if (isSister && t.managerId && chance(w, 'events', ev.managerProposalChance)) {
      managerProposal(w, c, t, pick(w, 'events', ['mgr-promo', 'mgr-prices', 'mgr-bulk']));
    }
  }
  if (cal.segment === 'veilfrost' && chance(w, 'events', ev.vowChance)) {
    const t = pick(w, 'events', playerTaverns(w));
    spawnPrompt(w, c, 'vow-trade', { tavernId: t.id, delaySeconds: 8 + rand(w, 'events') * 30 });
  }
  if ((w.events.flags.contrabandSold ?? 0) > 12 && chance(w, 'events', 0.5)) {
    const t = playerTaverns(w).find((x) => x.city === 'aleforge');
    if (t) spawnPrompt(w, c, 'shorelan-warning', { tavernId: t.id, delaySeconds: 12 });
    w.events.flags.contrabandSold = 0;
  }
  if (cal.segment === 'goldsun' && cal.yearIndex % 3 === 1) {
    spawnPrompt(w, c, 'cumstead-contract', {});
  }
  void me;
  void cityOf;
}

/** Called when a shift's Last Call begins on the focused floor. */
export function onLastCall(w: World, c: Content): void {
  const t = w.taverns[w.focus.tavernId];
  if (!t || !w.floor) return;
  if (chance(w, 'events', 0.22)) spawnPrompt(w, c, 'vip-last-round', { tavernId: t.id });
}

/** Staff whose morale collapsed ask for a raise. */
export function raiseRequests(w: World, c: Content, asks: Array<{ staff: Staff; tavern: Tavern }>): void {
  for (const { staff, tavern } of asks.slice(0, 1)) {
    spawnPrompt(w, c, 'staff-raise', { tavernId: tavern.id, vars: { staff: staff.name }, subjectId: staff.id, delaySeconds: 5 });
  }
}
