import type { CityId } from '../content/schema.ts';

// Every player (or bot) input becomes a Command, applied at the next tick.
// This keeps the sim replayable from seed + command log.

export type Command =
  | { type: 'focus'; city: CityId }
  | { type: 'setView'; view: 'floor' | 'world' };

export interface TimedCommand {
  tick: number;
  cmd: Command;
}
