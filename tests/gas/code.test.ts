import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import validate from '../../src/leaderboard/shared/validate.js';

const { lcValidateRecord, lcSanitizeCell } = validate as unknown as {
  lcValidateRecord: (r: unknown, o?: object) => string | null;
  lcSanitizeCell: (v: unknown) => string;
};

const root = join(__dirname, '../..');

function record(over: Record<string, unknown> = {}) {
  return {
    runId: 'seed-abc123',
    clientId: 'c-1234567',
    name: 'Tester',
    homeCity: 'aleforge',
    category: 'standard',
    winType: 'monopoly',
    monopolyMs: 40 * 60_000,
    finalCV: 50_000,
    peakCV: 52_000,
    splits: { firstSisterMs: 20 * 60_000, thirdSisterMs: 30 * 60_000, firstNo1Ms: 32 * 60_000 },
    simMs: 40 * 60_000,
    realMs: 40 * 60_000,
    pauses: 1,
    sessions: 0,
    seed: 'abc',
    build: 'lc-1.0',
    contentHash: 'deadbeef',
    ...over,
  };
}

describe('shared validation', () => {
  it('accepts a sane run', () => expect(lcValidateRecord(record())).toBeNull());
  it('rejects bad names and injection-looking names', () => {
    expect(lcValidateRecord(record({ name: '=HYPERLINK("x")' }))).toBe('bad name');
    expect(lcValidateRecord(record({ name: '' }))).toBe('bad name');
    expect(lcValidateRecord(record({ name: 'a'.repeat(17) }))).toBe('bad name');
  });
  it('checks clocks, splits and win types', () => {
    expect(lcValidateRecord(record({ realMs: 1000 }))).toBe('clock mismatch');
    expect(lcValidateRecord(record({ monopolyMs: 50 * 60_000 }))).toBe('bad monopoly time');
    expect(lcValidateRecord(record({ splits: { firstSisterMs: 10, thirdSisterMs: 5 } }))).toBe('splits out of order');
    expect(lcValidateRecord(record({ winType: 'bribe' }))).toBe('bad winType');
    expect(lcValidateRecord(record({ monopolyMs: 60_000 }), { minMonopolyMs: 8 * 60_000 })).toBe('implausibly fast');
    expect(lcValidateRecord(record({ winType: 'sponsor', simMs: 10 * 60_000, realMs: 10 * 60_000, monopolyMs: null, splits: {} }), { minSponsorMs: 50 * 60_000 })).toBe('sponsor before the verdict');
    expect(lcValidateRecord(record(), { allowedBuilds: ['lc-2.0'] })).toBe('build not allowed');
  });
  it('escapes spreadsheet formulas', () => {
    for (const bad of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) expect(lcSanitizeCell(bad).startsWith("'")).toBe(true);
    expect(lcSanitizeCell('plain')).toBe('plain');
    expect(lcSanitizeCell(null)).toBe('');
    expect(lcSanitizeCell('x'.repeat(200))).toHaveLength(80);
  });
});

// A small shim of the Apps Script services, enough to run gas/Code.gs in node:vm.
function makeGas() {
  const rows: unknown[][] = [];
  const cache = new Map<string, string>();
  const props: Record<string, string> = {};
  let locked = false;
  const sheet = {
    appendRow: (r: unknown[]) => rows.push(r),
    setFrozenRows: () => undefined,
    getLastRow: () => rows.length,
    getRange: (row: number, col: number, nr: number, nc: number) => ({
      getValues: () => rows.slice(row - 1, row - 1 + nr).map((r) => r.slice(col - 1, col - 1 + nc)),
    }),
  };
  let hasSheet = false;
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => (hasSheet ? sheet : null),
        insertSheet: () => { hasSheet = true; return sheet; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
        removeAll: (ks: string[]) => ks.forEach((k) => cache.delete(k)),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => (locked ? false : (locked = true)), releaseLock: () => void (locked = false) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    Date,
    JSON,
    Math,
    Number,
    String,
  };
  runInNewContext(readFileSync(join(root, 'gas/Code.gs'), 'utf8'), ctx);
  const post = (body: unknown) => JSON.parse((ctx.doPost as (e: unknown) => { text: string })({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  const get = (parameter: Record<string, string>) => JSON.parse((ctx.doGet as (e: unknown) => { text: string })({ parameter }).text);
  return { rows, cache, props, post, get, unlock: () => (locked = false), lock: () => (locked = true) };
}

describe('gas/Code.gs under a shim', () => {
  let gas: ReturnType<typeof makeGas>;
  beforeEach(() => { gas = makeGas(); });

  it('is up to date with the template (run npm run build-gas)', () => {
    const tpl = readFileSync(join(root, 'gas/Code.template.gs'), 'utf8');
    const shared = readFileSync(join(root, 'src/leaderboard/shared/validate.js'), 'utf8').replace(/if \(typeof module[\s\S]*$/, '').trim();
    expect(readFileSync(join(root, 'gas/Code.gs'), 'utf8')).toBe(tpl.replace('/*__VALIDATE__*/', shared));
  });

  it('appends a valid run and serves it on both boards', () => {
    expect(gas.post(record())).toEqual({ ok: true });
    expect(gas.rows).toHaveLength(2); // header + run
    const mono = gas.get({ board: 'monopoly', cat: 'overall' });
    expect(mono.rows[0]).toMatchObject({ rank: 1, name: 'Tester', value: 40 * 60_000 });
    const cv = gas.get({ board: 'cv', cat: 'aleforge' });
    expect(cv.rows[0].value).toBe(50_000);
    expect(gas.get({ board: 'cv', cat: 'roto' }).rows).toHaveLength(0);
  });

  it('refuses junk, too-fast runs and bad json', () => {
    expect(gas.post('not json').ok).toBe(false);
    expect(gas.post(record({ monopolyMs: 60_000, simMs: 60_000, realMs: 60_000, splits: {} })).error).toBe('implausibly fast');
    expect(gas.rows).toHaveLength(0);
  });

  it('enforces the build allowlist from Script Properties', () => {
    gas.props.ALLOWED_BUILDS = 'lc-2.0, lc-2.1';
    expect(gas.post(record()).error).toBe('build not allowed');
  });

  it('rate-limits a client and ignores duplicate runs', () => {
    expect(gas.post(record()).ok).toBe(true);
    const again = gas.post(record({ runId: 'seed-other1' }));
    expect(again).toMatchObject({ ok: false, retry: true });
    gas.cache.delete('client:c-1234567');
    expect(gas.post(record())).toEqual({ ok: true, duplicate: true });
    expect(gas.rows).toHaveLength(2);
  });

  it('asks the client to retry when the sheet is locked', () => {
    gas.lock();
    expect(gas.post(record())).toMatchObject({ ok: false, retry: true });
  });

  it('sorts the monopoly board by time, then CV, and invalidates the cache on new runs', () => {
    gas.post(record({ runId: 'run-aaaaaa', clientId: 'client-a1', name: 'Slow', monopolyMs: 45 * 60_000, simMs: 45 * 60_000, realMs: 45 * 60_000 }));
    expect(gas.get({ board: 'monopoly', cat: 'overall' }).rows.map((r: { name: string }) => r.name)).toEqual(['Slow']);
    gas.post(record({ runId: 'run-bbbbbb', clientId: 'client-b1', name: 'Fast', monopolyMs: 30 * 60_000, simMs: 30 * 60_000, realMs: 30 * 60_000, splits: {} }));
    expect(gas.get({ board: 'monopoly', cat: 'overall' }).rows.map((r: { name: string }) => r.name)).toEqual(['Fast', 'Slow']);
  });

  it('never writes a raw formula into a cell', () => {
    gas.post(record({ seed: '=IMPORTXML("x")' }));
    expect(gas.rows[1]).toContain("'=IMPORTXML(\"x\")");
  });
});
