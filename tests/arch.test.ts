import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listFiles } from '../tools/lore-lint-core.ts';

// The sim must stay pure and deterministic: no renderer, DOM, UI or audio
// imports, and no ambient randomness or wall-clock time.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const simFiles = listFiles(root, 'src/sim', () => false).filter((f) => /\.tsx?$/.test(f));

const BANNED_IMPORTS = [/from ['"]phaser['"]/, /from ['"]preact/, /from ['"]@preact/, /from ['"]\.\.\/(ui|views|audio|app|input)\//];
const BANNED_CALLS = [/Math\.random/, /\bDate\b/, /performance\./, /\bwindow\./, /\bdocument\./, /requestAnimationFrame/, /setTimeout|setInterval/];

describe('architecture: src/sim is pure', () => {
  it('has sim files to check', () => {
    expect(simFiles.length).toBeGreaterThan(0);
  });
  for (const f of simFiles) {
    it(f, () => {
      const code = readFileSync(join(root, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const re of BANNED_IMPORTS) expect(code, `${f} imports ${re}`).not.toMatch(re);
      for (const re of BANNED_CALLS) expect(code, `${f} uses ${re}`).not.toMatch(re);
    });
  }
});
