import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile, lintTree, loadAllow, loadPatterns, scanText } from '../tools/lore-lint-core.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const patterns = loadPatterns(root);

describe('lore-lint', () => {
  it('catches planted post-464 names in a fixture', () => {
    const hits = lintTree(root, patterns, ['tests/fixtures/lore']);
    const matches = hits.map((h) => h.match);
    expect(matches).toContain('Goldcoral');
    expect(matches.some((m) => m.includes('BBL'))).toBe(true);
  });

  it('matches across whitespace and case', () => {
    const rules = compile(patterns);
    expect(scanText('the owe\n  block gang', 'x', rules).length).toBe(1);
    expect(scanText('JOHN RUMP', 'x', rules).length).toBe(1);
  });

  it('does not flag safe Long Thirst names', () => {
    const rules = compile(patterns);
    const safe = 'Aleforge, Shanty Town, Providence, Roto Kaiishi, Cromwell, Glendolph Galleyway, Thomas Thatcher Sr., '
      + 'Scipium Ofkra, Isadora Beerchelli, Sackbeard, Windsunk Council, Cardinal Addy, ClockHeart Tonic, John Cum, '
      + 'Brewers\' Lane, Hall of Ale, mama\'s stew, maa, Hoegaarden Library';
    expect(scanText(safe, 'x', rules)).toEqual([]);
  });

  it('allowed exact phrases pass, but the bare names are still caught', () => {
    const rules = compile(patterns);
    const allow = loadAllow(root);
    expect(scanText('placeholder="e.g. Jack_Anqoak"', 'x', rules, allow)).toEqual([]);
    expect(scanText('Anqoak rules the Isles', 'x', rules, allow).length).toBe(1);
  });

  it('the shipped tree is clean', () => {
    expect(lintTree(root, patterns, undefined, loadAllow(root))).toEqual([]);
  });
});
