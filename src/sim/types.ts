import type { Archetype, CityId, IngredientId, InstitutionId, SeasonId } from '../content/schema.ts';
import type { RngState } from './rng.ts';

// Every type here is plain JSON: the whole World is the save file.

export type Id = string;

export interface MenuItem {
  drinkId: string;
  /** Price multiplier on the drink's base price (0.6 to 1.8). */
  price: number;
}

export interface KegOrder {
  drinkId: string;
  kegs: number;
  arriveTick: number;
}

export type TavernStatus = 'building' | 'establishing' | 'established' | 'struggling' | 'closed';

export interface TavernKpi {
  revenue: number;
  costs: number;
  served: number;
  walkouts: number;
  brawls: number;
  thefts: number;
  satSum: number;
  satN: number;
  /** Servings by drink this season (drives undercurrents and rival tracking). */
  byDrink: Record<string, number>;
}

export interface Tavern {
  id: Id;
  companyId: Id;
  city: CityId;
  name: string;
  status: TavernStatus;
  openTick: number;
  tables: number;
  taps: number;
  decor: number;
  upgrades: Record<string, number>;
  menu: MenuItem[];
  cellar: Record<string, number>;
  tapLevels: Record<string, number>;
  orders: KegOrder[];
  autoRestock: boolean;
  restockTarget: number;
  rep: number;
  /** Player taverns: reputation sampled every 5 s, oldest first (last minute). */
  repTrail?: number[];
  /** Reputation when the current season began (for the season report). */
  repAtSeasonStart?: number;
  /** How much reputation moved over the last full season. */
  lastRepDelta?: number;
  managerId: Id | null;
  attention: number;
  closedUntil: number;
  agg: { occupancy: number; backlog: number };
  demand: { rate: number; segRates: Record<string, number> };
  kpi: TavernKpi;
  lastKpi: TavernKpi | null;
  assetValue: number;
  /** Consecutive seasons this tavern met the Top-of-the-Isles stability bar. */
  stableSeasons: number;
  regulars: string[];
  /** Rival flavour: quality and price bias from its archetype. */
  qualityBias: number;
  priceBias: number;
  factions: Record<string, number>;
}

export interface Staff {
  id: Id;
  name: string;
  archetype: string;
  role: 'bar' | 'floor' | 'door' | 'cellar' | 'stage' | 'intel' | 'manage';
  tier: 'green' | 'seasoned' | 'master';
  competence: number;
  wage: number;
  morale: number;
  fatigue: number;
  tavernId: Id;
  hiredTick: number;
  raiseAsked: number;
}

export type Mood = 'confident' | 'pressured' | 'desperate';

export interface RivalBrain {
  archetype: Archetype;
  aggression: number;
  secrecy: number;
  mood: Mood;
  moodSince: number;
  knowledge: Record<CityId, number>;
  nextDecisionTick: number;
  negativeSince: number | null;
  isArch: boolean;
  tier: 0 | 1 | 2;
  /** Share baseline (EMA) used to decide when it feels pressured. */
  shareBaseline: number;
}

export interface Ledger {
  revenue: number;
  kegs: number;
  wages: number;
  rent: number;
  tax: number;
  other: number;
}

/** One entry in the player's money trail: what the Duckets were for. */
export interface MoneyEntry {
  seq: number;
  key: string;
  detail: string;
  amount: number;
}

/** A finished year's money, for the ledger's year-over-year chart. */
export interface YearRecord {
  year: number;
  income: number;
  spending: number;
  profit: number;
}

export interface Company {
  id: Id;
  name: string;
  isPlayer: boolean;
  cash: number;
  favor: number;
  debt: number;
  spiritweed: number;
  unlocked: string[];
  upgrades: Record<string, number>;
  grainSource: 'cumstead' | 'mixed' | 'smallholders';
  profitYear: number;
  seasonProfit: number;
  ledger: Ledger;
  lastLedger: Ledger | null;
  cv: number;
  cvHistory: number[];
  rival: RivalBrain | null;
  /** Player only: signed Duckets by reason, since the run began and this year. Loans are financing, not profit. */
  flows: Record<string, number>;
  flowsYear: Record<string, number>;
  /** Player only: the latest money movements (sales excluded), newest last. */
  recent: MoneyEntry[];
  moneySeq: number;
  yearHistory: YearRecord[];
}

export interface CityState {
  /** Ingredient price shocks around 1.0. */
  shock: Record<IngredientId, number>;
  /** Keg-price index history for the price board (sampled). */
  history: Record<IngredientId, number[]>;
  segWeights: Record<string, number>;
  tributeDueShift: number;
}

export interface Undercurrents {
  church: Record<CityId, number>;
  pirateCulture: Record<CityId, number>;
  farmerTension: number;
  veilGoodwill: number;
  consolidation: number;
  cumsteadDependency: number;
  /** Last value reported by the Cultural Winds, per key. */
  notified: Record<string, number>;
  lastWindShift: number;
  vowThisYear: boolean;
}

export type ModScope = 'tavern' | 'city' | 'global' | 'company';

export interface ActiveModifier {
  id: string;
  scope: ModScope;
  /** Tavern id, city id or company id depending on scope. */
  target: string;
  untilTick: number;
}

/** What a decision actually did, for the receipt the player sees. */
export interface PromptOutcome {
  seq: number;
  title: string;
  option: string;
  auto: boolean;
  parts: string[];
}

export interface ActivePrompt {
  uid: number;
  defId: string;
  tavernId: Id | null;
  city: CityId | null;
  vars: Record<string, string>;
  createdTick: number;
  expiresTick: number;
  /** Staff or rival the prompt is about. */
  subjectId: Id | null;
  /** Manager-proposal default override. */
  defaultOverride: number | null;
}

export interface PendingPrompt {
  defId: string;
  atTick: number;
  tavernId: Id | null;
  city: CityId | null;
  vars: Record<string, string>;
  subjectId: Id | null;
}

export interface Shipment {
  id: Id;
  fromId: Id;
  toId: Id;
  drinkId: string;
  kegs: number;
  departTick: number;
  arriveTick: number;
  insured: boolean;
  value: number;
  lost: boolean;
}

/** Keep a tavern stocked with one drink from another of your taverns, by sea. */
export interface SupplyLine {
  id: Id;
  fromId: Id;
  toId: Id;
  drinkId: string;
  /** Top the destination up to this many kegs (cellar + at sea). */
  keepAt: number;
  insured: boolean;
  /** Kegs bought at the source for this line and not yet shipped. */
  bought: number;
}

export interface LogEntry {
  tick: number;
  kind: 'rumor' | 'news' | 'wind' | 'intel' | 'event' | 'alert';
  text: string;
  city: CityId | null;
}

export interface FxEvent {
  tick: number;
  kind: 'coin' | 'tip' | 'clink' | 'brawl' | 'thud' | 'steal' | 'caught' | 'walkout' | 'vip' | 'greet' | 'pour' | 'restock' | 'bell' | 'error' | 'seat' | 'calm';
  x: number;
  y: number;
  value: number;
}

// ---------------------------------------------------------------- floor

export interface Pos {
  x: number;
  y: number;
}

export type PatronState =
  | 'arriving'
  | 'waiting'
  | 'toSeat'
  | 'seated'
  | 'ordered'
  | 'drinking'
  | 'brawling'
  | 'sneaking'
  | 'leaving'
  | 'gone';

export interface Patron {
  id: number;
  seg: string;
  state: PatronState;
  x: number;
  y: number;
  tx: number;
  ty: number;
  tableId: number;
  seat: number;
  drinkId: string | null;
  timer: number;
  patience: number;
  patienceMax: number;
  drinksLeft: number;
  sat: number;
  satN: number;
  vip: boolean;
  greeted: boolean;
  thief: boolean;
  regular: string | null;
  look: number;
  claimedBy: number;
  queueSlot: number;
  angry: boolean;
}

export interface FloorTable {
  id: number;
  x: number;
  y: number;
  seats: [number, number];
  dirty: boolean;
  claimedBy: number;
}

export interface Tap {
  drinkId: string;
  x: number;
  y: number;
  claimedBy: number;
}

export type Task =
  | { kind: 'serve'; patronId: number; drinkId: string; stage: 'toTap' | 'pour' | 'toPatron' }
  | { kind: 'restock'; drinkId: string; stage: 'toCellar' | 'grab' | 'toTap' | 'install' }
  | { kind: 'clear'; tableId: number; stage: 'go' | 'work' }
  | { kind: 'seat'; patronId: number; tableId: number; stage: 'go' | 'lead' }
  | { kind: 'brawl'; incidentId: number; stage: 'go' }
  | { kind: 'thief'; patronId: number; stage: 'go' }
  | { kind: 'greet'; patronId: number; stage: 'go' };

export interface Worker {
  id: number;
  kind: 'owner' | 'staff';
  staffId: Id | null;
  role: Staff['role'] | 'owner';
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  task: Task | null;
  queue: Task[];
  timer: number;
  carrying: string | null;
  cooldown: number;
}

export interface Incident {
  id: number;
  kind: 'brawl';
  patronIds: [number, number];
  x: number;
  y: number;
  deadline: number;
  claimedBy: number;
}

export interface FloorState {
  tavernId: Id;
  tables: FloorTable[];
  taps: Tap[];
  patrons: Patron[];
  workers: Worker[];
  incidents: Incident[];
  nextId: number;
  spawnAcc: number;
  lastCallRung: boolean;
  shiftIndex: number;
  /** World tick when closing time began holding the calendar for the last patrons (optional for older saves). */
  closingSince?: number;
}

// ---------------------------------------------------------------- run

export type RunStatus = 'playing' | 'won' | 'lost' | 'bankrupt' | 'freeplay';

export interface RunState {
  status: RunStatus;
  winType: 'monopoly' | 'sponsor' | null;
  endTick: number | null;
  splits: { firstSister: number | null; thirdSister: number | null; firstNo1: number | null; monopoly: number | null };
  peakCV: number;
  finalCV: number | null;
  lowCashSince: number | null;
  /** True once the Year-463 verdict has been reached (even in freeplay). */
  verdictDone: boolean;
  chosen: boolean;
}

export interface EventState {
  /** Seasons closed so far (the UI announces each one once). Optional for older saves. */
  seasonsClosed?: number;
  crisesFired: string[];
  lastCrisisShift: number;
  holiday: { id: string; shift: number } | null;
  flags: Record<string, number>;
  erasFired: string[];
  lastShift: number;
  lastYear: number;
  lastSegment: string;
}

export interface World {
  meta: {
    v: number;
    seed: string;
    homeCity: CityId;
    /** Prompt/incident timer multiplier (Assisted mode is > 1). */
    timerScale: number;
    ngPlus: number;
    /** The innkeeper's name (optional for older saves). */
    playerName?: string;
  };
  tick: number;
  /** Ticks the calendar has waited at closing time for the last patrons to leave. Optional for older saves. */
  clockHold?: number;
  rng: Record<string, RngState>;
  focus: { tavernId: Id; view: 'floor' | 'world' };
  playerId: Id;
  companies: Record<Id, Company>;
  taverns: Record<Id, Tavern>;
  staff: Record<Id, Staff>;
  cities: Record<CityId, CityState>;
  institutions: Record<InstitutionId, number>;
  undercurrents: Undercurrents;
  modifiers: ActiveModifier[];
  prompts: { active: ActivePrompt[]; pending: PendingPrompt[]; nextUid: number; answered: number; missed: number; outcomes: PromptOutcome[]; outcomeSeq: number };
  shipments: Shipment[];
  /** Standing supply lines between the player's taverns (optional for older saves). */
  supplyLines?: SupplyLine[];
  floor: FloorState | null;
  log: LogEntry[];
  fx: FxEvent[];
  events: EventState;
  run: RunState;
  research: { tried: string[] };
  /** What's working for the player: share EMAs keyed "city:category". Rivals read this (with noise). */
  tracking: Record<string, { fast: number; slow: number }>;
  nextId: number;
  seasonIndexSeen: SeasonId | 'holidayKeg';
}
