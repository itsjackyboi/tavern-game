// npm run lore-lint — fails if any post-464 (or uncertain-era) name appears in
// shipped files, including the built dist/ when present. Patterns: tools/lore/forbidden.json.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintTree, loadPatterns } from './lore-lint-core.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hits = lintTree(root, loadPatterns(root));
if (hits.length) {
  for (const h of hits) console.error(`${h.file}:${h.line}  "${h.match}"  — ${h.reason}`);
  console.error(`\nlore-lint: ${hits.length} forbidden name(s) found.`);
  process.exit(1);
}
console.log('lore-lint: clean');
