import { z } from 'zod';

// Content schemas. Every object is strict, so unknown keys are rejected.
// There are deliberately NO free-text description fields: UI descriptions are
// generated from stats, which keeps lore prose out of live play (see docs/PLAN.md §3).
// The only prose lives in strings/letter.json (and later the finale script).

export const CityId = z.enum(['aleforge', 'shanty', 'providence', 'roto']);
export type CityId = z.infer<typeof CityId>;

export const SeasonId = z.enum(['stormtide', 'goldsun', 'veilfrost']);
export type SeasonId = z.infer<typeof SeasonId>;

const ticks = z.number().int().positive();
const fraction = z.number().min(0).max(1);

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
  /** Starting Duckets for the player's flagship. */
  startingDuckets: z.number().int().nonnegative(),
});
export type EconomyTuning = z.infer<typeof EconomyTuning>;

export const City = z.strictObject({
  id: CityId,
  name: z.string().min(1).max(32),
  /** Rival taverns present at the start of a run. */
  rivalTaverns: z.number().int().min(0).max(8),
  /** Map position on the world map, in 0..1 of map width/height. Relative geography only. */
  map: z.strictObject({ x: fraction, y: fraction }),
  /** Palette key (see src/art/palettes.ts). */
  palette: z.string().min(1),
});
export type City = z.infer<typeof City>;

export const Cities = z.array(City).length(4);

export const Mayor = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  /** In-office years for this game. Not canon dates; tunable. */
  from: z.number().int(),
  to: z.number().int(),
  live: z.boolean(),
});
export const Mayors = z.array(Mayor).min(1);
export type Mayor = z.infer<typeof Mayor>;

export const Letter = z.strictObject({
  /** True while the owner's real copy has not been dropped in yet. */
  placeholder: z.boolean(),
  sealLabel: z.string().min(1).max(60),
  salutation: z.string(),
  paragraphs: z.array(z.string()).min(1),
  signature: z.string(),
  closeLabel: z.string().min(1).max(30),
});
export type Letter = z.infer<typeof Letter>;

export const ContentSchema = z.strictObject({
  time: TimeTuning,
  economy: EconomyTuning,
  cities: Cities,
  mayors: Mayors,
  letter: Letter,
});
export type Content = z.infer<typeof ContentSchema>;

/** Registry used by validate-content and gen-json-schema: data file (relative to src/content/data) -> schema. */
export const FILE_SCHEMAS = {
  'tuning/time.json': TimeTuning,
  'tuning/economy.json': EconomyTuning,
  'cities.json': Cities,
  'mayors.json': Mayors,
  'strings/letter.json': Letter,
} as const;

/** Files allowed to contain prose. Everything else is stats and names only. */
export const PROSE_FILES = new Set<string>(['strings/letter.json']);
