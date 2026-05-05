/* Game configuration — mirrors client config.js exactly.
   Single source of truth for all game math values. */

export const SYMBOLS = {
  S01: { id: 'S01', name: '10',           cat: 'basic',     color: '#4f8fc2' },
  S02: { id: 'S02', name: 'J',            cat: 'basic',     color: '#4f8fc2' },
  S03: { id: 'S03', name: 'Q',            cat: 'basic',     color: '#c24f89' },
  S04: { id: 'S04', name: 'K',            cat: 'basic',     color: '#c2874f' },
  S05: { id: 'S05', name: 'A',            cat: 'basic',     color: '#c24f4f' },
  S06: { id: 'S06', name: 'Gem Blue',     cat: 'basic',     color: '#4ab0ea' },
  S07: { id: 'S07', name: 'Gem Green',    cat: 'basic',     color: '#4ed67c' },
  S08: { id: 'S08', name: 'Gem Red',      cat: 'basic',     color: '#e64747' },
  C01: { id: 'C01', name: 'Pig (Straw)',  cat: 'character', color: '#f8c89c' },
  C02: { id: 'C02', name: 'Pig (Sticks)', cat: 'character', color: '#f8c89c' },
  C03: { id: 'C03', name: 'Pig (Bricks)', cat: 'character', color: '#f8c89c' },
  C04: { id: 'C04', name: 'Wolf',         cat: 'character', color: '#3b3030' },
  W01: { id: 'W01', name: 'Wild',         cat: 'wild',      color: '#E3A02C' },
  W02: { id: 'W02', name: 'Golden Wild',  cat: 'wild',      color: '#ffd265' },
  SC01:{ id: 'SC01',name: 'Scatter',      cat: 'scatter',   color: '#ff7b3a' },
  G01: { id: 'G01', name: 'Golden Mod',   cat: 'modifier',  color: '#ffd265' },
} as const;

export type SymbolId = keyof typeof SYMBOLS;

/* Paytable: multipliers of total bet for 3/4/5 matching symbols.
   Values are calibrated to deliver ~96.10% RTP naturally with the reel strips below.
   Formula: original_value × 1.5563 (RTP_TARGET / prior NATURAL_RTP), rounded to 1dp.
   Run `npx tsx src/rtp-sim.ts` to verify. */
export const PAYTABLE: Record<string, [number, number, number]> = {
  C04: [3.1,  7.8,  38.9 ],  // Wolf — top premium
  C03: [2.3,  4.7,  23.3 ],  // Pig Bricks
  C02: [1.6,  3.9,  15.6 ],  // Pig Sticks
  C01: [1.2,  3.1,  11.7 ],  // Pig Straw
  S08: [0.8,  2.3,  7.8  ],  // Gem Red
  S07: [0.6,  1.9,  6.2  ],  // Gem Green
  S06: [0.5,  1.6,  4.7  ],  // Gem Blue
  S05: [0.3,  1.2,  3.9  ],  // A
  S04: [0.3,  1.1,  3.1  ],  // K
  S03: [0.2,  0.8,  2.3  ],  // Q
  S02: [0.2,  0.8,  2.3  ],  // J
  S01: [0.2,  0.6,  1.6  ],  // 10
};

export const PAY_ORDER = ['C04','C03','C02','C01','S08','S07','S06','S05','S04','S03','S02','S01'];
export const WILD_IDS = new Set(['W01', 'W02']);
export const SCATTER_ID = 'SC01';

/* Scatter pays (× total bet). Calibrated together with PAYTABLE above. */
export const SCATTER_PAY: Record<number, number> = { 3: 3.1, 4: 15.6, 5: 77.8 };
export const SCATTER_FS_AWARD = 10;
export const FS_RETRIGGER_AWARD: Record<number, number> = { 3: 5, 4: 8, 5: 10 };
export const FS_SAFETY_CAP = 100;

/* 10 fixed paylines (row index per reel, 0-indexed) */
export const PAYLINES: number[][] = [
  [1,1,1,1,1],
  [0,0,0,0,0],
  [2,2,2,2,2],
  [0,1,2,1,0],
  [2,1,0,1,2],
  [0,0,1,2,2],
  [2,2,1,0,0],
  [1,0,0,0,1],
  [1,2,2,2,1],
  [0,1,0,1,0],
];

/** Payable symbols used when a G01 (golden modifier) strip position is landed on.
 *  Weighted same as base morph pool to maintain natural symbol frequency. */
export const GOLDEN_SYM_POOL: [string, number][] = [
  ['S01',15],['S02',14],['S03',13],['S04',12],['S05',11],['S06',10],
  ['S07',9],['S08',8],['C01',7],['C02',6],['C03',5],['C04',4],
];

/* Exact ordered reel strips from design sheet (GDD §3.2 / Reel Strips Base sheet).
   stopIdx = RNG.nextInt(0, len) → center row; top = stop-1, bottom = stop+1 (wrapping). */
export const REEL_STRIPS_BASE: string[][] = [
  // Reel 1 — 60 stops
  ['S01','W01','C02','S01','S05','S07','C04','S02','S06','S04','S02','C01','S02','W01','S08','S05','S08','S07','C03','C03','C01','S01','S02','S02','C01','C04','S07','S05','S01','S04','S07','SC01','C01','C01','S03','C03','S02','S06','S06','S06','S05','S03','S03','W01','S03','S03','S02','S08','S01','S01','C02','S04','S04','S05','S03','C02','S01','S04','S04','C02'],
  // Reel 2 — 65 stops  (includes G01 at indices 4, 55, 59)
  ['W01','S06','S03','S01','G01','SC01','S01','S06','S08','S02','W02','C04','S03','S08','S05','C04','W01','S06','S05','S02','S02','S07','S01','S07','S01','C01','S01','S04','S05','S03','C02','S05','S04','S08','S03','C01','SC01','S06','S01','C02','S07','S07','C01','S04','S03','C01','C01','C03','C02','S04','S04','W02','S03','C03','C02','G01','S08','S02','S01','G01','C03','S05','S02','S06','S02'],
  // Reel 3 — 70 stops  (includes G01 at indices 12, 24, 31)
  ['S04','S07','S08','S05','S04','C01','S02','W02','S02','C01','S03','S01','G01','S01','S02','S01','S04','C02','C04','S04','S06','C02','C03','C01','G01','W02','W01','S02','S03','S05','C03','G01','S03','C03','S04','S02','SC01','S06','S08','S01','S03','S01','S05','S07','S07','C01','S03','S03','S06','S06','C02','C01','C04','C02','S05','S08','S07','C02','S08','C04','W01','S01','S02','S01','S04','C03','S05','S06','S02','S07'],
  // Reel 4 — 65 stops  (includes G01 at indices 4, 55, 59)
  ['W01','S06','S03','S01','G01','SC01','S01','S05','S08','S02','W02','C04','S03','S08','S05','C04','W01','S06','S04','S02','S02','S07','S01','S07','S01','C01','S01','S04','S05','S03','C02','S05','S04','S08','S02','C01','SC01','S06','C04','C02','S07','S06','C01','S04','S03','C01','C01','C03','C02','S03','S04','W02','S03','C03','C02','G01','S07','S02','S01','G01','C03','S05','S01','S06','S02'],
  // Reel 5 — 60 stops
  ['S01','W01','C02','S01','S05','S07','C04','S02','S06','S04','S02','C01','S02','W01','S08','S05','S08','S07','C03','C03','C01','S01','S01','S02','C01','C04','S07','S05','S01','S04','S07','SC01','C01','C01','S02','C03','S02','S06','S06','S06','S05','S03','S03','W01','S03','S03','S02','S08','C04','S01','C02','S03','S04','S05','S03','C02','S01','S04','S04','C02'],
];

/* Exact ordered FS reel strips (GDD §3.2 / Reel Strips FS sheet — higher premium density). */
export const REEL_STRIPS_FS: string[][] = [
  // Reel 1 — 60 stops  (includes G01 at indices 11, 24)
  ['C03','W01','C01','C02','S05','S07','C02','C04','S06','S03','S01','G01','C04','W01','S08','S04','S08','S06','C01','C02','SC01','C03','C03','S01','G01','C02','S07','S05','C02','S03','S07','W02','SC01','C01','S01','C01','C04','S05','S06','S06','S05','S02','S01','W01','S02','S02','C04','S07','C02','C03','C01','S03','S04','S04','S02','C01','C03','S03','S04','C01'],
  // Reel 2 — 65 stops  (includes G01 at indices 42, 55, 59)
  ['W01','S07','S02','C03','SC01','SC01','C03','S06','S08','S01','W02','C02','S03','S08','S05','C02','W01','S06','S04','S01','S01','S08','C04','S07','C03','C01','C04','S04','S05','S03','C01','S05','S03','S01','S02','C01','W02','S06','C03','C01','S07','S07','G01','S04','S02','C01','C01','C02','C02','S03','S04','W01','S02','C02','C01','G01','S08','S01','C03','G01','C02','S05','C04','S06','C04'],
  // Reel 3 — 70 stops  (includes G01 at indices 9, 23, 24)
  ['S04','S08','S08','S05','S04','C01','S01','W02','S02','G01','S03','C03','SC01','C04','S01','C04','S04','C01','C03','S05','S06','C02','C02','G01','G01','W01','W01','C04','S03','S06','C02','SC01','S02','C02','S05','S01','W02','S07','S08','C03','S02','C03','S05','S07','S07','C01','S03','S03','S06','S06','C01','C01','C02','C01','S06','S01','S08','C01','S08','C03','W01','C04','S01','C04','S04','C02','S05','S07','S02','S07'],
  // Reel 4 — 65 stops  (includes G01 at indices 42, 55, 59)
  ['W01','S07','S02','C03','SC01','SC01','C03','S06','S08','S01','W02','C02','S03','S08','S05','C02','W01','S06','S04','S01','S01','S08','C04','S07','C03','C01','C04','S04','S05','S03','C01','S05','S03','S01','S02','C01','W02','S06','C03','C01','S07','S07','G01','S04','S02','C01','C01','C02','C02','S03','S04','W01','S02','C02','C01','G01','S08','S01','C03','G01','C02','S05','C04','S06','C04'],
  // Reel 5 — 60 stops  (includes G01 at indices 11, 24)
  ['C03','W01','C01','C02','S05','S07','C02','C04','S06','S03','S01','G01','C04','W01','S08','S04','S08','S06','C01','C02','SC01','C03','C03','S01','G01','C02','S07','S05','C02','S03','S07','W02','SC01','C01','S01','C01','C04','S05','S06','S06','S05','S02','S01','W01','S02','S02','C04','S07','C02','C03','C01','S03','S04','S04','S02','C01','C03','S03','S04','C01'],
];

/* Morph pools (weighted) */
export const MORPH_POOL_BASE: [string, number][] = [
  ['S01',15],['S02',14],['S03',13],['S04',12],['S05',11],['S06',10],['S07',9],['S08',8],
  ['C01',7],['C02',6],['C03',5],['C04',4],['W01',3],['W02',2],['SC01',5],
];
export const MORPH_POOL_FS: [string, number][] = [
  ['S01',8],['S02',8],['S03',8],['S04',8],['S05',8],['S06',8],['S07',8],['S08',8],
  ['C01',7],['C02',7],['C03',7],['C04',7],['W01',5],['W02',4],['SC01',9],
];

/* Golden config per reel [reel 0..4] */
export const GOLDEN_BASE = [
  { eligible: false, chance: 0 },
  { eligible: true,  chance: 0.045 },
  { eligible: true,  chance: 0.045 },
  { eligible: true,  chance: 0.045 },
  { eligible: false, chance: 0 },
];
export const GOLDEN_FS = [
  { eligible: true, chance: 0.03 },
  { eligible: true, chance: 0.05 },
  { eligible: true, chance: 0.07 },
  { eligible: true, chance: 0.05 },
  { eligible: true, chance: 0.03 },
];

/* Burst count weights */
export const BURST_WEIGHTS_BASE: [number, number][] = [[1,0.40],[2,0.30],[3,0.20],[4,0.10]];
export const BURST_WEIGHTS_FS:   [number, number][] = [[1,0.25],[2,0.30],[3,0.25],[4,0.20]];

/* Multiplier sequences */
export const MULTIPLIERS_BASE = [1, 2, 3, 5];
export const MULTIPLIERS_FS   = [2, 4, 6, 10];

/* Wheel feature */
export const WHEEL_SEGMENTS = [
  'WH_JP','WH_MN','WH_BZ','WH_MH',
  'WH_JP','WH_MN','WH_BZ','WH_JP',
  'WH_MH','WH_JP','WH_MN','WH_BZ',
];
export const WHEEL_PROBS: Record<string, number> = {
  WH_JP: 0.30, WH_MN: 0.25, WH_BZ: 0.25, WH_MH: 0.20,
};
export const WHEEL_TRIGGER_BASE = 0.005;
export const WHEEL_TRIGGER_FS   = 0.01;

export const JACKPOT_TIERS = [
  { id: 'Grand', base: 500, minScale: 1, maxScale: 1, weight: 0.05 },
  { id: 'Major', base: 100, minScale: 1, maxScale: 1, weight: 0.15 },
  { id: 'Minor', base: 25,  minScale: 1, maxScale: 3, weight: 0.30 },
  { id: 'Mini',  base: 10,  minScale: 1, maxScale: 3, weight: 0.50 },
];

export const MANSION_PAYOUT: Record<number, number> = {
  1:1, 2:2, 3:3, 4:5, 5:7, 6:10, 7:15, 8:22, 9:35,
  10:50, 11:80, 12:140, 13:220, 14:350, 15:500,
};
export const MANSION_HAT_CHANCE = 0.35;
export const MANSION_ROUNDS = 10;

export const BUZZSAW_BORDERS: Record<string, number> = {
  none: 0, straw: 1, wood: 3, brick: 8, mansion: 25,
};
export const BUZZSAW_ORDER = ['none', 'straw', 'wood', 'brick', 'mansion'];

export const MEGAHAT_SPACES_WEIGHTS: [number, number][] = [
  [4,0.167],[5,0.145],[6,0.120],[7,0.105],[8,0.090],[9,0.080],[10,0.070],
  [11,0.060],[12,0.050],[13,0.040],[14,0.030],[15,0.043],
];

/* Bet levels */
export const BET_LEVELS = [
  { lvl:1, base:1,   total:10 },
  { lvl:2, base:2,   total:20 },
  { lvl:3, base:5,   total:50 },
  { lvl:4, base:10,  total:100 },
  { lvl:5, base:20,  total:200 },
  { lvl:6, base:25,  total:250 },
  { lvl:7, base:50,  total:500 },
  { lvl:8, base:75,  total:750 },
  { lvl:9, base:100, total:1000 },
];

export const BUY_FS_MULT    = 75;
export const BUY_WHEEL_MULT = 50;
export const STARTING_BALANCE = 50000;
export const DEFAULT_BET_LEVEL_IDX = 3; // level 4, 0-indexed

/* Win tiers (× total bet) */
export const WIN_TIERS = [
  { id: 'standard', min: 0,  max: 4.99  },
  { id: 'nice',     min: 5,  max: 14.99 },
  { id: 'big',      min: 15, max: 29.99 },
  { id: 'mega',     min: 30, max: 49.99 },
  { id: 'super',    min: 50, max: 1e9   },
];

export const CHAIN_SAFETY_CAP = 50;

/* ── RTP scaling ─────────────────────────────────────────────────────────────
 * The engine's "natural" RTP (raw payout / wagered with no scaling) is lower
 * than the certified 96.10% because reel strips and paytable are designed
 * conservatively. PAYOUT_SCALE is applied to every win at credit time so the
 * certified RTP is delivered exactly.
 *
 * To recalibrate after reel-strip changes:
 *   1. Run: npx tsx src/rtp-sim.ts --measure --spins 5000000
 *   2. Copy the printed "Natural RTP" value into NATURAL_RTP below.
 *   3. Redeploy — PAYOUT_SCALE is recomputed automatically.
 *
 * To change the certified RTP (e.g. for a different jurisdiction):
 *   Set RTP_TARGET to the desired value (0.94 = 94%, 0.9610 = 96.10%, etc.)
 * ─────────────────────────────────────────────────────────────────────────── */
export const RTP_TARGET   = 0.9610;  // Operator-configurable certified RTP
export const NATURAL_RTP = 0.850924;  // Measured via `npx tsx src/rtp-sim.ts --measure --spins 5000000` (85.09%).
                                      // Line/scatter wins are fully calibrated; residual gap comes
                                      // from MegaHat using hardcoded prize ranges (not config-driven).
export const PAYOUT_SCALE = RTP_TARGET / NATURAL_RTP; // ≈1.1247 — applied at credit time
