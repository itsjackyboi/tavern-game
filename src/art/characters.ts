import { rogue, type SpriteRef } from './atlas.ts';

// Patron and staff looks composed from Kenney's Roguelike Characters paper-doll
// sheet: body (skin), shirt, hair/beard and an optional hat. A look is a seed;
// the segment biases the clothes so each crowd reads at a glance.

export interface Look {
  body: SpriteRef;
  shirt: SpriteRef;
  hair: SpriteRef;
  hat: SpriteRef | null;
}

type Cols = [number, number];
interface Style {
  cols: Cols;
  rows: number[];
  hat?: number;
  orc?: boolean;
}

// Shirt columns: 6-9 warm, 10-13 teal, 14-17 lavender/white/dark. Rows are cuts.
const SEGMENT_STYLE: Record<string, Style> = {
  farmers: { cols: [6, 13], rows: [6, 7, 8, 10] },
  brewers: { cols: [6, 9], rows: [0, 1, 4] },
  craftsmen: { cols: [10, 13], rows: [4, 6, 7] },
  traders: { cols: [14, 17], rows: [0, 1, 5] },
  miners: { cols: [10, 13], rows: [8, 9, 10] },
  pirates: { cols: [6, 13], rows: [2, 3], hat: 0.4 },
  tideCallers: { cols: [10, 13], rows: [0, 2, 3] },
  coralEyed: { cols: [10, 13], rows: [6, 7], orc: true },
  ashenOath: { cols: [14, 17], rows: [6, 8, 10] },
  captains: { cols: [6, 9], rows: [2, 3, 9], hat: 0.5 },
  drifters: { cols: [6, 17], rows: [4, 7] },
  apostles: { cols: [14, 17], rows: [5, 7, 9] },
  circs: { cols: [14, 17], rows: [0, 3] },
  sextons: { cols: [6, 9], rows: [6, 8] },
  pilgrims: { cols: [14, 17], rows: [1, 2] },
  kalifarts: { cols: [14, 17], rows: [3], hat: 1 },
  merchants: { cols: [14, 17], rows: [6, 7, 8] },
  stallhands: { cols: [6, 9], rows: [8, 9, 10] },
  rotoPirates: { cols: [6, 13], rows: [2, 3], hat: 0.4 },
  smugglers: { cols: [14, 17], rows: [8, 10] },
  magnates: { cols: [14, 17], rows: [9, 10], hat: 1 },
};

const hash = (n: number, salt: number) => {
  let x = (n ^ (salt * 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};

export function lookFor(seed: number, segment: string, vip = false): Look {
  const st = SEGMENT_STYLE[segment] ?? { cols: [6, 17] as Cols, rows: [0, 1, 2, 3] };
  const bodyRow = st.orc ? 3 : hash(seed, 1) % 3;
  const bodyCol = hash(seed, 2) % 2;
  const shirtCol = st.cols[0] + (hash(seed, 3) % (st.cols[1] - st.cols[0] + 1));
  const shirtRow = st.rows[hash(seed, 4) % st.rows.length]!;
  const hairCol = 19 + (hash(seed, 5) % 8);
  const hairRow = hash(seed, 6) % 11;
  const wantHat = vip || (st.hat !== undefined && (hash(seed, 7) % 100) / 100 < st.hat);
  const hat = wantHat ? rogue(28 + (hash(seed, 8) % 4), vip ? 9 : hash(seed, 9) % 10) : null;
  return { body: rogue(bodyCol, bodyRow), shirt: rogue(shirtCol, shirtRow), hair: rogue(hairCol, hairRow), hat };
}

/** Staff wear aprons by role; the owner is always the same recognisable figure. */
export function staffLook(seed: number, role: string): Look {
  const roleShirt: Record<string, [number, number]> = {
    owner: [10, 1], bar: [7, 1], floor: [11, 1], door: [9, 5], cellar: [8, 6], stage: [15, 2],
  };
  const [sc, sr] = roleShirt[role] ?? [7, 1];
  if (role === 'owner') return { body: rogue(0, 0), shirt: rogue(sc, sr), hair: rogue(22, 1), hat: null };
  return {
    body: rogue(hash(seed, 2) % 2, hash(seed, 1) % 3),
    shirt: rogue(sc, sr),
    hair: rogue(19 + (hash(seed, 5) % 8), hash(seed, 6) % 11),
    hat: role === 'door' ? rogue(29, 5) : null,
  };
}
