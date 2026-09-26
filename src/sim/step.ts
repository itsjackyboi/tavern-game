import type { Content } from '../content/schema.ts';
import type { Command } from './commands.ts';
import type { World } from './world.ts';

// One fixed sim tick (1/20 s). Systems run in a fixed order (docs/PLAN.md §4);
// M0 only has time and command handling. Later milestones add systems here in order.

export function applyCommand(world: World, cmd: Command): void {
  switch (cmd.type) {
    case 'focus':
      world.focus.city = cmd.city;
      break;
    case 'setView':
      world.focus.view = cmd.view;
      break;
  }
}

export function stepWorld(world: World, _content: Content, cmds: readonly Command[]): void {
  for (const cmd of cmds) applyCommand(world, cmd);
  world.tick += 1;
}
