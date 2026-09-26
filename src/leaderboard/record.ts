import type { GameController } from '../app/controller.ts';
import { contentHash } from '../app/save.ts';
import { player } from '../sim/lookup.ts';
import { BUILD } from './config.ts';
import { clientId } from './outbox.ts';
import type { RunRecord } from './types.ts';

const ms = (tick: number | null) => (tick === null ? null : tick * 50);

/** Builds the leaderboard record for a finished, winning run. */
export function buildRecord(ctrl: GameController, name: string): RunRecord {
  const w = ctrl.world;
  const r = w.run;
  const category = w.meta.ngPlus > 0 ? 'ngplus' : w.meta.timerScale > 1 ? 'assisted' : 'standard';
  return {
    runId: `${w.meta.seed}-${w.tick.toString(36)}-${clientId().slice(2, 10)}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64).padEnd(6, '0'),
    clientId: clientId(),
    name: name.trim().slice(0, 16),
    homeCity: w.meta.homeCity,
    category,
    winType: r.winType ?? 'sponsor',
    monopolyMs: r.winType === 'monopoly' ? ms(r.splits.monopoly) : null,
    finalCV: Math.max(0, r.finalCV ?? player(w).cv),
    peakCV: Math.max(0, r.peakCV, r.finalCV ?? 0),
    splits: { firstSisterMs: ms(r.splits.firstSister), thirdSisterMs: ms(r.splits.thirdSister), firstNo1Ms: ms(r.splits.firstNo1) },
    simMs: ctrl.clock.simMs,
    realMs: ctrl.clock.simMs,
    pauses: ctrl.clock.pauses,
    sessions: ctrl.clock.sessions,
    seed: w.meta.seed,
    build: BUILD,
    contentHash: contentHash(),
    date: new Date().toISOString(),
  };
}
