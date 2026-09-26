import { signal } from '@preact/signals';
import type { CityId } from '../content/schema.ts';

// Tiny shared state between the Phaser views, the DOM UI and audio.

export type DrawerId = 'staff' | 'menu' | 'upgrades' | 'research' | 'finance' | 'city' | 'help' | null;

export const drawer = signal<DrawerId>(null);
export const selectedCity = signal<CityId | null>(null);
export const toasts = signal<Array<{ id: number; text: string; kind: 'info' | 'error' | 'good' }>>([]);
export const uiFrame = signal(0);
export const hover = signal<string | null>(null);

let toastId = 0;
export function toast(text: string, kind: 'info' | 'error' | 'good' = 'info'): void {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-3), { id, text, kind }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 2600);
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
