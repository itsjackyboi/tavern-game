// npm run validate-content — schema-checks every data file, then runs
// cross-file rules that zod can't express. Exits non-zero on any problem.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentFiles } from '../src/content/validate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/content/data');
const problems = validateContentFiles((rel) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')));
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log('validate-content: ok');
