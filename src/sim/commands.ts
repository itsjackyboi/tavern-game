import type { CityId, IngredientId } from '../content/schema.ts';
import type { FloorCommand } from './floor/floor.ts';
import type { Company, Staff } from './types.ts';

// Every player (or bot) input becomes a Command, applied at the next tick.
// This keeps the sim replayable from seed + command log.

export type Command =
  | FloorCommand
  | { type: 'focus'; tavernId: string }
  | { type: 'setView'; view: 'floor' | 'world' }
  | { type: 'hire'; tavernId: string; archetype: string; tier: Staff['tier'] }
  | { type: 'hireManager'; tavernId: string; tier: Staff['tier'] }
  | { type: 'fire'; staffId: string }
  | { type: 'train'; staffId: string }
  | { type: 'raise'; staffId: string }
  | { type: 'setMenu'; tavernId: string; drinkIds: string[] }
  | { type: 'setPrice'; tavernId: string; drinkId: string; mult: number }
  | { type: 'orderKegs'; tavernId: string; drinkId: string; kegs: number }
  | { type: 'setRestock'; tavernId: string; auto: boolean; target: number }
  | { type: 'upgrade'; tavernId: string | null; upgradeId: string }
  | { type: 'research'; a: IngredientId; b: IngredientId }
  | { type: 'found'; city: CityId }
  | { type: 'ship'; fromId: string; toId: string; drinkId: string; kegs: number; insured: boolean }
  | { type: 'grain'; source: Company['grainSource'] }
  | { type: 'answer'; uid: number; option: number }
  | { type: 'loan'; amount: number }
  | { type: 'repay'; amount: number }
  | { type: 'freeplay' }
  | { type: 'transferStaff'; staffId: string; tavernId: string }
  | { type: 'addSupplyLine'; fromId: string; toId: string; drinkId: string; keepAt: number; insured: boolean }
  | { type: 'removeSupplyLine'; id: string };

export interface TimedCommand {
  tick: number;
  cmd: Command;
}
