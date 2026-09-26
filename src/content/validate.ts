import { PALETTES } from '../art/palettes.ts';
import { CITY_IDS, FILE_SCHEMAS, PROSE_FILES, type Content, type EffectT } from './schema.ts';

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

function walkEffects(effects: EffectT[], fn: (e: EffectT) => void): void {
  for (const e of effects) {
    fn(e);
    if (e.type === 'chance') {
      walkEffects(e.then, fn);
      if (e.else) walkEffects(e.else, fn);
    }
  }
}

/** Rough value of an effect list in Duckets, used to check that defaults are never the best choice. */
export function effectValue(effects: EffectT[], c: Content): number {
  let v = 0;
  for (const e of effects) {
    switch (e.type) {
      case 'duckets': v += e.amount; break;
      case 'favor': v += e.amount * c.economy.favorToDuckets; break;
      case 'rep': v += e.amount * 25; break;
      case 'standing': v += e.amount * 4; break;
      case 'modifier': {
        const m = c.modifiers.find((x) => x.id === e.id);
        const strength = m
          ? 1 + 5 * (Math.abs((m.arrivals ?? 1) - 1) + Math.abs((m.brawl ?? 1) - 1) * 0.5 + Math.abs((m.repGain ?? 1) - 1) * 0.5)
          : 1;
        v += (m?.good ? 60 : -60) * e.seasons * strength;
        break;
      }
      case 'undercurrent': v += e.key === 'veilGoodwill' ? e.amount * 5 : e.key === 'farmerTension' ? -e.amount * 3 : 0; break;
      case 'morale': v += e.amount * 200; break;
      case 'stock': v += e.fraction * 300; break;
      case 'spiritweed': v += e.amount * 15; break;
      case 'closeTavern': v -= e.seconds * 8; break;
      case 'loseStaff': v -= 150; break;
      case 'rivalCash': v -= e.amount * 0.2; break;
      case 'rivalRep': v -= e.amount * 10; break;
      case 'chance': v += e.p * effectValue(e.then, c) + (1 - e.p) * effectValue(e.else ?? [], c); break;
      default: break;
    }
  }
  return v;
}

/** Cross-file rules on already-parsed content. */
export function crossCheck(c: Content): string[] {
  const problems: string[] = [];
  const t = c.time;
  if (t.endYear < t.startYear) problems.push('time: endYear is before startYear');
  if (new Set(t.seasonOrder).size !== 3) problems.push('time: seasonOrder must list each season once');
  for (const s of t.seasonOrder) {
    if (t.lastCallTicks >= t.seasonTicks[s] * (1 - t.dayFraction)) problems.push(`time: lastCallTicks must fit inside the ${s} night`);
  }
  const ids = new Set(c.cities.map((x) => x.id));
  if (ids.size !== 4) problems.push('cities: each of the four cities must appear exactly once');
  const drinkIds = new Set(c.drinks.map((d) => d.id));
  const colors = new Map<string, string>();
  for (const d of c.drinks) {
    const k = d.color.toLowerCase();
    if (colors.has(k)) problems.push(`drinks: ${d.id} has the same colour as ${colors.get(k)}; every drink needs its own`);
    colors.set(k, d.id);
  }
  const modIds = new Set(c.modifiers.map((m) => m.id));
  const promptIds = new Set(c.prompts.map((p) => p.id));
  for (const city of c.cities) {
    if (!PALETTES[city.palette]) problems.push(`cities.${city.id}: unknown palette "${city.palette}"`);
    for (const d of city.contraband) if (!drinkIds.has(d)) problems.push(`cities.${city.id}: unknown contraband drink "${d}"`);
    const segs = c.segments.filter((s) => s.city === city.id);
    if (segs.length < 4) problems.push(`segments: ${city.id} needs at least 4 segments`);
    if (city.rivalTaverns > c.rivals.tavernNames[city.id].length) problems.push(`rivals: not enough tavern names for ${city.id}`);
  }
  const mayors = [...c.mayors].sort((a, b) => a.from - b.from);
  for (let i = 0; i < mayors.length; i++) {
    const m = mayors[i]!;
    if (m.to < m.from) problems.push(`mayors.${m.id}: ends before it starts`);
    const next = mayors[i + 1];
    if (next && next.from !== m.to + 1 && next.from !== m.to) problems.push(`mayors: gap or overlap between ${m.id} and ${next.id}`);
  }
  const live = mayors.filter((m) => m.live);
  if (!live.some((m) => m.from <= t.startYear && m.to >= t.startYear)) problems.push('mayors: no live mayor in office at startYear');
  if (!live.some((m) => m.to >= t.endYear)) problems.push('mayors: no live mayor in office at endYear');

  // Drinks: every city starts with at least 3; discovery pairs are unique.
  for (const city of CITY_IDS) {
    if (c.drinks.filter((d) => d.startIn.includes(city)).length < 3) problems.push(`drinks: ${city} starts with fewer than 3 drinks`);
  }
  const pairs = new Set<string>();
  for (const d of c.drinks) {
    if (!d.discover) continue;
    const key = [...d.discover].sort().join('+');
    if (pairs.has(key)) problems.push(`drinks.${d.id}: discovery pair ${key} is used twice`);
    pairs.add(key);
    for (const ing of d.discover) if (!(ing in d.recipe)) problems.push(`drinks.${d.id}: discovery ingredient ${ing} is not in its recipe`);
  }
  const segIds = new Set(c.segments.map((s) => s.id));
  if (segIds.size !== c.segments.length) problems.push('segments: duplicate ids');

  // Prompts and effects reference real things; defaults are never the best option.
  const checkEffects = (where: string, effects: EffectT[]) =>
    walkEffects(effects, (e) => {
      if (e.type === 'modifier' && !modIds.has(e.id)) problems.push(`${where}: unknown modifier "${e.id}"`);
      if (e.type === 'prompt' && !promptIds.has(e.id)) problems.push(`${where}: unknown prompt "${e.id}"`);
    });
  for (const p of c.prompts) {
    if (p.defaultOption >= p.options.length) problems.push(`prompts.${p.id}: defaultOption out of range`);
    p.options.forEach((o, i) => checkEffects(`prompts.${p.id}.options[${i}]`, o.effects));
    const values = p.options.map((o) => effectValue(o.effects, c));
    const best = Math.max(...values);
    const def = values[p.defaultOption] ?? 0;
    if (p.tier !== 'strategic' && def >= best && values.some((v) => v !== def)) {
      problems.push(`prompts.${p.id}: the default option is the best one; defaults must be safe but weak`);
    }
  }
  for (const cr of c.crises) {
    if (!promptIds.has(cr.prompt)) problems.push(`crises.${cr.id}: unknown prompt "${cr.prompt}"`);
    checkEffects(`crises.${cr.id}.onStart`, cr.onStart);
  }
  for (const h of c.holidays) if (!modIds.has(h.modifier)) problems.push(`holidays.${h.id}: unknown modifier "${h.modifier}"`);
  for (const u of c.upgrades) {
    for (const k of Object.keys(u.effects.appeal ?? {})) if (!segIds.has(k)) problems.push(`upgrades.${u.id}: unknown segment "${k}"`);
  }
  if (!c.rivalTuning.archRival.startCities.every((x) => CITY_IDS.includes(x))) problems.push('rivals: bad arch-rival city');
  return problems;
}

/** Validates each data file against its schema, then cross-checks. `read` returns parsed JSON for a data-relative path. */
export function validateContentFiles(read: (rel: string) => unknown): string[] {
  const problems: string[] = [];
  const parsed: Record<string, unknown> = {};
  for (const [rel, [key, schema]] of Object.entries(FILE_SCHEMAS)) {
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
    } else parsed[key] = res.data;
  }
  if (problems.length) return problems;
  return crossCheck(parsed as Content);
}
