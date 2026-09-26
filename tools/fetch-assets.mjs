#!/usr/bin/env node
// Downloads the CC0 art, fonts and sounds listed in tools/assets.config.json
// into public/assets/, plus each pack's License.txt into public/assets/licenses/.
// Source: the public series-ai/jam-ready-assets mirror of Kenney's (and others')
// CC0 packs. Git LFS binaries are served by media.githubusercontent.com, so
// git-lfs isn't needed. Results are committed; re-run to refresh.
//   node tools/fetch-assets.mjs
// Adapted from the same tool in itsjackyboi/TD-PINT.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(join(root, 'tools/assets.config.json'), 'utf8'));
const MEDIA = `https://media.githubusercontent.com/media/${config.mirror}/main/`;
const RAW = `https://raw.githubusercontent.com/${config.mirror}/main/`;
const out = join(root, 'public/assets');

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function fetchBuf(path) {
  // LFS-tracked binaries come from media.githubusercontent.com; plain text from raw.
  let res = await fetch(MEDIA + enc(path));
  if (res.status === 404) res = await fetch(RAW + enc(path));
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 40).toString().startsWith('version https://git-lfs')) {
    throw new Error(`Got an LFS pointer instead of content: ${path}`);
  }
  return buf;
}

for (const pack of config.packs) {
  if (pack.license !== 'CC0-1.0') throw new Error(`${pack.id}: only CC0 packs are configured so far`);
  for (const [src, dest] of pack.files) {
    const buf = await fetchBuf(`${pack.root}/${src}`);
    const file = join(out, dest);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, buf);
    console.log(`${String(buf.length).padStart(8)}  public/assets/${dest}`);
  }
  const res = await fetch(RAW + enc(`${pack.root}/License.txt`));
  if (!res.ok) throw new Error(`${res.status} License.txt for ${pack.id}`);
  await mkdir(join(out, 'licenses'), { recursive: true });
  await writeFile(join(out, 'licenses', `${pack.id}.txt`), await res.text());
}
console.log('licences written to public/assets/licenses/');
