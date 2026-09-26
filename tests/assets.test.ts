import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHEETS } from '../src/art/atlas.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'tools/assets.config.json'), 'utf8')) as {
  packs: Array<{ id: string; license: string; files: Array<[string, string]> }>;
  uploaded: Array<{ id: string; license: string; files: string[] }>;
};
const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');

describe('assets and credits', () => {
  for (const pack of config.packs) {
    it(`${pack.id}: files, licence and credit are present`, () => {
      for (const [, dest] of pack.files) expect(existsSync(join(root, 'public/assets', dest)), dest).toBe(true);
      expect(existsSync(join(root, 'public/assets/licenses', `${pack.id}.txt`))).toBe(true);
      expect(credits).toContain(pack.id);
      expect(['CC0-1.0']).toContain(pack.license);
    });
  }

  for (const pack of config.uploaded) {
    it(`${pack.id} (uploaded): files, licence and credit are present`, () => {
      for (const f of pack.files) expect(existsSync(join(root, 'public/assets', f)), f).toBe(true);
      expect(existsSync(join(root, 'public/assets/licenses', `${pack.id}.txt`))).toBe(true);
      expect(credits).toContain(pack.id);
    });
  }

  it('every atlas sheet exists', () => {
    for (const s of Object.values(SHEETS)) expect(existsSync(join(root, 'public', s.url)), s.url).toBe(true);
  });
});
