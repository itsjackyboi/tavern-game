import { signal } from '@preact/signals';
import type { GameController } from '../../app/controller.ts';
import { lcValidateRecord } from '../../leaderboard/shared/validate.js';
import { getAdapter, savedName, saveName, submitRun } from '../../leaderboard/outbox.ts';
import { eraOf } from '../../leaderboard/rank.ts';
import { buildRecord } from '../../leaderboard/record.ts';
import { APP_VERSION } from '../../version.ts';

// Every finished run is sent to the sheet automatically (debug and tutorial
// runs aside). Only wins can reach the top tens.

export type SubmissionState = 'idle' | 'sending' | 'sent' | 'queued' | 'local' | 'needName' | 'error';
export const submission = signal<{ state: SubmissionState; error?: string }>({ state: 'idle' });

const lbMock = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('lbmock');

export function recordsLabel(): string {
  return eraOf(APP_VERSION) === 'official' ? 'official records' : 'pre-release records';
}

/** Whether this run goes to the leaderboard at all. */
export function isRanked(ctrl: GameController): boolean {
  return (!ctrl.debug && !ctrl.tutorial) || lbMock();
}

/** Sends a finished run under `name` (the innkeeper's). */
export async function sendRun(ctrl: GameController, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) {
    submission.value = { state: 'needName' };
    return;
  }
  const rec = buildRecord(ctrl, clean);
  const bad = lcValidateRecord(rec);
  if (bad) {
    submission.value = bad === 'bad name' ? { state: 'needName', error: 'Names: 1–16 letters, numbers, spaces, . _ \' -' } : { state: 'error', error: bad };
    return;
  }
  saveName(clean);
  submission.value = { state: 'sending' };
  const res = await submitRun(rec);
  submission.value = { state: !getAdapter().shared ? 'local' : res === 'sent' ? 'sent' : 'queued' };
}

/** Called once when a run ends. */
export function autoSubmit(ctrl: GameController): void {
  if (!isRanked(ctrl)) return;
  void sendRun(ctrl, ctrl.world.meta.playerName || savedName());
}
