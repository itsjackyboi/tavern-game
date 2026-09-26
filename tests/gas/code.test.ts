import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import validate from '../../src/leaderboard/shared/validate.js';
import { boards } from '../../src/leaderboard/rank.ts';
import type { RunRecord } from '../../src/leaderboard/types.ts';

const { lcValidateRecord, lcSanitizeCell, lcEraOf } = validate as unknown as {
  lcValidateRecord: (r: unknown, o?: object) => string | null;
  lcSanitizeCell: (v: unknown) => string;
  lcEraOf: (v: string) => string;
};

const root = join(__dirname, '../..');
let n = 0;

function record(over: Record<string, unknown> = {}): RunRecord {
  n += 1;
  return {
    runId: `seed-run${String(n).padStart(4, '0')}`,
    clientId: `c-client${n}`,
    name: 'Tester',
    tavernName: 'The Last Call',
    homeCity: 'aleforge',
    category: 'standard',
    result: 'monopoly',
    monopolyMs: 40 * 60_000,
    finalCV: 50_000,
    peakCV: 52_000,
    splits: { firstSisterMs: 20 * 60_000, thirdSisterMs: 30 * 60_000, firstNo1Ms: 32 * 60_000 },
    simMs: 40 * 60_000,
    realMs: 40 * 60_000,
    pauses: 1,
    sessions: 0,
    seed: 'abc',
    version: 'v1.5',
    contentHash: 'deadbeef',
    date: '2026-09-26T00:00:00Z',
    ...over,
  } as RunRecord;
}
const sponsor = (over: Record<string, unknown> = {}) =>
  record({ result: 'sponsor', monopolyMs: null, simMs: 54 * 60_000, realMs: 54 * 60_000, ...over });

describe('shared validation', () => {
  it('accepts a sane run of every result', () => {
    expect(lcValidateRecord(record())).toBeNull();
    expect(lcValidateRecord(sponsor())).toBeNull();
    expect(lcValidateRecord(record({ result: 'lost', monopolyMs: null }))).toBeNull();
    expect(lcValidateRecord(record({ result: 'bankrupt', monopolyMs: null, simMs: 60_000, realMs: 60_000, splits: {} }))).toBeNull();
  });
  it('rejects bad names, tavern names and results', () => {
    expect(lcValidateRecord(record({ name: '=HYPERLINK("x")' }))).toBe('bad name');
    expect(lcValidateRecord(record({ tavernName: '' }))).toBe('bad tavern name');
    expect(lcValidateRecord(record({ tavernName: 'x'.repeat(29) }))).toBe('bad tavern name');
    expect(lcValidateRecord(record({ tavernName: "Bert's Barrel & Brine" }))).toBeNull();
    expect(lcValidateRecord(record({ result: 'bribe' }))).toBe('bad result');
    expect(lcValidateRecord(record({ version: 'lc-1.0' }))).toBe('bad version');
  });
  it('checks clocks and plausibility', () => {
    expect(lcValidateRecord(record({ realMs: 1000 }))).toBe('clock mismatch');
    expect(lcValidateRecord(record({ monopolyMs: 50 * 60_000 }))).toBe('bad monopoly time');
    expect(lcValidateRecord(record({ monopolyMs: 60_000 }), { minMonopolyMs: 8 * 60_000 })).toBe('implausibly fast');
    expect(lcValidateRecord(sponsor({ simMs: 10 * 60_000, realMs: 10 * 60_000, splits: {} }), { minSponsorMs: 50 * 60_000 })).toBe('sponsor before the verdict');
    expect(lcValidateRecord(record(), { allowedVersions: ['v2.'] })).toBe('version not allowed');
    expect(lcValidateRecord(record(), { allowedVersions: ['v1.', 'v2.'] })).toBeNull();
  });
  it('v1.x is pre-release; v2.0 on is official', () => {
    expect(lcEraOf('v1.5')).toBe('pre');
    expect(lcEraOf('v1.99')).toBe('pre');
    expect(lcEraOf('v2.0')).toBe('official');
    expect(lcEraOf('v10.3')).toBe('official');
  });
  it('escapes spreadsheet formulas', () => {
    for (const bad of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) expect(lcSanitizeCell(bad).startsWith("'")).toBe(true);
    expect(lcSanitizeCell('plain')).toBe('plain');
    expect(lcSanitizeCell(null)).toBe('');
    expect(lcSanitizeCell('x'.repeat(200))).toHaveLength(80);
  });
});

describe('client ranking', () => {
  it('two top tens per era; losses never rank', () => {
    const runs: RunRecord[] = [];
    for (let i = 0; i < 12; i++) runs.push(record({ monopolyMs: (30 + i) * 60_000, simMs: (30 + i) * 60_000, realMs: (30 + i) * 60_000 }));
    for (let i = 0; i < 12; i++) runs.push(sponsor({ finalCV: 40_000 + i * 1000, peakCV: 60_000 }));
    runs.push(record({ result: 'lost', monopolyMs: null, finalCV: 999_999, peakCV: 999_999 }));
    runs.push(record({ version: 'v2.0', monopolyMs: 20 * 60_000, name: 'Official' }));
    const pre = boards(runs, 'pre');
    expect(pre.monopoly).toHaveLength(10);
    expect(pre.monopoly[0]!.value).toBe(30 * 60_000);
    expect(pre.sponsor).toHaveLength(10);
    expect(pre.sponsor[0]!.value).toBe(51_000);
    expect(pre.sponsor[0]).toMatchObject({ name: 'Tester', tavern: 'The Last Call' });
    const official = boards(runs, 'official');
    expect(official.monopoly.map((r) => r.name)).toEqual(['Official']);
    expect(official.sponsor).toHaveLength(0);
  });
});

// A small shim of the Apps Script services, enough to run gas/Code.gs in node:vm.
function makeGas() {
  const sheets = new Map<string, unknown[][]>();
  const cache = new Map<string, string>();
  const props: Record<string, string> = {};
  let locked = false;
  const sheetApi = (name: string) => {
    const grid = () => sheets.get(name)!;
    return {
      appendRow: (r: unknown[]) => void grid().push(r),
      setFrozenRows: () => undefined,
      clear: () => void sheets.set(name, []),
      getLastRow: () => grid().length,
      getRange: (row: number, col: number, nr: number, nc: number) => ({
        getValues: () => grid().slice(row - 1, row - 1 + nr).map((r) => r.slice(col - 1, col - 1 + nc)),
        setValues: (vals: unknown[][]) => {
          vals.forEach((v, i) => {
            const r = (grid()[row - 1 + i] ??= []);
            v.forEach((x, j) => (r[col - 1 + j] = x));
          });
        },
      }),
    };
  };
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => (sheets.has(name) ? sheetApi(name) : null),
        insertSheet: (name: string) => { sheets.set(name, []); return sheetApi(name); },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => (locked ? false : (locked = true)), releaseLock: () => void (locked = false) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    Date, JSON, Math, Number, String,
  };
  runInNewContext(readFileSync(join(root, 'gas/Code.gs'), 'utf8'), ctx);
  const post = (body: unknown) => {
    cache.forEach((_, k) => { if (k.startsWith('client:')) cache.delete(k); }); // tests post faster than the per-client limit
    return JSON.parse((ctx.doPost as (e: unknown) => { text: string })({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  };
  const get = (parameter: Record<string, string>) => JSON.parse((ctx.doGet as (e: unknown) => { text: string })({ parameter }).text);
  return { sheets, cache, props, post, get, lock: () => (locked = true) };
}

describe('gas/Code.gs under a shim', () => {
  let gas: ReturnType<typeof makeGas>;
  beforeEach(() => { gas = makeGas(); });

  it('is up to date with the template (run npm run build-gas)', () => {
    const tpl = readFileSync(join(root, 'gas/Code.template.gs'), 'utf8');
    const shared = readFileSync(join(root, 'src/leaderboard/shared/validate.js'), 'utf8').replace(/if \(typeof module[\s\S]*$/, '').trim();
    expect(readFileSync(join(root, 'gas/Code.gs'), 'utf8')).toBe(tpl.replace('/*__VALIDATE__*/', shared));
  });

  it('logs every run, but only wins make the boards', () => {
    expect(gas.post(record())).toEqual({ ok: true });
    expect(gas.post(sponsor({ finalCV: 70_000, peakCV: 70_000 }))).toEqual({ ok: true });
    expect(gas.post(record({ result: 'lost', monopolyMs: null, finalCV: 900_000, peakCV: 900_000 }))).toEqual({ ok: true });
    expect(gas.post(record({ result: 'bankrupt', monopolyMs: null, simMs: 60_000, realMs: 60_000, splits: {} }))).toEqual({ ok: true });
    expect(gas.sheets.get('runs')).toHaveLength(5); // header + 4 runs
    const b = gas.get({ era: 'pre' });
    expect(b.monopoly).toHaveLength(1);
    expect(b.monopoly[0]).toMatchObject({ rank: 1, name: 'Tester', tavern: 'The Last Call', value: 40 * 60_000 });
    expect(b.sponsor[0].value).toBe(70_000);
  });

  it('splits pre-release (v1.x) from official (v2.0+) records, each on its own tab', () => {
    gas.post(record({ name: 'Early' }));
    gas.post(record({ name: 'Official', version: 'v2.0' }));
    expect(gas.get({ era: 'pre' }).monopoly.map((r: { name: string }) => r.name)).toEqual(['Early']);
    expect(gas.get({ era: 'official' }).monopoly.map((r: { name: string }) => r.name)).toEqual(['Official']);
    const pre = gas.sheets.get('Pre Release Records')!;
    expect(pre[0]![0]).toBe('Fastest Monopoly');
    expect(pre[0]![8]).toBe('Sponsored the Trials');
    expect(pre[2]!.slice(0, 4)).toEqual([1, 'Early', 'The Last Call', '40:00']);
    expect(gas.sheets.get('Official Records')![2]![1]).toBe('Official');
  });

  it('shows ten per board, sorted', () => {
    for (let i = 0; i < 12; i++) gas.post(record({ monopolyMs: (45 - i) * 60_000, simMs: 50 * 60_000, realMs: 50 * 60_000 }));
    const b = gas.get({ era: 'pre' });
    expect(b.monopoly).toHaveLength(10);
    expect(b.monopoly[0].value).toBe(34 * 60_000);
  });

  it('refuses junk, too-fast runs and bad json', () => {
    expect(gas.post('not json').ok).toBe(false);
    expect(gas.post(record({ monopolyMs: 60_000, simMs: 60_000, realMs: 60_000, splits: {} })).error).toBe('implausibly fast');
    expect(gas.sheets.get('runs') ?? []).toHaveLength(0);
  });

  it('enforces the version allowlist from Script Properties', () => {
    gas.props.ALLOWED_VERSIONS = 'v2.';
    expect(gas.post(record()).error).toBe('version not allowed');
  });

  it('ignores duplicate runs and hides rows marked hidden', () => {
    const r = record();
    gas.post(r);
    expect(gas.post(r)).toEqual({ ok: true, duplicate: true });
    const runs = gas.sheets.get('runs')!;
    runs[1]![runs[0]!.indexOf('hidden')] = 'x';
    gas.post(record({ name: 'Visible' }));
    expect(gas.get({ era: 'pre' }).monopoly.map((x: { name: string }) => x.name)).toEqual(['Visible']);
  });

  it('asks the client to retry when the sheet is locked', () => {
    gas.lock();
    expect(gas.post(record())).toMatchObject({ ok: false, retry: true });
  });

  it('never writes a raw formula into a cell', () => {
    gas.post(record({ seed: '=IMPORTXML("x")' }));
    expect(gas.sheets.get('runs')![1]).toContain("'=IMPORTXML(\"x\")");
  });
});
