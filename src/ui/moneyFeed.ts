import { signal } from '@preact/signals';
import type { GameController } from '../app/controller.ts';
import type { CityId } from '../content/schema.ts';
import { sound } from './bus.ts';
import { townInText } from './townColors.ts';

// Watches the player's money trail and decision receipts, and turns them into
// short notes along the bottom of the board: how much, and why.

export interface MoneyNote { id: number; key: string; detail: string; amount: number; count: number; at: number; city: CityId | null }
export interface Receipt { id: number; title: string; option: string; auto: boolean; parts: string[]; at: number; city: CityId | null }

export const moneyNotes = signal<MoneyNote[]>([]);
/** Notes big enough to show (small trickles still add up in the ledger). */
export const visibleNotes = (notes: MoneyNote[]) => notes.filter((n) => Math.abs(n.amount) >= MIN_NOTE).slice(-4);
export const receipts = signal<Receipt[]>([]);

const NOTE_MS = 5500;
const RECEIPT_MS = 9000;
const MERGE_MS = 2500;
/** Below this a single movement isn't worth a note (the ledger still lists it). */
const MIN_NOTE = 3;

let noteId = 0;

export function bindMoneyFeed(ctrl: GameController): () => void {
  const me = () => ctrl.world.companies[ctrl.world.playerId];
  let lastSeq = me()?.moneySeq ?? 0;
  let lastOutcome = ctrl.world.prompts.outcomeSeq;
  const prune = () => {
    const now = performance.now();
    const n = moneyNotes.value.filter((x) => now - x.at < NOTE_MS);
    if (n.length !== moneyNotes.value.length) moneyNotes.value = n;
    const r = receipts.value.filter((x) => now - x.at < RECEIPT_MS);
    if (r.length !== receipts.value.length) receipts.value = r;
  };
  const timer = window.setInterval(prune, 500);
  const unsub = ctrl.subscribe(() => {
    const co = me();
    if (!co) return;
    const now = performance.now();
    if (co.moneySeq !== lastSeq) {
      const fresh = co.recent.filter((e) => e.seq > lastSeq);
      lastSeq = co.moneySeq;
      let notes = [...moneyNotes.value];
      for (const e of fresh) {
        if (e.key === 'Decisions') continue; // the decision receipt says it better
        const same = notes.find((n) => n.key === e.key && now - n.at < MERGE_MS);
        if (same) {
          const merged = { ...same, amount: same.amount + e.amount, count: same.count + (same.detail === e.detail ? 0 : 1), at: now };
          notes = notes.map((n) => (n.id === same.id ? merged : n));
        } else {
          notes.push({ id: ++noteId, key: e.key, detail: e.detail, amount: e.amount, count: 1, at: now, city: townInText(ctrl.world, e.detail) });
        }
      }
      moneyNotes.value = notes.slice(-8);
    }
    const out = ctrl.world.prompts.outcomes;
    if (ctrl.world.prompts.outcomeSeq !== lastOutcome) {
      const fresh = out.filter((o) => o.seq > lastOutcome);
      lastOutcome = ctrl.world.prompts.outcomeSeq;
      if (fresh.length) {
        receipts.value = [...receipts.value, ...fresh.map((o) => ({ id: o.seq, title: o.title, option: o.option, auto: o.auto, parts: o.parts, at: now, city: o.city ?? townInText(ctrl.world, o.title) }))].slice(-2);
        if (fresh.some((o) => o.auto)) sound('alert');
      }
    }
  });
  return () => {
    window.clearInterval(timer);
    unsub();
    moneyNotes.value = [];
    receipts.value = [];
  };
}
