import { RAW_CONTENT } from '../content/index.ts';
import { hashValue } from '../sim/hash.ts';
import type { World } from '../sim/types.ts';
import { WORLD_VERSION } from '../sim/world.ts';

// One continuous save slot (no save-scumming): written at every season
// rollover, when the tab is hidden and on pagehide. Continue or Abandon only.

const KEY = 'last-call:save';

export interface SaveFile {
  v: number;
  contentHash: string;
  clock: { pauses: number; sessions: number };
  world: World;
}

let contentHashCache: string | null = null;
export function contentHash(): string {
  contentHashCache ??= hashValue(RAW_CONTENT);
  return contentHashCache;
}

async function compress(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return `raw:${text}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `gz:${btoa(bin)}`;
}

async function decompress(data: string): Promise<string> {
  if (data.startsWith('raw:')) return data.slice(4);
  const bin = atob(data.slice(3));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function writeSave(save: SaveFile): Promise<void> {
  try {
    localStorage.setItem(KEY, await compress(JSON.stringify(save)));
  } catch {
    /* storage full or blocked: the run just won't be resumable */
  }
}

/** Synchronous best-effort save for pagehide, where async work may not finish. */
export function writeSaveSync(save: SaveFile): void {
  try {
    localStorage.setItem(KEY, `raw:${JSON.stringify(save)}`);
  } catch {
    /* ignore */
  }
}

export async function readSave(): Promise<SaveFile | null> {
  try {
    const data = localStorage.getItem(KEY);
    if (!data) return null;
    const save = JSON.parse(await decompress(data)) as SaveFile;
    if (save.v !== WORLD_VERSION) return null;
    return save;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
