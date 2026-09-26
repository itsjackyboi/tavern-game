import { PALETTES } from '../art/palettes.ts';
import { FILE_SCHEMAS, PROSE_FILES, type Content } from './schema.ts';

// Content validation shared by tools/validate-content.ts and the tests.

const PROSE_KEYS = /^(description|desc|lore|flavou?r|blurb|story|text)$/i;

function findProseKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => findProseKeys(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PROSE_KEYS.test(k)) out.push(`${path}.${k}`);
      findProseKeys(v, `${path}.${k}`, out);
    }
  }
}

/** Cross-file rules on already-parsed content. */
export function crossCheck(c: Content): string[] {
  const problems: string[] = [];
  const t = c.time;
  if (t.endYear < t.startYear) problems.push('time: endYear is before startYear');
  if (new Set(t.seasonOrder).size !== 3) problems.push('time: seasonOrder must list each season once');
  for (const s of t.seasonOrder) {
    if (t.lastCallTicks >= t.seasonTicks[s] * (1 - t.dayFraction)) {
      problems.push(`time: lastCallTicks must fit inside the ${s} night`);
    }
  }
  const ids = new Set(c.cities.map((x) => x.id));
  if (ids.size !== 4) problems.push('cities: each of the four cities must appear exactly once');
  for (const city of c.cities) {
    if (!PALETTES[city.palette]) problems.push(`cities.${city.id}: unknown palette "${city.palette}"`);
  }
  const mayors = [...c.mayors].sort((a, b) => a.from - b.from);
  for (let i = 0; i < mayors.length; i++) {
    const m = mayors[i]!;
    if (m.to < m.from) problems.push(`mayors.${m.id}: ends before it starts`);
    const next = mayors[i + 1];
    if (next && next.from !== m.to + 1 && next.from !== m.to) {
      problems.push(`mayors: gap or overlap between ${m.id} and ${next.id}`);
    }
  }
  const live = mayors.filter((m) => m.live);
  if (!live.some((m) => m.from <= t.startYear && m.to >= t.startYear)) problems.push('mayors: no live mayor in office at startYear');
  if (!live.some((m) => m.to >= t.endYear)) problems.push('mayors: no live mayor in office at endYear');
  return problems;
}

/** Validates each data file against its schema, then cross-checks. `read` returns parsed JSON for a data-relative path. */
export function validateContentFiles(read: (rel: string) => unknown): string[] {
  const problems: string[] = [];
  const parsed: Record<string, unknown> = {};
  for (const [rel, schema] of Object.entries(FILE_SCHEMAS)) {
    let raw: unknown;
    try {
      raw = read(rel);
    } catch (e) {
      problems.push(`${rel}: ${(e as Error).message}`);
      continue;
    }
    if (!PROSE_FILES.has(rel)) {
      const prose: string[] = [];
      findProseKeys(raw, rel, prose);
      for (const p of prose) problems.push(`${p}: prose fields are not allowed; descriptions are generated from stats`);
    }
    const res = schema.safeParse(raw);
    if (!res.success) {
      for (const issue of res.error.issues) problems.push(`${rel} ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    } else parsed[rel] = res.data;
  }
  if (problems.length) return problems;
  const content = {
    time: parsed['tuning/time.json'],
    economy: parsed['tuning/economy.json'],
    cities: parsed['cities.json'],
    mayors: parsed['mayors.json'],
    letter: parsed['strings/letter.json'],
  } as Content;
  return crossCheck(content);
}
