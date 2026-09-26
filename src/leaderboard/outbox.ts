import { LEADERBOARD_URL } from './config.ts';
import { AppsScriptAdapter, LocalAdapter, MockAdapter, recordLocal } from './adapters.ts';
import type { LeaderboardAdapter, RunRecord } from './types.ts';

// Runs are queued before sending so none is lost offline; flushed on submit,
// when the browser comes back online, and every minute.

const OUTBOX_KEY = 'last-call:outbox';
const CLIENT_KEY = 'last-call:client-id';
const NAME_KEY = 'last-call:name';
const REFUSE_LIMIT = 5;

interface Queued {
  rec: RunRecord;
  tries: number;
  refused: number;
  retryAt: number;
}

let adapter: LeaderboardAdapter | null = null;

export function getAdapter(): LeaderboardAdapter {
  if (adapter) return adapter;
  const mock = new URLSearchParams(location.search).get('lbmock');
  if (mock === 'ok' || mock === 'fail' || mock === 'slow') adapter = new MockAdapter(mock);
  else if (LEADERBOARD_URL) adapter = new AppsScriptAdapter(LEADERBOARD_URL);
  else adapter = new LocalAdapter();
  return adapter;
}

function load(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as Queued[];
  } catch {
    return [];
  }
}
function save(q: Queued[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(q.slice(-60)));
  } catch {
    /* ignore */
  }
}

export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = `c-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'c-anonymous1';
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

export function pending(): number {
  return load().length;
}

let flushing = false;
export async function flush(): Promise<'sent' | 'queued' | 'empty'> {
  if (flushing) return 'queued';
  flushing = true;
  try {
    const a = getAdapter();
    let q = load();
    if (!q.length) return 'empty';
    const now = Date.now();
    for (const item of [...q]) {
      if (item.retryAt > now) continue;
      const res = await a.submit(item.rec);
      if (res === 'ok') q = q.filter((x) => x !== item);
      else if (res === 'retry') {
        item.tries += 1;
        item.retryAt = Date.now() + Math.min(60000, 15000 * item.tries);
      } else {
        item.refused += 1;
        if (item.refused >= REFUSE_LIMIT) q = q.filter((x) => x !== item);
      }
    }
    save(q);
    return q.length ? 'queued' : 'sent';
  } finally {
    flushing = false;
  }
}

export async function submitRun(rec: RunRecord): Promise<'sent' | 'queued'> {
  recordLocal(rec);
  const q = load().filter((x) => x.rec.runId !== rec.runId);
  q.push({ rec, tries: 0, refused: 0, retryAt: 0 });
  save(q);
  const res = await flush();
  return res === 'sent' || res === 'empty' ? 'sent' : 'queued';
}

let started = false;
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flush());
  setInterval(() => void flush(), 60000);
  void flush();
}
