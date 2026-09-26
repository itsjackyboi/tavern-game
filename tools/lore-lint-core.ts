import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// Scans shipped files for post-464 names. Pure functions so tests can call them.

export interface ForbiddenPattern {
  pattern: string;
  reason: string;
  caseSensitive?: boolean;
}

export interface LoreHit {
  file: string;
  line: number;
  match: string;
  reason: string;
}

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.svg']);

export function compile(patterns: ForbiddenPattern[]): Array<{ re: RegExp; reason: string }> {
  return patterns.map((p) => ({
    // Spaces in a pattern match any run of whitespace.
    re: new RegExp(p.pattern.replace(/ /g, '\\s+'), p.caseSensitive ? 'g' : 'gi'),
    reason: p.reason,
  }));
}

export function scanText(text: string, file: string, rules: ReturnType<typeof compile>): LoreHit[] {
  const hits: LoreHit[] = [];
  for (const { re, reason } of rules) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      hits.push({ file, line, match: m[0], reason });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return hits;
}

export function listFiles(root: string, dir: string, skip: (rel: string) => boolean): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = join(dir, name);
    if (skip(rel)) continue;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...listFiles(root, rel, skip));
    else if (TEXT_EXT.has(extname(name))) out.push(rel);
  }
  return out;
}

/** Scans the shipped surface: index.html, src/, public/, CREDITS.md and dist/ (if built). */
export function lintTree(root: string, patterns: ForbiddenPattern[], targets = ['index.html', 'dev.html', 'CREDITS.md', 'src', 'public', 'dist']): LoreHit[] {
  const rules = compile(patterns);
  const skip = (rel: string) => rel.includes('node_modules');
  const hits: LoreHit[] = [];
  for (const t of targets) {
    let files: string[];
    try {
      files = statSync(join(root, t)).isDirectory() ? listFiles(root, t, skip) : [t];
    } catch {
      continue;
    }
    for (const f of files) hits.push(...scanText(readFileSync(join(root, f), 'utf8'), relative(root, join(root, f)), rules));
  }
  return hits;
}

export function loadPatterns(root: string): ForbiddenPattern[] {
  const raw = JSON.parse(readFileSync(join(root, 'tools/lore/forbidden.json'), 'utf8')) as { patterns: ForbiddenPattern[] };
  return raw.patterns;
}
