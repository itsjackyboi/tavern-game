// npm run build-gas — writes gas/Code.gs from gas/Code.template.gs, inlining the
// shared validation module so the server and the client check runs identically.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = readFileSync(join(root, 'gas/Code.template.gs'), 'utf8');
const shared = readFileSync(join(root, 'src/leaderboard/shared/validate.js'), 'utf8').replace(/if \(typeof module[\s\S]*$/, '').trim();
writeFileSync(join(root, 'gas/Code.gs'), tpl.replace('/*__VALIDATE__*/', shared));
console.log('gas/Code.gs written');
