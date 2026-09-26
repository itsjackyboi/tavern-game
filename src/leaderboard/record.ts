import type { GameController } from '../app/controller.ts';
import { contentHash } from '../app/save.ts';
import { player, playerTaverns } from '../sim/lookup.ts';
import { APP_VERSION } from '../version.ts';
import { clientId } from './outbox.ts';
import type { RunRecord } from './types.ts';

const ms = (tick: number | null) => (tick === null ? null : tick * 50);

/** Builds the record for a finished run (won, lost or bankrupt). */
export function buildRecord(ctrl: GameController, name: string): RunRecord {
  const w = ctrl.world;
  const r = w.run;
  const category = w.meta.ngPlus > 0 ? 'ngplus' : w.meta.timerScale > 1 ? 'assisted' : 'standard';
  return {
    runId: `${w.meta.seed}-${w.tick.toString(36)}-${clientId().slice(2, 10)}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64).padEnd(6, '0'),
    clientId: clientId(),
    name: name.trim().slice(0, 16),
    tavernName: (playerTaverns(w)[0]?.name ?? 'The Last Call').trim().slice(0, 28),
    homeCity: w.meta.homeCity,
    category,
    result: r.status === 'won' ? (r.winType ?? 'sponsor') : r.status === 'bankrupt' ? 'bankrupt' : 'lost',
    monopolyMs: r.status === 'won' && r.winType === 'monopoly' ? ms(r.splits.monopoly) : null,
    finalCV: Math.max(0, r.finalCV ?? player(w).cv),
    peakCV: Math.max(0, r.peakCV, r.finalCV ?? 0),
    splits: { firstSisterMs: ms(r.splits.firstSister), thirdSisterMs: ms(r.splits.thirdSister), firstNo1Ms: ms(r.splits.firstNo1) },
    simMs: ctrl.clock.simMs,
    realMs: ctrl.clock.simMs,
    pauses: ctrl.clock.pauses,
    sessions: ctrl.clock.sessions,
    seed: w.meta.seed,
    version: APP_VERSION,
    contentHash: contentHash(),
    date: new Date().toISOString(),
  };
}
