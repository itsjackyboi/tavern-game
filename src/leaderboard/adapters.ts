import { lcValidateRecord } from './shared/validate.js';
import { boards } from './rank.ts';
import type { Boards, Era, LeaderboardAdapter, RunRecord, SubmitResult } from './types.ts';

// Three adapters: local (this device only), mock (tests: ?lbmock=ok|fail|slow),
// and the Apps Script web app (the Mario pattern, hardened). Every finished run
// is submitted; the boards show only the two top tens per era.

const LOCAL_KEY = 'last-call:local-board';

function readLocal(): RunRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as RunRecord[];
  } catch {
    return [];
  }
}

export function recordLocal(rec: RunRecord): void {
  try {
    const all = readLocal().filter((r) => r.runId !== rec.runId);
    all.push(rec);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-200)));
  } catch {
    /* ignore */
  }
}

export class LocalAdapter implements LeaderboardAdapter {
  readonly shared = false;
  async submit(rec: RunRecord): Promise<SubmitResult> {
    recordLocal(rec);
    return 'ok';
  }
  async boards(era: Era): Promise<Boards> {
    return boards(readLocal(), era);
  }
}

export class MockAdapter implements LeaderboardAdapter {
  readonly shared = true;
  private runs: RunRecord[] = [];
  constructor(private mode: 'ok' | 'fail' | 'slow') {}
  private async delay(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.mode === 'slow' ? 1500 : 30));
  }
  async submit(rec: RunRecord): Promise<SubmitResult> {
    await this.delay();
    if (this.mode === 'fail') return 'retry';
    if (lcValidateRecord(rec)) return 'refused';
    this.runs = this.runs.filter((r) => r.runId !== rec.runId).concat(rec);
    return 'ok';
  }
  async boards(era: Era): Promise<Boards> {
    await this.delay();
    if (this.mode === 'fail') throw new Error('offline');
    return boards(this.runs, era);
  }
}

/** Reads a response body as JSON, detecting Google's HTML error/sign-in pages. */
export function parseBody(text: string): unknown {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) throw new Error('empty response');
  if (t.startsWith('<')) throw new Error('Google answered with a page instead of the sheet');
  return JSON.parse(t);
}

async function send(url: string, init: RequestInit): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseBody(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

export class AppsScriptAdapter implements LeaderboardAdapter {
  readonly shared = true;
  private cache = new Map<string, { at: number; data: Boards }>();
  constructor(private url: string) {}

  async submit(rec: RunRecord): Promise<SubmitResult> {
    try {
      // text/plain keeps this a "simple" request: no CORS preflight (Apps Script can't answer OPTIONS).
      const body = (await send(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) })) as { ok?: boolean; retry?: boolean };
      if (body.ok) return 'ok';
      return body.retry ? 'retry' : 'refused';
    } catch {
      return 'retry';
    }
  }

  async boards(era: Era): Promise<Boards> {
    const hit = this.cache.get(era);
    if (hit && Date.now() - hit.at < 45000) return hit.data;
    const body = (await send(`${this.url}?era=${era}`, { method: 'GET' })) as Partial<Boards> & { error?: string };
    if (!body.monopoly || !body.sponsor) throw new Error(body.error ?? 'bad board');
    const data = { monopoly: body.monopoly, sponsor: body.sponsor };
    this.cache.set(era, { at: Date.now(), data });
    return data;
  }
}
