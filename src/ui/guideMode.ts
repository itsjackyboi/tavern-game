// Beginner / Experienced, chosen on the home screen. Beginner only adds
// explanations (a guide the first time each menu opens); gameplay is the same.

export type PlayMode = 'beginner' | 'experienced';

const MODE_KEY = 'last-call:mode';
const SEEN_KEY = 'last-call:guides-seen';

export function getMode(): PlayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'experienced' ? 'experienced' : 'beginner';
  } catch {
    return 'beginner';
  }
}

export function setMode(m: PlayMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
}

export function seenGuides(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function markGuideSeen(id: string): void {
  const s = seenGuides();
  s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

export function resetGuides(): void {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
}
