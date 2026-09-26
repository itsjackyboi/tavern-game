import type { CityId, Content } from '../content/schema.ts';
import { cityOf, fmt } from './lookup.ts';
import { pick } from './rng.ts';
import type { LogEntry, World } from './types.ts';

// The rumour mill and event log: short lines, newest last, capped.

export function log(w: World, kind: LogEntry['kind'], text: string, city: CityId | null = null): void {
  w.log.push({ tick: w.tick, kind, text, city });
  if (w.log.length > 60) w.log.splice(0, w.log.length - 60);
}

/** Logs a random line from a rumour template group, filling {city} and any extra vars. */
export function rumor(w: World, c: Content, group: string, city: CityId | null, vars: Record<string, string> = {}, kind: LogEntry['kind'] = 'rumor'): void {
  const lines = c.rumors[group];
  if (!lines?.length) return;
  const text = fmt(pick(w, 'log', lines), { city: city ? cityOf(c, city).name : 'the Isles', ...vars });
  log(w, kind, text, city);
}
