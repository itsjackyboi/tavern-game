import { ContentSchema, type Content } from './schema.ts';
import time from './data/tuning/time.json';
import economy from './data/tuning/economy.json';
import demand from './data/tuning/demand.json';
import floor from './data/tuning/floor.json';
import rivalTuning from './data/tuning/rivals.json';
import events from './data/tuning/events.json';
import cities from './data/cities.json';
import mayors from './data/mayors.json';
import ingredients from './data/ingredients.json';
import drinks from './data/drinks.json';
import segments from './data/segments.json';
import staff from './data/staff.json';
import upgrades from './data/upgrades.json';
import rivals from './data/rivals.json';
import prompts from './data/prompts.json';
import modifiers from './data/modifiers.json';
import crises from './data/crises.json';
import holidays from './data/holidays.json';
import letter from './data/strings/letter.json';
import rumors from './data/strings/rumors.json';
import winds from './data/strings/winds.json';
import finale from './data/strings/finale.json';
import tips from './data/strings/tips.json';

export const RAW_CONTENT = {
  time, economy, demand, floor, rivalTuning, events, cities, mayors, ingredients, drinks, segments, staff,
  upgrades, rivals, prompts, modifiers, crises, holidays, letter, rumors, winds, finale, tips,
};

let cached: Content | null = null;

/** Parses and validates all bundled content (cached). Throws a readable zod error on bad data. */
export function loadContent(): Content {
  if (!cached) cached = ContentSchema.parse(RAW_CONTENT);
  return cached;
}

export type { Content };
