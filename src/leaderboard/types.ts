import type { CityId } from '../content/schema.ts';

export type Board = 'monopoly' | 'cv';
export type BoardCategory = 'overall' | CityId | 'assisted' | 'ngplus';

export interface RunRecord {
  runId: string;
  clientId: string;
  name: string;
  homeCity: CityId;
  category: 'standard' | 'assisted' | 'ngplus';
  winType: 'monopoly' | 'sponsor';
  monopolyMs: number | null;
  finalCV: number;
  peakCV: number;
  splits: { firstSisterMs: number | null; thirdSisterMs: number | null; firstNo1Ms: number | null };
  simMs: number;
  realMs: number;
  pauses: number;
  sessions: number;
  seed: string;
  build: string;
  contentHash: string;
  date: string;
}

export interface BoardRow {
  rank: number;
  name: string;
  homeCity: CityId;
  value: number;
  winType: string;
  date: string;
}

export type SubmitResult = 'ok' | 'retry' | 'refused';

export interface LeaderboardAdapter {
  readonly shared: boolean;
  submit(rec: RunRecord): Promise<SubmitResult>;
  board(board: Board, cat: BoardCategory, n: number): Promise<BoardRow[]>;
}
