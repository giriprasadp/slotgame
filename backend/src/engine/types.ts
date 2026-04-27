/* Shared game engine types — mirrors the client Cell/ChainStep/SpinResponse shapes exactly. */

export interface Cell {
  sym: string;
  golden: boolean;
  reel: number;
  row: number;
  winning: boolean;
  burstCreated: boolean;
  morphMark: boolean;
  /** Internal burst claim flag — not serialised to client */
  _burstClaimed?: boolean;
}

export interface LineWin {
  line: number;     // 1-indexed payline number
  target: string;   // symbol id
  count: number;    // 3|4|5
  pay: number;      // raw payout in coins
  positions: { reel: number; row: number }[];
}

export interface BurstResult {
  origin: { row: number; reel: number };
  targets: { row: number; reel: number }[];
}

export interface GoldenConversion {
  row: number;
  reel: number;
  baseSym: string;
}

export interface ChainStep {
  stepIndex:         number;
  multiplier:        number;
  stepBaseWin:       number;
  stepWin:           number;
  lineWins:          LineWin[];
  scatterCount:      number;
  scatterWin:        number;
  scatterPositions:  { row: number; reel: number }[];
  bursts:            BurstResult[];
  goldenConversions: GoldenConversion[];
  winPositions:      string[];              // "row,reel"
  winCells:          { row: number; reel: number }[];
  hasLineWin:        boolean;
  /** Cells replaced by morph this step — used by client for grid replay */
  morphedCells:      MorphedCell[];
}

export interface MorphedCell {
  row: number;
  reel: number;
  sym: string;
  golden: boolean;
}

export type GameMode = 'BASE' | 'FS';

export type SpinType = 'manual' | 'autoplay' | 'free_spin' | 'buy_fs' | 'buy_wheel';

/* ─── Wheel result types ─────────────────────────────────────────────────── */
export interface WheelSegment {
  type: string;  // WH_JP | WH_MN | WH_BZ | WH_MH
  idx:  number;  // index in WHEEL_SEGMENTS array (for animation)
}

export interface JackpotResult {
  tier:    string;   // Grand | Major | Minor | Mini
  payout:  number;
  scale:   number;
  base:    number;
}

export interface MansionEvent {
  type: 'miss' | 'land' | 'relocate' | 'fullbonus';
  round: number;
  row?: number;
  reel?: number;
  fromRow?: number;
  fromReel?: number;
}

export interface MansionResult {
  grid:                 (string | null)[][];
  events:               MansionEvent[];
  mansionCount:         number;
  extraHatsAfterFull:   number;
  payout:               number;
}

export interface BuzzsawResult {
  grid:        string[][];
  payGrid:     number[][];
  rowBuzzsaws: number[];
  total:       number;
  payout:      number;
}

export interface MegaHatResult {
  grid:       (string | null)[][];
  prizeGrid:  number[][];
  spaceCount: number;
  hatCells:   { row: number; reel: number }[];
  total:      number;
  payout:     number;
}

export type WheelBonusResult = JackpotResult | MansionResult | BuzzsawResult | MegaHatResult;

export interface WheelResult {
  segment:     WheelSegment;
  bonusType:   'WH_JP' | 'WH_MN' | 'WH_BZ' | 'WH_MH';
  bonus:       WheelBonusResult;
  totalPayout: number;
}

/* ─── Full spin result from engine ──────────────────────────────────────── */
export type PendingFeature =
  | { type: 'FS_TRIGGER';   scatterCount: number }
  | { type: 'FS_RETRIGGER'; scatterCount: number }
  | { type: 'WHEEL' };

export interface ChainResult {
  chainSteps:      ChainStep[];
  chainTotal:      number;
  totalLineWin:    number;
  totalScatterWin: number;
  chainLength:     number;
  maxMultiplier:   number;
  pendingFeatures: PendingFeature[];
}

/* ─── API response shape (sent to client) ───────────────────────────────── */
export interface SpinResponse {
  balanceBefore:  number;
  balanceAfter:   number;
  bet:            number;
  grid:           Cell[][];
  stops:          number[];
  chain:          ChainStep[];
  chainTotal:     number;
  scatterWin:     number;
  totalWin:       number;
  chainLength:    number;
  maxMultiplier:  number;
  features:       ResolvedFeature[];
  freeSpinsState: FreeSpinsState | null;
  spinId:         number;
}

export type ResolvedFeature =
  | { type: 'FS_TRIGGER';   scatterCount: number }
  | { type: 'FS_RETRIGGER'; scatterCount: number; spinsAdded: number }
  | { type: 'WHEEL';        wheelResult: WheelResult };

export interface FreeSpinsState {
  remaining:    number;
  completed:    number;
  runningTotal: number;
  lockedBet:    number;
}
