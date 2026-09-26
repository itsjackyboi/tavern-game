// npm run gen-schema — writes JSON Schemas for every content file to
// src/content/schemas/, which .vscode/settings.json maps onto the data files so
// editing content in VS Code gets autocomplete and inline validation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { FILE_SCHEMAS } from '../src/content/schema.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/content/schemas');
mkdirSync(outDir, { recursive: true });
const mappings: Array<{ fileMatch: string[]; url: string }> = [];
for (const [rel, schema] of Object.entries(FILE_SCHEMAS)) {
  const name = rel.replace(/\//g, '.').replace(/\.json$/, '.schema.json');
  writeFileSync(join(outDir, name), JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n');
  mappings.push({ fileMatch: [`src/content/data/${rel}`], url: `./src/content/schemas/${name}` });
  console.log(`src/content/schemas/${name}`);
}
mkdirSync(join(root, '.vscode'), { recursive: true });
writeFileSync(join(root, '.vscode/settings.json'), JSON.stringify({ 'json.schemas': mappings }, null, 2) + '\n');
console.log('.vscode/settings.json');
