import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import { validateContentFiles } from '../../src/content/validate.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/content/data');
const readReal = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8'));

describe('content', () => {
  it('bundled content parses', () => {
    const c = loadContent();
    expect(c.cities.map((x) => x.id).sort()).toEqual(['aleforge', 'providence', 'roto', 'shanty']);
    expect(c.economy.monopolyRatio).toBe(2);
  });

  it('real data files validate', () => {
    expect(validateContentFiles(readReal)).toEqual([]);
  });

  it('rejects prose fields outside the letter', () => {
    const problems = validateContentFiles((rel) => {
      const v = readReal(rel);
      if (rel === 'cities.json') v[0].description = 'A storied brewing town.';
      return v;
    });
    expect(problems.some((p) => p.includes('prose fields are not allowed'))).toBe(true);
  });

  it('rejects unknown palettes and broken mayor timelines', () => {
    const problems = validateContentFiles((rel) => {
      const v = readReal(rel);
      if (rel === 'cities.json') v[1].palette = 'nope';
      if (rel === 'mayors.json') v[3].from = 470;
      return v;
    });
    expect(problems.some((p) => p.includes('unknown palette'))).toBe(true);
    expect(problems.some((p) => p.includes('mayors'))).toBe(true);
  });

  it('the letter is still marked as placeholder copy', () => {
    expect(loadContent().letter.placeholder).toBe(true);
  });
});
