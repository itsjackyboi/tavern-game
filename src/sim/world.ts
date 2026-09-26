import { CITY_IDS, type Archetype, type CityId, type Content, type IngredientId } from '../content/schema.ts';
import { materializeFloor } from './floor/floor.ts';
import { cityOf, clamp, drinkOf, newId } from './lookup.ts';
import { pick, rand, randInt } from './rng.ts';
import type { Company, Ledger, Staff, Tavern, TavernKpi, World } from './types.ts';

export type { World } from './types.ts';

export const WORLD_VERSION = 2;

export interface NewRunOptions {
  seed: string;
  homeCity: CityId;
  tavernName?: string;
  timerScale?: number;
  ngPlus?: number;
}

export const emptyLedger = (): Ledger => ({ revenue: 0, kegs: 0, wages: 0, rent: 0, tax: 0, other: 0 });
export const emptyKpi = (): TavernKpi => ({ revenue: 0, costs: 0, served: 0, walkouts: 0, brawls: 0, thefts: 0, satSum: 0, satN: 0, byDrink: {} });

const ING: IngredientId[] = ['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit', 'spiritweed', 'imports'];

export function makeCompany(w: World, opts: { name: string; isPlayer: boolean; cash: number }): Company {
  const id = newId(w, 'co');
  const co: Company = {
    id, name: opts.name, isPlayer: opts.isPlayer, cash: opts.cash, favor: 0, debt: 0, spiritweed: 0,
    unlocked: [], upgrades: {}, grainSource: 'mixed', profitYear: 0, seasonProfit: 0,
    ledger: emptyLedger(), lastLedger: null, cv: 0, cvHistory: [], rival: null,
  };
  w.companies[id] = co;
  return co;
}

/** Starting menu for a city: city-special drinks first, then the common starters, capped at `taps`. */
export function startMenu(c: Content, city: CityId, unlocked: string[], taps: number): string[] {
  const starters = c.drinks.filter((d) => d.startIn.includes(city) || unlocked.includes(d.id));
  starters.sort((a, b) => a.startIn.length - b.startIn.length);
  return starters.slice(0, taps).map((d) => d.id);
}

export function makeTavern(
  w: World,
  c: Content,
  opts: {
    company: Company; city: CityId; name: string; tables: number; taps: number; rep: number;
    status: Tavern['status']; menu: string[]; qualityBias?: number; priceBias?: number; assetValue: number;
  },
): Tavern {
  const id = newId(w, 'tv');
  const t: Tavern = {
    id, companyId: opts.company.id, city: opts.city, name: opts.name, status: opts.status, openTick: w.tick,
    tables: opts.tables, taps: opts.taps, decor: 0, upgrades: {},
    menu: opts.menu.map((drinkId) => ({ drinkId, price: 1 })),
    cellar: {}, tapLevels: {}, orders: [], autoRestock: true, restockTarget: 2,
    rep: opts.rep, managerId: null, attention: 1, closedUntil: 0,
    agg: { occupancy: 0, backlog: 0 }, demand: { rate: 0, segRates: {} },
    kpi: emptyKpi(), lastKpi: null, assetValue: opts.assetValue, stableSeasons: 0, regulars: [],
    qualityBias: opts.qualityBias ?? 0, priceBias: opts.priceBias ?? 0, factions: {},
  };
  for (const d of opts.menu) {
    t.cellar[d] = 2;
    t.tapLevels[d] = c.economy.kegServings;
  }
  w.taverns[id] = t;
  return t;
}

const MANAGER_ARCH = 'manager';

export function makeStaff(
  w: World,
  c: Content,
  opts: { archetype: string; tier: Staff['tier']; tavernId: string; stream: string },
): Staff {
  const tier = c.staff.tiers.find((x) => x.id === opts.tier)!;
  const isManager = opts.archetype === MANAGER_ARCH;
  const arch = isManager ? null : c.staff.archetypes.find((a) => a.id === opts.archetype);
  if (!isManager && !arch) throw new Error(`unknown staff archetype ${opts.archetype}`);
  const competence = tier.competence[0] + rand(w, opts.stream) * (tier.competence[1] - tier.competence[0]);
  const s: Staff = {
    id: newId(w, 'st'),
    name: `${pick(w, opts.stream, c.staff.firstNames)} ${pick(w, opts.stream, c.staff.epithets)}`,
    archetype: opts.archetype,
    role: isManager ? 'manage' : arch!.role,
    tier: opts.tier,
    competence: Math.round(competence * 100) / 100,
    wage: Math.round(tier.wage * (isManager ? 1.6 : arch!.wageMult)),
    morale: 0.75,
    fatigue: 0,
    tavernId: opts.tavernId,
    hiredTick: w.tick,
    raiseAsked: -1,
  };
  w.staff[s.id] = s;
  return s;
}

export function managerTitle(c: Content, city: CityId): string {
  return c.staff.managers[city];
}

function seedRivals(w: World, c: Content): void {
  const archetypes: Archetype[] = ['undercutter', 'snob', 'brawler', 'briber'];
  const makeBrain = (arch: Archetype, isArch: boolean): Company['rival'] => {
    const def = c.rivals.archetypes.find((a) => a.id === arch)!;
    return {
      archetype: arch, aggression: def.aggression, secrecy: 0.1, mood: 'confident', moodSince: 0,
      knowledge: { aleforge: 0.2, shanty: 0.2, providence: 0.2, roto: 0.2 },
      nextDecisionTick: randInt(w, 'rivals', 40, c.rivalTuning.decisionTicks * 2),
      negativeSince: null, isArch, tier: 0, shareBaseline: 0.2,
    };
  };
  const addRivalTavern = (co: Company, city: CityId, name: string, big: boolean) => {
    const arch = co.rival!.archetype;
    const def = c.rivals.archetypes.find((a) => a.id === arch)!;
    const tables = big ? randInt(w, 'rivals', 8, 10) : randInt(w, 'rivals', 5, 8);
    const taps = big ? 4 : randInt(w, 'rivals', 3, 4);
    const pool = c.drinks.filter((d) => (d.startIn.includes(city) || (d.discover && !d.recipe.spiritweed && rand(w, 'rivals') < (big ? 0.3 : 0.15))));
    const menu = pool.slice(0, taps).map((d) => d.id);
    for (const d of menu) if (!co.unlocked.includes(d)) co.unlocked.push(d);
    const t = makeTavern(w, c, {
      company: co, city, name, tables, taps, rep: randInt(w, 'rivals', big ? 50 : 38, big ? 62 : 55),
      status: 'established', menu, qualityBias: def.qualityBias, priceBias: def.priceBias,
      assetValue: 300 + tables * 45,
    });
    const tier: Staff['tier'] = big ? 'seasoned' : 'green';
    makeStaff(w, c, { archetype: 'tapster', tier, tavernId: t.id, stream: 'rivals' });
    if (tables >= 7 || big) makeStaff(w, c, { archetype: 'runner', tier: 'green', tavernId: t.id, stream: 'rivals' });
    if (arch === 'brawler' || big) makeStaff(w, c, { archetype: 'bruiser', tier: 'green', tavernId: t.id, stream: 'rivals' });
    const m = makeStaff(w, c, { archetype: MANAGER_ARCH, tier, tavernId: t.id, stream: 'rivals' });
    t.managerId = m.id;
    return t;
  };

  for (const city of CITY_IDS) {
    const n = cityOf(c, city).rivalTaverns;
    const names = [...c.rivals.tavernNames[city]];
    for (let i = 0; i < n; i++) {
      const name = names.splice(randInt(w, 'rivals', 0, names.length - 1), 1)[0]!;
      const arch = archetypes[(i + CITY_IDS.indexOf(city)) % archetypes.length]!;
      const co = makeCompany(w, { name, isPlayer: false, cash: randInt(w, 'rivals', 250, 500) });
      co.rival = makeBrain(arch, false);
      addRivalTavern(co, city, name, false);
    }
  }
  // The arch-rival network: already spans two cities and races the player for #1.
  const ar = c.rivalTuning.archRival;
  const arch = makeCompany(w, { name: ar.name, isPlayer: false, cash: ar.startCash });
  const archBrain = makeBrain('snob', true)!;
  archBrain.tier = 1;
  archBrain.aggression = 0.75;
  arch.rival = archBrain;
  for (const city of ar.startCities) addRivalTavern(arch, city, `${ar.name} ${cityOf(c, city).name}`, true);
}

export function createWorld(opts: NewRunOptions, c: Content): World {
  const shock = Object.fromEntries(ING.map((i) => [i, 1])) as Record<IngredientId, number>;
  const hist = () => Object.fromEntries(ING.map((i) => [i, [] as number[]])) as Record<IngredientId, number[]>;
  const w: World = {
    meta: { v: WORLD_VERSION, seed: opts.seed, homeCity: opts.homeCity, timerScale: opts.timerScale ?? 1, ngPlus: opts.ngPlus ?? 0 },
    tick: 0,
    rng: {},
    focus: { tavernId: '', view: 'floor' },
    playerId: '',
    companies: {},
    taverns: {},
    staff: {},
    cities: Object.fromEntries(
      CITY_IDS.map((id) => [id, { shock: { ...shock }, history: hist(), segWeights: {}, tributeDueShift: c.events.tributeEverySeasons }]),
    ) as World['cities'],
    institutions: { church: 0, windsunk: 0, rotoMarket: 0, cumstead: 10, cityhall: 0 },
    undercurrents: {
      church: { providence: 70, aleforge: 25, shanty: 10, roto: 5 },
      pirateCulture: { shanty: 1, aleforge: 0.05, providence: 0.02, roto: 0.1 },
      farmerTension: 20, veilGoodwill: 0, consolidation: 0, cumsteadDependency: 0.5,
      notified: {}, lastWindShift: -10, vowThisYear: false,
    },
    modifiers: [],
    prompts: { active: [], pending: [], nextUid: 1, answered: 0, missed: 0 },
    shipments: [],
    floor: null,
    log: [],
    fx: [],
    events: { crisesFired: [], lastCrisisShift: -100, holiday: null, flags: {}, erasFired: [], lastShift: 0, lastYear: c.time.startYear, lastSegment: 'stormtide' },
    run: {
      status: 'playing', winType: null, endTick: null,
      splits: { firstSister: null, thirdSister: null, firstNo1: null, monopoly: null },
      peakCV: 0, finalCV: null, lowCashSince: null, verdictDone: false, chosen: false,
    },
    research: { tried: [] },
    tracking: {},
    nextId: 0,
    seasonIndexSeen: 'stormtide',
  };

  const me = makeCompany(w, { name: 'Last Call Company', isPlayer: true, cash: c.economy.startingDuckets });
  w.playerId = me.id;
  me.unlocked = c.drinks.filter((d) => d.startIn.includes(opts.homeCity)).map((d) => d.id);
  const flagship = makeTavern(w, c, {
    company: me, city: opts.homeCity, name: opts.tavernName?.trim() || 'The Last Call', tables: 6, taps: 3,
    rep: 42, status: 'established', menu: startMenu(c, opts.homeCity, [], 3), assetValue: 420,
  });
  flagship.restockTarget = 2;
  w.focus.tavernId = flagship.id;

  seedRivals(w, c);

  // NG+: rivals start sharper and richer.
  if (w.meta.ngPlus > 0) {
    for (const co of Object.values(w.companies)) {
      if (!co.rival) continue;
      co.rival.tier = Math.min(2, co.rival.tier + 1) as 0 | 1 | 2;
      co.rival.secrecy = clamp(co.rival.secrecy + 0.2 * w.meta.ngPlus, 0, 0.9);
      co.cash *= 1 + 0.4 * w.meta.ngPlus;
    }
  }

  w.floor = materializeFloor(w, c, flagship);
  // Make sure every starting menu drink is valid.
  for (const t of Object.values(w.taverns)) for (const m of t.menu) drinkOf(c, m.drinkId);
  return w;
}
