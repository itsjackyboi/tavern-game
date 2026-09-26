import { CATEGORIES, CITY_IDS, type Category, type CityId, type Content } from '../content/schema.ts';
import { spend } from './economy/ledger.ts';
import { companyTaverns } from './company.ts';
import { log, rumor } from './log.ts';
import {
  addModifier, cityOf, clamp, drinkOf, player, playerTaverns, seasonTicks, staffAt, upgradeCount,
} from './lookup.ts';
import { closeTavern, lotsFree, rivalFound } from './network.ts';
import { spawnPrompt } from './prompts.ts';
import { chance, pick, rand } from './rng.ts';
import { calNow } from './time.ts';
import type { Company, Tavern, World } from './types.ts';
import { makeStaff } from './world.ts';

// The rival AI director (docs/PLAN.md §2.7). Each rival company watches what's
// working for the player, contests it according to its archetype, escalates
// by Act, and can turn desperate when crushed.

type Action = 'undercut' | 'copy' | 'quality' | 'promo' | 'sabotage' | 'bribe' | 'poach' | 'expand';

/** Updates the player-success EMAs by city and drink category (called every rival decision interval). */
export function updateTracking(w: World, c: Content): void {
  for (const city of CITY_IDS) {
    const total: Partial<Record<Category, number>> = {};
    const mine: Partial<Record<Category, number>> = {};
    for (const t of Object.values(w.taverns)) {
      if (t.city !== city || t.status === 'closed') continue;
      const tally = (by: Record<string, number>) => {
        for (const [d, n] of Object.entries(by)) {
          const cat = drinkOf(c, d).category;
          total[cat] = (total[cat] ?? 0) + n;
          if (t.companyId === w.playerId) mine[cat] = (mine[cat] ?? 0) + n;
        }
      };
      tally(t.kpi.byDrink);
      if (t.lastKpi) tally(t.lastKpi.byDrink);
    }
    for (const cat of CATEGORIES) {
      const key = `${city}:${cat}`;
      const share = (total[cat] ?? 0) > 5 ? (mine[cat] ?? 0) / total[cat]! : 0;
      const tr = w.tracking[key] ?? { fast: 0, slow: 0 };
      tr.fast += (share - tr.fast) * 0.15;
      tr.slow += (share - tr.slow) * 0.02;
      w.tracking[key] = tr;
    }
  }
}

function threat(w: World, city: CityId, cat: Category): number {
  const tr = w.tracking[`${city}:${cat}`];
  if (!tr) return 0;
  return tr.fast * (1 + Math.max(0, tr.fast - tr.slow) / Math.max(0.05, tr.slow));
}

/** A rival's noisy read of the player's strongest category in a city. */
function perceivedTop(w: World, co: Company, city: CityId): { cat: Category; threat: number } {
  const noise = 1 - (co.rival?.knowledge[city] ?? 0.2);
  let best: { cat: Category; threat: number } = { cat: 'ale', threat: 0 };
  for (const cat of CATEGORIES) {
    const v = threat(w, city, cat) * (1 + (rand(w, `rival:${co.id}`) - 0.5) * noise);
    if (v > best.threat) best = { cat, threat: v };
  }
  return best;
}

const TIER_LEVEL = { green: 1, seasoned: 2, master: 3 } as const;
/** How clearly each informant level hears things, before rival secrecy. */
const LEVEL_BASE = [0.32, 0.6, 0.8, 1.0];

/**
 * The player's informant level covering a city: 0 none, 1 green, 2 seasoned,
 * 3 master. An informant in another of your taverns counts one level lower.
 */
export function intelLevel(w: World, city: CityId): { level: number; competence: number } {
  let here = 0;
  let elsewhere = 0;
  let competence = 0;
  for (const t of playerTaverns(w)) {
    if (t.status === 'closed') continue;
    for (const s of staffAt(w, t.id)) {
      if (s.role !== 'intel') continue;
      const lvl = TIER_LEVEL[s.tier];
      if (t.city === city && lvl >= here) { here = lvl; competence = Math.max(competence, s.competence); }
      elsewhere = Math.max(elsewhere, lvl);
    }
  }
  return { level: Math.max(here, elsewhere - 1), competence };
}

/** How clearly the player learns of a rival action: 0 (nothing) to 1 (exact). */
function fidelity(w: World, co: Company, city: CityId): number {
  const { level, competence } = intelLevel(w, city);
  const mine = playerTaverns(w).find((t) => t.city === city);
  // Without an informant you only overhear what happens under your own roof.
  if (level === 0 && !mine) return 0;
  const gossip = mine ? mine.regulars.length * 0.02 : 0;
  return clamp(LEVEL_BASE[level]! + 0.1 * competence + gossip - 0.6 * (co.rival?.secrecy ?? 0), 0, 1);
}

/**
 * Whether a rival move against you surfaces as a decision in time to react.
 * This is gameplay, not news: it doesn't depend on informants (they only
 * change what the feed tells you), so hiring one never makes rivals gentler.
 */
function awareness(w: World, co: Company, city: CityId): number {
  const mine = playerTaverns(w).find((t) => t.city === city);
  let intel = 0;
  if (mine) {
    for (const s of staffAt(w, mine.id)) if (s.role === 'intel') intel += 0.25 + 0.2 * s.competence;
    intel += mine.regulars.length * 0.03;
  }
  return clamp(0.78 - (co.rival?.secrecy ?? 0) + intel, 0, 1);
}

/** Puts a rival move in the feed as clearly as your informants allow; returns how aware of it you are. */
function telegraph(w: World, c: Content, co: Company, city: CityId, group: string, vars: Record<string, string>): number {
  const f = fidelity(w, co, city);
  if (f >= 0.5) rumor(w, c, group, city, { rival: co.name, ...vars }, f >= 0.75 ? 'intel' : 'rumor');
  else if (f >= 0.25 && chance(w, 'log', 0.35)) rumor(w, c, 'vague', city);
  return awareness(w, co, city);
}

/**
 * Season rollover: seasoned and master informants file a report on the rivals
 * in the cities they cover. Master reports include money and intentions.
 */
function intelReports(w: World, c: Content): void {
  const seen = new Set<string>();
  for (const city of CITY_IDS) {
    const { level } = intelLevel(w, city);
    if (level < 2) continue;
    const rivals = [...new Set(Object.values(w.taverns).filter((t) => t.city === city && t.status !== 'closed' && t.companyId !== w.playerId).map((t) => t.companyId))]
      .map((id) => w.companies[id]!)
      .filter((co) => co.rival && !seen.has(co.id))
      .sort((a, b) => Number(b.rival!.isArch) - Number(a.rival!.isArch) || b.cv - a.cv)
      .slice(0, level >= 3 ? 3 : 2);
    for (const co of rivals) {
      seen.add(co.id);
      const b = co.rival!;
      const n = companyTaverns(w, co).filter((t) => t.status !== 'closed').length;
      if (level >= 3) {
        const cash = Math.max(0, Math.round(co.cash / 50) * 50);
        const plan = b.tier >= 2 && co.cash >= c.rivalTuning.archRival.expandCash * (b.isArch ? 1 : 1.4) ? ', saving to open another house'
          : b.mood === 'desperate' ? ', desperate enough for dirty tricks'
          : b.tier >= 1 && b.aggression > 0.6 ? ', spoiling for a fight' : '';
        log(w, 'intel', `Informant: ${co.name} holds about ${cash} Duckets, ${n} tavern${n === 1 ? '' : 's'}, ${b.mood}${plan}.`, city);
      } else {
        log(w, 'intel', `Informant: ${co.name} seems ${b.mood} these days.`, city);
      }
    }
  }
}

function actTier(w: World, c: Content, co: Company): 0 | 1 | 2 {
  const year = calNow(w, c.time).year;
  let tier: number = co.rival?.tier ?? 0;
  const mine = playerTaverns(w);
  if (year >= c.rivalTuning.act2Year || mine.length >= 2) tier = Math.max(tier, 1);
  if (year >= c.rivalTuning.act3Year || (co.rival?.isArch && mine.length >= 2)) tier = Math.max(tier, 2);
  return tier as 0 | 1 | 2;
}

function citiesOf(w: World, co: Company): CityId[] {
  return [...new Set(companyTaverns(w, co).map((t) => t.city))];
}

function available(w: World, c: Content, co: Company, a: Action, tier: number): boolean {
  const cities = citiesOf(w, co);
  const contested = cities.some((city) => playerTaverns(w).some((t) => t.city === city && t.status !== 'building'));
  switch (a) {
    case 'undercut':
    case 'promo':
    case 'copy':
      return contested;
    case 'quality':
      return co.cash > 200;
    case 'sabotage':
    case 'bribe':
    case 'poach':
      return tier >= 1 && (contested || (co.rival?.isArch ?? false)) && playerTaverns(w).length > 0;
    case 'expand':
      return tier >= 2 && co.cash >= c.rivalTuning.archRival.expandCash * (co.rival?.isArch ? 1 : 1.4) && CITY_IDS.some((x) => !cities.includes(x) && lotsFree(w, c, x) > 0);
  }
}

function targetTavern(w: World, co: Company, prefer?: CityId): Tavern | null {
  const mine = playerTaverns(w).filter((t) => t.status !== 'building');
  if (!mine.length) return null;
  const cities = citiesOf(w, co);
  return mine.find((t) => t.city === prefer) ?? mine.find((t) => cities.includes(t.city)) ?? (co.rival?.isArch ? pick(w, `rival:${co.id}`, mine) : null);
}

function act(w: World, c: Content, co: Company, a: Action): void {
  const rng = `rival:${co.id}`;
  const taverns = companyTaverns(w, co).filter((t) => t.status !== 'building');
  if (!taverns.length) return;
  const home = pick(w, rng, taverns);
  const top = perceivedTop(w, co, home.city);
  const mine = targetTavern(w, co, home.city);
  switch (a) {
    case 'undercut': {
      let changed = false;
      for (const m of home.menu) {
        if (drinkOf(c, m.drinkId).category === top.cat || !changed) {
          m.price = clamp(m.price * 0.88, co.rival!.mood === 'desperate' ? 0.6 : 0.72, 1.6);
          changed = true;
        }
      }
      const f = telegraph(w, c, co, home.city, 'rivalUndercut', { category: top.cat });
      if (mine && mine.city === home.city && f >= 0.5 && chance(w, rng, c.events.rivalPromptChance)) {
        spawnPrompt(w, c, 'rival-undercut', { tavernId: mine.id, vars: { rival: home.name, category: top.cat } });
      }
      break;
    }
    case 'copy': {
      const cands = c.drinks.filter((d) => d.category === top.cat && !d.recipe.spiritweed && !home.menu.some((m) => m.drinkId === d.id));
      const mineMenu = mine ? mine.menu.map((m) => m.drinkId) : [];
      const pickD = cands.find((d) => mineMenu.includes(d.id)) ?? cands[0];
      if (!pickD) break;
      if (!co.unlocked.includes(pickD.id)) co.unlocked.push(pickD.id);
      if (home.menu.length >= home.taps) home.menu.shift();
      home.menu.push({ drinkId: pickD.id, price: 0.95 });
      home.cellar[pickD.id] = (home.cellar[pickD.id] ?? 0) + 1;
      spend(co, 60, 'other');
      telegraph(w, c, co, home.city, 'rivalQuality', {});
      break;
    }
    case 'quality': {
      spend(co, 150, 'other');
      home.qualityBias = clamp(home.qualityBias + 3, -10, 18);
      home.rep = clamp(home.rep + 2, 0, 100);
      telegraph(w, c, co, home.city, 'rivalQuality', {});
      break;
    }
    case 'promo': {
      spend(co, 60, 'other');
      addModifier(w, c, 'promo-night', 1, 'tavern', home.id);
      if (mine && mine.city === home.city) addModifier(w, c, 'rival-promo', 1, 'tavern', mine.id);
      telegraph(w, c, co, home.city, 'rivalPromo', {});
      break;
    }
    case 'sabotage': {
      if (!mine) break;
      spend(co, 70, 'other');
      const f = telegraph(w, c, co, mine.city, 'rivalPlot', {});
      const spoil = chance(w, rng, 0.4);
      if (f >= 0.6) spawnPrompt(w, c, spoil ? 'rival-spoil' : 'rival-thugs', { tavernId: mine.id, vars: { rival: co.name } });
      else addModifier(w, c, spoil ? 'spoiled-kegs' : 'thugs', 1, 'tavern', mine.id);
      break;
    }
    case 'bribe': {
      if (!mine) break;
      spend(co, 90, 'other');
      if (mine.city === 'providence') spawnPrompt(w, c, 'friar-inspection', { tavernId: mine.id, delaySeconds: 4 });
      else if (mine.city === 'shanty') addModifier(w, c, 'windsunk-grudge', 1, 'tavern', mine.id);
      else if (mine.city === 'aleforge') spawnPrompt(w, c, 'shorelan-warning', { tavernId: mine.id, delaySeconds: 4 });
      else addModifier(w, c, 'bad-press', 1, 'tavern', mine.id);
      telegraph(w, c, co, mine.city, 'rivalPlot', {});
      break;
    }
    case 'poach': {
      if (!mine) break;
      const best = staffAt(w, mine.id).sort((x, y) => y.competence - x.competence)[0];
      if (!best || best.competence < 0.55) break;
      spawnPrompt(w, c, 'rival-poach', { tavernId: mine.id, vars: { rival: co.name, staff: best.name }, subjectId: best.id });
      break;
    }
    case 'expand': {
      const cities = citiesOf(w, co);
      const targets = CITY_IDS.filter((x) => !cities.includes(x) && lotsFree(w, c, x) > 0);
      // The arch-rival heads for the cities the player is racing into.
      const playerCities = new Set(playerTaverns(w).map((t) => t.city));
      targets.sort((a, b) => Number(playerCities.has(b)) - Number(playerCities.has(a)));
      const city = targets[0];
      if (!city) break;
      const name = co.rival?.isArch ? `${co.name} ${cityOf(c, city).name}` : `${co.name} ${pick(w, rng, ['Annex', 'Second House', 'Wharf'])}`;
      telegraph(w, c, co, city, 'rivalExpand', {});
      const t = rivalFound(w, c, co.id, city, name);
      if (t) rumor(w, c, 'rivalOpened', city, { rival: name }, 'news');
      break;
    }
  }
}

/** Keeps a rival's taverns staffed and growing when it has the cash. */
function maintain(w: World, c: Content, co: Company): void {
  const rng = `rival:${co.id}`;
  for (const t of companyTaverns(w, co)) {
    if (t.status === 'building') continue;
    const staff = staffAt(w, t.id);
    if (t.agg.backlog > 4 && staff.length < 5 && co.cash > 150) {
      spend(co, 60, 'wages');
      makeStaff(w, c, { archetype: staff.some((s) => s.role === 'floor') ? 'tapster' : 'runner', tier: co.rival?.isArch ? 'seasoned' : 'green', tavernId: t.id, stream: rng });
    }
    const maxTables = co.rival?.isArch ? c.rivalTuning.archRival.maxTables : c.rivalTuning.maxTables;
    if (co.cash > 900 && t.tables < maxTables && t.agg.occupancy > t.tables * 2 * 0.8) {
      spend(co, 220, 'other');
      t.tables += 2;
      t.assetValue += 120;
    }
    if (co.rival?.mood === 'confident') for (const m of t.menu) if (m.price < 1) m.price = Math.min(1, m.price + 0.02);
    // Sometimes pick up a new drink.
    if (co.cash > 400 && t.menu.length < t.taps && chance(w, rng, 0.3)) {
      const d = c.drinks.find((x) => !x.recipe.spiritweed && !t.menu.some((m) => m.drinkId === x.id) && (x.startIn.includes(t.city) || x.discover));
      if (d) {
        t.menu.push({ drinkId: d.id, price: 1 });
        t.cellar[d.id] = 1;
      }
    }
  }
}

function updateMood(w: World, c: Content, co: Company): void {
  const brain = co.rival!;
  const cities = citiesOf(w, co);
  let mineRev = 0;
  let total = 0;
  for (const t of Object.values(w.taverns)) {
    if (!cities.includes(t.city) || t.status === 'closed') continue;
    const rev = t.kpi.revenue + (t.lastKpi?.revenue ?? 0);
    total += rev;
    if (t.companyId === co.id) mineRev += rev;
  }
  const share = total > 0 ? mineRev / total : brain.shareBaseline;
  brain.shareBaseline += (share - brain.shareBaseline) * 0.01;
  const prev = brain.mood;
  const cashSeasons = co.cash / Math.max(50, companyTaverns(w, co).length * 110);
  if (cashSeasons < 0.5 || share < brain.shareBaseline * 0.3) brain.mood = 'desperate';
  else if (share < brain.shareBaseline * c.rivalTuning.pressuredShare || cashSeasons < 1) brain.mood = 'pressured';
  else if (share > brain.shareBaseline * 0.8) brain.mood = 'confident';
  if (brain.mood !== prev) brain.moodSince = w.tick;
}

/** Season rollover: rivals with negative cash too long collapse or get swallowed. */
export function seasonRivals(w: World, c: Content): void {
  intelReports(w, c);
  for (const co of Object.values(w.companies)) {
    if (!co.rival) continue;
    const taverns = companyTaverns(w, co);
    if (!taverns.length) continue;
    // Owner's draw: rival owners take profit out above a working reserve, so
    // their Company Value tracks the size of the business, not a hoard.
    const reserve = 400 + 350 * taverns.length + (co.rival.isArch ? c.rivalTuning.archRival.expandCash : 0);
    const draw = co.rival.isArch ? c.rivalTuning.archRival.drawRate : c.rivalTuning.drawRate;
    if (co.cash > reserve) co.cash -= (co.cash - reserve) * draw;
    if (co.cash < -150) {
      if (co.rival.negativeSince === null) co.rival.negativeSince = w.tick;
      else if (w.tick - co.rival.negativeSince >= c.rivalTuning.collapseSeasons * seasonTicks(c)) {
        const city = taverns[0]!.city;
        const buyer = Object.values(w.companies).find(
          (o) => o.rival && o.id !== co.id && o.cash > 800 && companyTaverns(w, o).some((t) => t.city === city),
        );
        if (buyer && chance(w, 'rivals', 0.5 + w.undercurrents.consolidation * 0.4)) {
          for (const t of taverns) {
            t.companyId = buyer.id;
            t.qualityBias += 3;
          }
          spend(buyer, 300, 'other');
          buyer.rival!.aggression = clamp(buyer.rival!.aggression + 0.2, 0, 1);
          buyer.rival!.tier = Math.min(2, buyer.rival!.tier + 1) as 0 | 1 | 2;
          rumor(w, c, 'rivalMerged', city, { rival: buyer.name }, 'news');
        } else {
          for (const t of taverns) closeTavern(w, t, 'collapse');
          rumor(w, c, 'rivalClosed', city, { rival: co.name }, 'news');
        }
        w.undercurrents.consolidation = clamp(w.undercurrents.consolidation + 0.25, 0, 1);
        co.cash = 0;
      }
    } else co.rival.negativeSince = null;
  }
}

/** 1 Hz: each rival company acts on its own schedule. */
export function stepRivals(w: World, c: Content): void {
  if (w.tick % c.rivalTuning.decisionTicks === 0) updateTracking(w, c);
  const year = calNow(w, c.time).year;
  const actIdx = year >= c.rivalTuning.act3Year ? 2 : year >= c.rivalTuning.act2Year ? 1 : 0;
  for (const co of Object.values(w.companies)) {
    const brain = co.rival;
    if (!brain || w.tick < brain.nextDecisionTick) continue;
    if (!companyTaverns(w, co).length) continue;
    brain.nextDecisionTick = w.tick + Math.round(c.rivalTuning.decisionTicks * (0.7 + 0.6 * rand(w, `rival:${co.id}`)));
    brain.tier = actTier(w, c, co);
    brain.secrecy = clamp(0.1 + c.rivalTuning.secrecyPerAct * actIdx + (brain.isArch ? 0.08 : 0), 0, 0.9);
    for (const city of CITY_IDS) brain.knowledge[city] = clamp(brain.knowledge[city] + 0.01 * brain.tier, 0, 0.9);
    updateMood(w, c, co);
    maintain(w, c, co);

    // Utility-based choice with a softmax that sharpens each Act.
    const def = c.rivals.archetypes.find((a) => a.id === brain.archetype)!;
    const actions: Action[] = ['undercut', 'copy', 'quality', 'promo', 'sabotage', 'bribe', 'poach', 'expand'];
    const home = companyTaverns(w, co)[0]!;
    const topThreat = perceivedTop(w, co, home.city).threat;
    const desperate = brain.mood === 'desperate' ? 2 : brain.mood === 'pressured' ? 1.3 : 1;
    const utils = actions.map((a) => {
      if (!available(w, c, co, a, brain.tier)) return -Infinity;
      let u = def.weights[a] * brain.aggression;
      if (a === 'undercut' || a === 'copy') u *= 0.4 + topThreat * 3;
      if (a === 'sabotage' || a === 'bribe' || a === 'undercut') u *= desperate;
      if (a === 'expand') u *= brain.isArch ? 3 : 1;
      if (a === 'quality' && brain.mood === 'desperate') u *= 0.3;
      return u;
    });
    // Sometimes a rival simply does nothing this interval.
    if (!chance(w, `rival:${co.id}`, 0.35 + 0.15 * brain.tier + (brain.isArch ? 0.2 : 0))) continue;
    const temp = 1.2 - 0.3 * actIdx;
    const finite = utils.filter((u) => u > -Infinity);
    if (!finite.length) continue;
    const max = Math.max(...finite);
    const exps = utils.map((u) => (u === -Infinity ? 0 : Math.exp((u - max) / temp)));
    const sum = exps.reduce((a, b) => a + b, 0);
    let r = rand(w, `rival:${co.id}`) * sum;
    let choice: Action = 'quality';
    for (let i = 0; i < actions.length; i++) {
      r -= exps[i]!;
      if (r <= 0) { choice = actions[i]!; break; }
    }
    if (co.cash < 40 && choice !== 'undercut') continue;
    act(w, c, co, choice);
  }
  void log;
  void upgradeCount;
  void player;
}
