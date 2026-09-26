import type { CityId } from '../content/schema.ts';

/** v1.x runs are pre-release (testing) records; from v2.0 they're official. */
export type Era = 'pre' | 'official';
export type RunResult = 'monopoly' | 'sponsor' | 'lost' | 'bankrupt';

/** One finished run, as sent to the sheet. Every run is logged; only wins make a board. */
export interface RunRecord {
  runId: string;
  clientId: string;
  /** The innkeeper (character) name. */
  name: string;
  tavernName: string;
  homeCity: CityId;
  category: 'standard' | 'assisted' | 'ngplus';
  result: RunResult;
  monopolyMs: number | null;
  finalCV: number;
  peakCV: number;
  splits: { firstSisterMs: number | null; thirdSisterMs: number | null; firstNo1Ms: number | null };
  simMs: number;
  realMs: number;
  pauses: number;
  sessions: number;
  seed: string;
  /** The game version, e.g. "v1.5". Its major number picks the era. */
  version: string;
  contentHash: string;
  date: string;
}

export interface BoardRow {
  rank: number;
  name: string;
  tavern: string;
  /** Monopoly: milliseconds to monopoly. Sponsorship: final Company Value. */
  value: number;
  homeCity: CityId;
  category: string;
  version: string;
  date: string;
}

/** The two top tens: fastest monopolies and the biggest sponsors. */
export interface Boards {
  monopoly: BoardRow[];
  sponsor: BoardRow[];
}

export type SubmitResult = 'ok' | 'retry' | 'refused';

export interface LeaderboardAdapter {
  readonly shared: boolean;
  submit(rec: RunRecord): Promise<SubmitResult>;
  boards(era: Era): Promise<Boards>;
}
