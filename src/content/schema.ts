import { z } from 'zod';

// Content schemas. Every object is strict, so unknown keys are rejected.
// There are deliberately NO free-text description fields: UI descriptions are
// generated from stats, which keeps lore prose out of live play (docs/PLAN.md §3).
// Prose lives only in the files listed in PROSE_FILES (letter, rumours, winds, finale, tips).

export const CityId = z.enum(['aleforge', 'shanty', 'providence', 'roto']);
export type CityId = z.infer<typeof CityId>;
export const CITY_IDS: readonly CityId[] = ['aleforge', 'shanty', 'providence', 'roto'];

export const SeasonId = z.enum(['stormtide', 'goldsun', 'veilfrost']);
export type SeasonId = z.infer<typeof SeasonId>;

export const Category = z.enum(['ale', 'stout', 'grog', 'tonic', 'spirits', 'cider', 'wine']);
export type Category = z.infer<typeof Category>;
export const CATEGORIES: readonly Category[] = ['ale', 'stout', 'grog', 'tonic', 'spirits', 'cider', 'wine'];

export const IngredientId = z.enum(['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit', 'spiritweed', 'imports']);
export type IngredientId = z.infer<typeof IngredientId>;

export const InstitutionId = z.enum(['church', 'windsunk', 'rotoMarket', 'cumstead', 'cityhall']);
export type InstitutionId = z.infer<typeof InstitutionId>;

export const Role = z.enum(['bar', 'floor', 'door', 'cellar', 'stage', 'intel']);
export type Role = z.infer<typeof Role>;

const ticks = z.number().int().positive();
const fraction = z.number().min(0).max(1);
const label = z.string().min(1).max(40);
const shortLine = z.string().min(1).max(70);
const cityRecord = <T extends z.ZodType>(t: T) => z.strictObject({ aleforge: t, shanty: t, providence: t, roto: t });
const partialCityRecord = <T extends z.ZodType>(t: T) =>
  z.strictObject({ aleforge: t.optional(), shanty: t.optional(), providence: t.optional(), roto: t.optional() });

// ---------------------------------------------------------------- tuning

export const TimeTuning = z.strictObject({
  ticksPerSecond: z.literal(20),
  startYear: z.number().int(),
  endYear: z.number().int(),
  seasonOrder: z.array(SeasonId).length(3),
  seasonTicks: z.strictObject({ stormtide: ticks, goldsun: ticks, veilfrost: ticks }),
  /** Fraction of a Stormtide/Goldsun shift that is day, before the Hangover bell. Veilfrost is all night. */
  dayFraction: fraction,
  /** Ticks at the end of each season-shift given to the Last Call ritual. */
  lastCallTicks: ticks,
  /** The year-end Holiday Keg. */
  holidayKegTicks: ticks,
  /** Real-time accumulator clamp, in ms, so a stalled tab never fast-forwards the sim. */
  maxFrameMs: z.number().int().positive(),
});
export type TimeTuning = z.infer<typeof TimeTuning>;

export const EconomyTuning = z.strictObject({
  /** Monopoly win: player CV >= monopolyRatio x the next-biggest company's CV. */
  monopolyRatio: z.number().min(1),
  /** Monopoly is only checked after this many seasons, so the opening can't trigger it. */
  monopolyGraceSeasons: z.number().int().min(0),
  startingDuckets: z.number().int().nonnegative(),
  kegServings: z.number().int().positive(),
  /** Flat brewing/handling fee per keg on top of ingredient costs. */
  brewFee: z.number().nonnegative(),
  /** Kegs take this many ticks to arrive after an order. */
  kegDeliveryTicks: ticks,
  cvEarningsMultiple: z.number().nonnegative(),
  cvBrandFactor: z.number().nonnegative(),
  /** Tavern asset value lost per season. */
  assetDepreciation: fraction,
  loanRatePerSeason: fraction,
  /** Loans are capped at this fraction of CV. */
  loanCapFraction: fraction,
  /** Cash below this triggers the bankruptcy warning; a full season below ends the run. */
  bankruptcyFloor: z.number(),
  favorToDuckets: z.number().positive(),
  researchCost: z.number().int().nonnegative(),
  spoilagePerSeason: fraction,
  ingredientVolatility: cityRecord(z.number().nonnegative()),
  /** Mean reversion per second for ingredient price shocks. */
  priceReversion: fraction,
});
export type EconomyTuning = z.infer<typeof EconomyTuning>;

export const DemandTuning = z.strictObject({
  phase: z.strictObject({ day: z.number(), night: z.number(), lastCall: z.number(), holiday: z.number() }),
  season: z.strictObject({ stormtide: z.number(), goldsun: z.number(), veilfrost: z.number() }),
  /** Market growth per year (compounding). */
  growthPerYear: z.number(),
  logit: z.strictObject({
    rep: z.number(),
    fit: z.number(),
    quality: z.number(),
    price: z.number(),
    decor: z.number(),
    stayHome: z.number(),
  }),
  /** Average drinks a patron orders per visit before segment and night modifiers. */
  drinksPerVisit: z.number().positive(),
  /** Seconds a patron spends per drink (order wait excluded). */
  drinkSeconds: z.number().positive(),
  /** How fast tavern reputation moves toward patron satisfaction (per served patron). */
  repLearnRate: fraction,
});
export type DemandTuning = z.infer<typeof DemandTuning>;

export const FloorTuning = z.strictObject({
  walkTilesPerSecond: z.number().positive(),
  pourTicks: ticks,
  clearTicks: ticks,
  restockTicks: ticks,
  seatPatienceTicks: ticks,
  orderPatienceTicks: ticks,
  orderDelayTicks: ticks,
  brawlWindowTicks: ticks,
  thiefWindowTicks: ticks,
  vipWindowTicks: ticks,
  maxIncidents: z.number().int().positive(),
  ownerQueueMax: z.number().int().positive(),
  /** Tip bonus on orders the owner serves personally. */
  ownersTouch: z.number().nonnegative(),
  /** Staff and managers run at this fraction of skilled play (docs/PLAN.md §2.5). */
  delegationEff: fraction,
  tapLowFraction: fraction,
  lastCallStragglerFine: z.number().nonnegative(),
});
export type FloorTuning = z.infer<typeof FloorTuning>;

export const RivalTuning = z.strictObject({
  decisionTicks: ticks,
  /** Act boundaries in years: T1 from act2, T2 from act3. */
  act2Year: z.number().int(),
  act3Year: z.number().int(),
  secrecyPerAct: fraction,
  pressuredShare: fraction,
  desperateCashSeasons: z.number().positive(),
  collapseSeasons: z.number().int().positive(),
  /** Share of cash above the working reserve that rival owners take out each season. */
  drawRate: fraction,
  /** Most tables an ordinary rival tavern grows to. */
  maxTables: z.number().int().positive(),
  archRival: z.strictObject({
    name: label,
    startCash: z.number(),
    startCities: z.array(CityId).min(1),
    expandCash: z.number(),
    /** The arch-rival reinvests: a lower draw and bigger houses. */
    drawRate: fraction,
    maxTables: z.number().int().positive(),
  }),
});
export type RivalTuning = z.infer<typeof RivalTuning>;

export const EventsTuning = z.strictObject({
  crisisGraceSeasons: z.number().int().min(0),
  crisisGapSeasons: z.number().int().min(0),
  crisisBaseHazard: fraction,
  crisisMaxPerRun: z.number().int().positive(),
  tributeEverySeasons: z.number().int().positive(),
  vowChance: fraction,
  inspectionChance: fraction,
  rivalPromptChance: fraction,
  managerProposalChance: fraction,
});
export type EventsTuning = z.infer<typeof EventsTuning>;

// ---------------------------------------------------------------- world data

export const City = z.strictObject({
  id: CityId,
  name: z.string().min(1).max(32),
  rivalTaverns: z.number().int().min(0).max(8),
  map: z.strictObject({ x: fraction, y: fraction }),
  palette: z.string().min(1),
  /** Patron arrivals per second at full demand, shared by every tavern in the city. */
  marketSize: z.number().positive(),
  rentPerSeason: z.number().nonnegative(),
  salesTax: fraction,
  foundCost: z.number().nonnegative(),
  lots: z.number().int().positive(),
  brawlMult: z.number().positive(),
  theftMult: z.number().positive(),
  damageMult: z.number().positive(),
  /** Roto: flat fee at the Holiday Keg instead of sales tax. */
  annualFee: z.number().nonnegative(),
  /** Category quality bonuses (Aleforge ale). */
  qualityBonus: z.partialRecord(Category, z.number()).optional(),
  /** Keg cost multipliers by category (Brewers' Lane discount, Circ tonic). */
  kegCostMult: z.partialRecord(Category, z.number()).optional(),
  /** Drinks that are contraband here (Shorelan ban). */
  contraband: z.array(z.string()).default([]),
  /** Roto: drinks marked taboo only sell at night here. */
  tabooAtNightOnly: z.boolean().default(false),
  favor: z.boolean().default(false),
  /** Reputation gain weighting toward quality (Aleforge craft). */
  craftWeight: z.number().min(0).max(1),
  nightThirst: z.number().positive(),
});
export type City = z.infer<typeof City>;
export const Cities = z.array(City).length(4);

export const Mayor = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  from: z.number().int(),
  to: z.number().int(),
  live: z.boolean(),
});
export const Mayors = z.array(Mayor).min(1);
export type Mayor = z.infer<typeof Mayor>;

export const Ingredient = z.strictObject({
  id: IngredientId,
  name: label,
  basePrice: z.number().nonnegative(),
  cityMult: cityRecord(z.number().positive()),
  /** Spiritweed can't be bought; it only comes from vow-trades. */
  buyable: z.boolean(),
});
export type Ingredient = z.infer<typeof Ingredient>;
export const Ingredients = z.array(Ingredient).length(8);

export const Drink = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: label,
  category: Category,
  /** Its own colour on taps, kegs and lists; every drink's must be distinct. */
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  recipe: z.partialRecord(IngredientId, z.number().int().positive()),
  price: z.number().positive(),
  quality: z.number().min(0).max(100),
  brawl: z.number().min(-1).max(2),
  /** Church influence pushed per serving (tonic +, grog −). */
  church: z.number().min(-1).max(1),
  taboo: z.boolean().default(false),
  startIn: z.array(CityId).default([]),
  discover: z.tuple([IngredientId, IngredientId]).optional(),
});
export type Drink = z.infer<typeof Drink>;
export const Drinks = z.array(Drink).min(6);

export const Segment = z.strictObject({
  id: z.string().regex(/^[a-z][a-zA-Z]*$/),
  name: label,
  city: CityId,
  weight: z.number().nonnegative(),
  nightWeight: z.number().nonnegative(),
  spend: z.number().positive(),
  patience: z.number().positive(),
  brawl: z.number().min(0).max(0.5),
  theft: z.number().min(0).max(0.5),
  tip: z.number().min(0).max(1),
  drinks: z.number().positive(),
  prefs: z.partialRecord(Category, z.number()),
  /** Night overrides for Providence's Hangover-bell flip. */
  night: z
    .strictObject({ brawl: z.number().optional(), drinks: z.number().optional(), prefs: z.partialRecord(Category, z.number()).optional() })
    .optional(),
  vip: z.boolean().default(false),
  /** Shanty: tips partly in Favor. */
  favorTips: z.boolean().default(false),
  /** Undercurrent that grows this segment in other cities (church or pirateCulture). */
  diffuses: z.enum(['church', 'pirateCulture']).optional(),
});
export type Segment = z.infer<typeof Segment>;
export const Segments = z.array(Segment).min(8);

export const StaffTier = z.strictObject({
  id: z.enum(['green', 'seasoned', 'master']),
  name: label,
  competence: z.tuple([fraction, fraction]),
  wage: z.number().nonnegative(),
  hireCost: z.number().nonnegative(),
});
export const StaffArchetype = z.strictObject({
  id: z.string(),
  name: label,
  role: Role,
  wageMult: z.number().positive(),
  skim: fraction.default(0),
});
export const StaffData = z.strictObject({
  tiers: z.array(StaffTier).length(3),
  archetypes: z.array(StaffArchetype).min(6),
  managers: cityRecord(label),
  firstNames: z.array(label).min(10),
  epithets: z.array(label).min(5),
  maxStaffPerTavern: z.number().int().positive(),
});
export type StaffData = z.infer<typeof StaffData>;

export const UpgradeEffect = z.strictObject({
  tables: z.number().int().optional(),
  taps: z.number().int().optional(),
  decor: z.number().optional(),
  quality: z.number().optional(),
  qualityCategories: z.array(Category).optional(),
  brawl: z.number().optional(),
  theft: z.number().optional(),
  spoilage: z.number().optional(),
  appeal: z.record(z.string(), z.number()).optional(),
  craftRep: z.number().optional(),
  foundCost: z.number().optional(),
  tunnels: z.boolean().optional(),
  favorTrade: z.boolean().optional(),
  church: z.number().optional(),
});
export const Upgrade = z.strictObject({
  id: z.string(),
  name: label,
  cost: z.number().nonnegative(),
  /** Cost multiplier for each additional purchase of a repeatable upgrade. */
  costGrowth: z.number().min(1).default(1),
  max: z.number().int().positive().default(1),
  scope: z.enum(['tavern', 'company']),
  city: CityId.optional(),
  effects: UpgradeEffect,
});
export type Upgrade = z.infer<typeof Upgrade>;
export const Upgrades = z.array(Upgrade).min(5);

export const Archetype = z.enum(['undercutter', 'snob', 'brawler', 'briber']);
export type Archetype = z.infer<typeof Archetype>;
export const RivalData = z.strictObject({
  tavernNames: cityRecord(z.array(label).min(4)),
  archetypes: z.array(
    z.strictObject({
      id: Archetype,
      name: label,
      priceBias: z.number(),
      qualityBias: z.number(),
      aggression: fraction,
      weights: z.strictObject({
        undercut: z.number(),
        copy: z.number(),
        quality: z.number(),
        promo: z.number(),
        sabotage: z.number(),
        bribe: z.number(),
        poach: z.number(),
        expand: z.number(),
      }),
    }),
  ).length(4),
});
export type RivalData = z.infer<typeof RivalData>;

// ---------------------------------------------------------------- events

export const Effect: z.ZodType<EffectT> = z.lazy(() =>
  z.union([
    z.strictObject({ type: z.literal('duckets'), amount: z.number(), scale: z.enum(['flat', 'cash', 'revenue']).optional() }),
    z.strictObject({ type: z.literal('favor'), amount: z.number() }),
    z.strictObject({ type: z.literal('rep'), amount: z.number(), scope: z.enum(['tavern', 'city', 'network']).optional() }),
    z.strictObject({ type: z.literal('standing'), inst: InstitutionId, amount: z.number() }),
    z.strictObject({ type: z.literal('modifier'), id: z.string(), seasons: z.number().positive(), scope: z.enum(['tavern', 'city', 'global', 'company']).optional() }),
    z.strictObject({ type: z.literal('undercurrent'), key: z.enum(['church', 'farmerTension', 'veilGoodwill', 'pirateCulture', 'consolidation']), amount: z.number() }),
    z.strictObject({ type: z.literal('morale'), amount: z.number() }),
    z.strictObject({ type: z.literal('stock'), fraction: z.number() }),
    z.strictObject({ type: z.literal('spiritweed'), amount: z.number().int() }),
    z.strictObject({ type: z.literal('closeTavern'), seconds: z.number().positive() }),
    z.strictObject({ type: z.literal('loseStaff'), best: z.boolean().optional() }),
    z.strictObject({ type: z.literal('rivalCash'), amount: z.number() }),
    z.strictObject({ type: z.literal('rivalRep'), amount: z.number() }),
    z.strictObject({ type: z.literal('prompt'), id: z.string(), delaySeconds: z.number().nonnegative().optional() }),
    z.strictObject({ type: z.literal('flag'), id: z.string(), value: z.number() }),
    z.strictObject({ type: z.literal('chance'), p: fraction, then: z.array(Effect), else: z.array(Effect).optional() }),
  ]),
);
export type EffectT =
  | { type: 'duckets'; amount: number; scale?: 'flat' | 'cash' | 'revenue' }
  | { type: 'favor'; amount: number }
  | { type: 'rep'; amount: number; scope?: 'tavern' | 'city' | 'network' }
  | { type: 'standing'; inst: InstitutionId; amount: number }
  | { type: 'modifier'; id: string; seasons: number; scope?: 'tavern' | 'city' | 'global' | 'company' }
  | { type: 'undercurrent'; key: 'church' | 'farmerTension' | 'veilGoodwill' | 'pirateCulture' | 'consolidation'; amount: number }
  | { type: 'morale'; amount: number }
  | { type: 'stock'; fraction: number }
  | { type: 'spiritweed'; amount: number }
  | { type: 'closeTavern'; seconds: number }
  | { type: 'loseStaff'; best?: boolean }
  | { type: 'rivalCash'; amount: number }
  | { type: 'rivalRep'; amount: number }
  | { type: 'prompt'; id: string; delaySeconds?: number }
  | { type: 'flag'; id: string; value: number }
  | { type: 'chance'; p: number; then: EffectT[]; else?: EffectT[] };

export const PromptOption = z.strictObject({
  label: z.string().min(1).max(22),
  /** Plain words for what the choice does when its effects alone don't say (e.g. a cost that prevents something). */
  hint: z.string().min(1).max(60).optional(),
  effects: z.array(Effect),
  /** Minimum Duckets needed to pick this option. */
  cost: z.number().nonnegative().optional(),
  /** Favor alternative payment (Shanty). */
  favorCost: z.number().nonnegative().optional(),
});
export const Prompt = z.strictObject({
  id: z.string(),
  title: z.string().min(1).max(34),
  line: shortLine.optional(),
  tier: z.enum(['tactical', 'strategic', 'crisis']),
  scope: z.enum(['tavern', 'city', 'isles']),
  seconds: z.number().positive(),
  tension: z.number().int().min(0).max(3),
  icon: z.string().max(4),
  options: z.array(PromptOption).min(2).max(4),
  defaultOption: z.number().int().min(0),
});
export type Prompt = z.infer<typeof Prompt>;
export const Prompts = z.array(Prompt).min(10);

export const ModifierDef = z.strictObject({
  id: z.string(),
  name: label,
  good: z.boolean(),
  arrivals: z.number().optional(),
  price: z.number().optional(),
  brawl: z.number().optional(),
  theft: z.number().optional(),
  quality: z.number().optional(),
  kegCost: z.number().optional(),
  repGain: z.number().optional(),
  repSwing: z.number().optional(),
  spoilage: z.number().optional(),
  shippingLoss: z.number().optional(),
  tithe: z.number().optional(),
  tabooBlocked: z.boolean().optional(),
  categoryBan: z.array(Category).optional(),
  grainPrice: z.number().optional(),
  tips: z.number().optional(),
});
export type ModifierDef = z.infer<typeof ModifierDef>;
export const Modifiers = z.array(ModifierDef).min(5);

export const Crisis = z.strictObject({
  id: z.string(),
  prompt: z.string(),
  weight: z.number().positive(),
  /** Effects applied the moment the crisis starts, before the player chooses. */
  onStart: z.array(Effect).default([]),
  /** Home city or a player tavern in one of these cities is required (empty = any). */
  cities: z.array(CityId).default([]),
  /** Weight multipliers from undercurrents/standings: key -> [threshold, multiplier]. */
  boosts: z.array(z.strictObject({ key: z.string(), above: z.number().optional(), below: z.number().optional(), mult: z.number().positive() })).default([]),
});
export const Crises = z.array(Crisis).min(8);
export type Crisis = z.infer<typeof Crisis>;

export const Holiday = z.strictObject({
  id: z.string(),
  name: label,
  season: SeasonId.or(z.literal('holidayKeg')),
  cities: z.array(CityId).default([]),
  modifier: z.string(),
});
export const Holidays = z.array(Holiday).min(4);
export type Holiday = z.infer<typeof Holiday>;

// ---------------------------------------------------------------- strings (prose allowed)

export const Letter = z.strictObject({
  placeholder: z.boolean(),
  sealLabel: z.string().min(1).max(60),
  salutation: z.string(),
  paragraphs: z.array(z.string()).min(1),
  signature: z.string(),
  closeLabel: z.string().min(1).max(30),
});
export type Letter = z.infer<typeof Letter>;

export const Rumors = z.record(z.string(), z.array(z.string().min(1).max(90)).min(1));
export const Winds = z.record(z.string(), z.array(z.string().min(1).max(80)).min(1));
export const Finale = z.strictObject({
  placeholder: z.boolean(),
  /** End-screen headings. `{company}` in any line becomes the player's company name; `{winner}` the company chosen instead (losses). */
  titles: z.strictObject({ monopoly: z.string(), sponsor: z.string(), lost: z.string(), bankrupt: z.string() }),
  monopoly: z.array(z.string()).min(1),
  sponsor: z.array(z.string()).min(1),
  lost: z.array(z.string()).min(1),
  bankrupt: z.array(z.string()).min(1),
  freeplayNote: z.string(),
});
export const Tips = z.array(z.string().min(1).max(90)).min(3);

export const ContentSchema = z.strictObject({
  time: TimeTuning,
  economy: EconomyTuning,
  demand: DemandTuning,
  floor: FloorTuning,
  rivalTuning: RivalTuning,
  events: EventsTuning,
  cities: Cities,
  mayors: Mayors,
  ingredients: Ingredients,
  drinks: Drinks,
  segments: Segments,
  staff: StaffData,
  upgrades: Upgrades,
  rivals: RivalData,
  prompts: Prompts,
  modifiers: Modifiers,
  crises: Crises,
  holidays: Holidays,
  letter: Letter,
  rumors: Rumors,
  winds: Winds,
  finale: Finale,
  tips: Tips,
});
export type Content = z.infer<typeof ContentSchema>;

/** Registry used by validate-content and gen-json-schema: data file (relative to src/content/data) -> [content key, schema]. */
export const FILE_SCHEMAS = {
  'tuning/time.json': ['time', TimeTuning],
  'tuning/economy.json': ['economy', EconomyTuning],
  'tuning/demand.json': ['demand', DemandTuning],
  'tuning/floor.json': ['floor', FloorTuning],
  'tuning/rivals.json': ['rivalTuning', RivalTuning],
  'tuning/events.json': ['events', EventsTuning],
  'cities.json': ['cities', Cities],
  'mayors.json': ['mayors', Mayors],
  'ingredients.json': ['ingredients', Ingredients],
  'drinks.json': ['drinks', Drinks],
  'segments.json': ['segments', Segments],
  'staff.json': ['staff', StaffData],
  'upgrades.json': ['upgrades', Upgrades],
  'rivals.json': ['rivals', RivalData],
  'prompts.json': ['prompts', Prompts],
  'modifiers.json': ['modifiers', Modifiers],
  'crises.json': ['crises', Crises],
  'holidays.json': ['holidays', Holidays],
  'strings/letter.json': ['letter', Letter],
  'strings/rumors.json': ['rumors', Rumors],
  'strings/winds.json': ['winds', Winds],
  'strings/finale.json': ['finale', Finale],
  'strings/tips.json': ['tips', Tips],
} as const satisfies Record<string, readonly [keyof Content, z.ZodType]>;

/** Files allowed to contain prose. Everything else is stats and names only. */
export const PROSE_FILES = new Set<string>(['strings/letter.json', 'strings/rumors.json', 'strings/winds.json', 'strings/finale.json', 'strings/tips.json']);
