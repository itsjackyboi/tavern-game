import type { Content } from '../content/schema.ts';
import { buyUpgrade, research, setFocus, setGrainSource, setMenu, setPrice, setRestock } from './actions.ts';
import { stepAggregate } from './aggregate.ts';
import type { Command } from './commands.ts';
import { closeSeason, closeYear, repayLoan, takeLoan, updateCV } from './company.ts';
import { updateDemand, updatePrices } from './economy/market.ts';
import { orderKegs, spoilKegs, stepOrders } from './economy/orders.ts';
import { onLastCall, onSegmentStart, raiseRequests } from './events.ts';
import { applyFloorCommand, stepFloor, type FloorCommand } from './floor/floor.ts';
import { player } from './lookup.ts';
import { enterFreeplay, foundTavern, stepLifecycle, stepRun } from './network.ts';
import { answerPrompt, stepPrompts } from './prompts.ts';
import { seasonRivals, stepRivals } from './rivals.ts';
import { ship, stepShipping } from './shipping.ts';
import { fireStaff, giveRaise, hireManager, hireStaff, seasonStaff, trainStaff } from './staff.ts';
import { calendarAt } from './time.ts';
import type { World } from './types.ts';
import { cultureWinds, seasonUndercurrents, yearUndercurrents } from './undercurrents.ts';

// One fixed sim tick (1/20 s). Systems run in a fixed order (docs/PLAN.md §4).

export interface CommandResult {
  cmd: Command;
  result: string;
}

const FLOOR_CMDS = new Set(['seat', 'serve', 'restock', 'clear', 'breakBrawl', 'catchThief', 'greet', 'cancelQueue', 'ringBell']);

export function applyCommand(w: World, c: Content, cmd: Command): string {
  const ended = w.run.status === 'won' || w.run.status === 'lost' || w.run.status === 'bankrupt';
  if (ended && cmd.type !== 'freeplay') return 'ended';
  if (FLOOR_CMDS.has(cmd.type)) {
    applyFloorCommand(w, c, cmd as FloorCommand);
    return 'ok';
  }
  const tv = (id: string) => w.taverns[id];
  switch (cmd.type) {
    case 'focus': return setFocus(w, c, cmd.tavernId) ? 'ok' : 'bad';
    case 'setView': w.focus.view = cmd.view; return 'ok';
    case 'hire': { const t = tv(cmd.tavernId); return t ? hireStaff(w, c, t, cmd.archetype, cmd.tier) : 'bad'; }
    case 'hireManager': { const t = tv(cmd.tavernId); return t ? hireManager(w, c, t, cmd.tier) : 'bad'; }
    case 'fire': fireStaff(w, c, cmd.staffId); return 'ok';
    case 'train': return trainStaff(w, c, cmd.staffId) ? 'ok' : 'cash';
    case 'raise': return giveRaise(w, cmd.staffId) ? 'ok' : 'bad';
    case 'setMenu': return setMenu(w, c, cmd.tavernId, cmd.drinkIds);
    case 'setPrice': setPrice(w, cmd.tavernId, cmd.drinkId, cmd.mult); return 'ok';
    case 'orderKegs': { const t = tv(cmd.tavernId); return t && t.companyId === w.playerId ? orderKegs(w, c, t, cmd.drinkId, cmd.kegs) : 'bad'; }
    case 'setRestock': setRestock(w, cmd.tavernId, cmd.auto, cmd.target); return 'ok';
    case 'upgrade': return buyUpgrade(w, c, cmd.tavernId, cmd.upgradeId);
    case 'research': return research(w, c, cmd.a, cmd.b).status;
    case 'found': return foundTavern(w, c, cmd.city);
    case 'ship': return ship(w, c, cmd.fromId, cmd.toId, cmd.drinkId, cmd.kegs, cmd.insured);
    case 'grain': setGrainSource(w, cmd.source); return 'ok';
    case 'answer': return answerPrompt(w, c, cmd.uid, cmd.option);
    case 'loan': return takeLoan(c, player(w), cmd.amount) ? 'ok' : 'cap';
    case 'repay': return repayLoan(player(w), cmd.amount) ? 'ok' : 'cash';
    case 'freeplay': enterFreeplay(w); return 'ok';
    default: return 'bad';
  }
}

function segmentKey(cal: ReturnType<typeof calendarAt>): string {
  return `${cal.year}:${cal.segment}`;
}

export function stepWorld(w: World, c: Content, cmds: readonly Command[]): CommandResult[] {
  const results: CommandResult[] = [];
  for (const cmd of cmds) results.push({ cmd, result: applyCommand(w, c, cmd) });
  const status = w.run.status;
  if (status === 'won' || status === 'lost' || status === 'bankrupt') return results;

  w.tick += 1;
  const cal = calendarAt(w.tick, c.time);

  // Segment boundaries: close the old season/year, open the new one.
  const key = segmentKey(cal);
  if (key !== w.events.lastSegment) {
    const prevWasSeason = w.seasonIndexSeen !== 'holidayKeg';
    if (prevWasSeason && w.tick > 1) {
      seasonUndercurrents(w, c);
      const asks = seasonStaff(w, c);
      seasonRivals(w, c);
      closeSeason(w, c);
      spoilKegs(w, c);
      raiseRequests(w, c, asks);
      cultureWinds(w, c, cal.shiftIndex);
    }
    if (cal.segment === 'stormtide' && w.seasonIndexSeen === 'holidayKeg') {
      closeYear(w, c);
      yearUndercurrents(w);
    }
    w.events.lastSegment = key;
    w.seasonIndexSeen = cal.segment;
    onSegmentStart(w, c, cal);
  }
  if (cal.phase === 'lastCall' && cal.segmentTick === cal.segmentTicks - c.time.lastCallTicks) onLastCall(w, c);

  // 1 Hz systems (offset so the very first tick has demand).
  if (w.tick % 20 === 1) {
    updatePrices(w, c);
    updateDemand(w, c);
    stepOrders(w, c);
    for (const t of Object.values(w.taverns)) {
      if (t.status === 'closed' || t.status === 'building') continue;
      if (w.floor && w.floor.tavernId === t.id) continue;
      stepAggregate(w, c, t);
    }
    stepShipping(w, c);
    stepLifecycle(w, c);
    stepPrompts(w, c);
    stepRivals(w, c);
    updateCV(w, c);
    stepRun(w, c);
  }

  // The focused floor runs agent by agent, every tick.
  if (w.floor) stepFloor(w, c);
  if (w.modifiers.length > 40 || w.tick % 400 === 0) w.modifiers = w.modifiers.filter((m) => m.untilTick > w.tick);
  return results;
}
