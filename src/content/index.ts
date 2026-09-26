import { ContentSchema, type Content } from './schema.ts';
import time from './data/tuning/time.json';
import economy from './data/tuning/economy.json';
import cities from './data/cities.json';
import mayors from './data/mayors.json';
import letter from './data/strings/letter.json';

/** Parses and validates all bundled content. Throws a readable zod error on bad data. */
export function loadContent(): Content {
  return ContentSchema.parse({ time, economy, cities, mayors, letter });
}

export type { Content };
