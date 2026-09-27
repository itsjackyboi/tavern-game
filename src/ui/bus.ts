import { signal } from '@preact/signals';
import type { CityId } from '../content/schema.ts';

// Tiny shared state between the Phaser views, the DOM UI and audio.

export type DrawerId = 'staff' | 'menu' | 'upgrades' | 'research' | 'finance' | 'city' | 'help' | 'network' | null;

export const drawer = signal<DrawerId>(null);
export const selectedCity = signal<CityId | null>(null);
/** Which of your taverns the Staff drawer is managing (null = the one you're in). */
export const staffTavern = signal<string | null>(null);
/** One row per tavern for the Season report card (null = hidden). */
export interface SeasonReportRow { tavernId: string; name: string; town: string; net: number; repDelta: number; served: number; walkouts: number; verdict: string; bad: boolean }
export const seasonReport = signal<{ id: number; rows: SeasonReportRow[] } | null>(null);
export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'good'; count: number; color?: string }
export const toasts = signal<Toast[]>([]);
export const uiFrame = signal(0);
export const hover = signal<string | null>(null);
/** Floor tile the tutorial is pointing at, if any. */
export const tutorialTarget = signal<{ x: number; y: number } | null>(null);

let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
function expire(id: number, ms: number): void {
  clearTimeout(toastTimers.get(id));
  toastTimers.set(id, setTimeout(() => dismissToast(id), ms));
}
export function dismissToast(id: number): void {
  clearTimeout(toastTimers.get(id));
  toastTimers.delete(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
/** Shows a message over the board. Repeats of the same message merge into one with a ×N count. */
export function toast(text: string, kind: 'info' | 'error' | 'good' = 'info', color?: string): void {
  const ms = kind === 'error' ? 4000 : 2800;
  if (kind === 'error') sound('error');
  const same = toasts.value.find((t) => t.text === text && t.kind === kind);
  if (same) {
    toasts.value = toasts.value.map((t) => (t.id === same.id ? { ...t, count: t.count + 1 } : t));
    expire(same.id, ms);
    return;
  }
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-2), { id, text, kind, count: 1, color }];
  expire(id, ms);
}

type SoundListener = (kind: string) => void;
const soundListeners = new Set<SoundListener>();
export function onSound(fn: SoundListener): () => void {
  soundListeners.add(fn);
  return () => soundListeners.delete(fn);
}
export function sound(kind: string): void {
  for (const fn of soundListeners) fn(kind);
}

type CommandListener = (type: string, result: string) => void;
const commandListeners = new Set<CommandListener>();
/** Command results as they come back from the sim (the tutorial watches these). */
export function onCommand(fn: CommandListener): () => void {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}
export function emitCommand(type: string, result: string): void {
  for (const fn of commandListeners) fn(type, result);
}
