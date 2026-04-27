/* API response types — mirrors backend src/engine/types.ts exactly */

export interface ApiCell {
  sym: string;
  golden: boolean;
  reel: number;
  row: number;
  winning: boolean;
  burstCreated: boolean;
  morphMark: boolean;
}

export interface LineWin {
  line: number;
  target: string;
  count: number;
  pay: number;
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

export interface MorphedCell {
  row: number;
  reel: number;
  sym: string;
  golden: boolean;
}

export interface ChainStep {
  stepIndex: number;
  multiplier: number;
  stepBaseWin: number;
  stepWin: number;
  lineWins: LineWin[];
  scatterCount: number;
  scatterWin: number;
  scatterPositions: { row: number; reel: number }[];
  bursts: BurstResult[];
  goldenConversions: GoldenConversion[];
  winPositions: string[];      // "row,reel"
  winCells: { row: number; reel: number }[];
  hasLineWin: boolean;
  morphedCells: MorphedCell[];
}

export interface JackpotResult {
  tier: string;
  payout: number;
  scale: number;
  base: number;
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
  grid: (string | null)[][];
  events: MansionEvent[];
  mansionCount: number;
  extraHatsAfterFull: number;
  payout: number;
}

export interface BuzzsawResult {
  grid: string[][];
  payGrid: number[][];
  rowBuzzsaws: number[];
  total: number;
  payout: number;
}

export interface MegaHatResult {
  grid: (string | null)[][];
  prizeGrid: number[][];
  spaceCount: number;
  hatCells: { row: number; reel: number }[];
  total: number;
  payout: number;
}

export type WheelBonusResult = JackpotResult | MansionResult | BuzzsawResult | MegaHatResult;

export interface WheelResult {
  segment: { type: string; idx: number };
  bonusType: 'WH_JP' | 'WH_MN' | 'WH_BZ' | 'WH_MH';
  bonus: WheelBonusResult;
  totalPayout: number;
}

export type ResolvedFeature =
  | { type: 'FS_TRIGGER';   scatterCount: number }
  | { type: 'FS_RETRIGGER'; scatterCount: number; spinsAdded: number }
  | { type: 'WHEEL';        wheelResult: WheelResult };

export interface FreeSpinsState {
  remaining: number;
  completed: number;
  runningTotal: number;
  lockedBet: number;
}

export interface SpinResponse {
  balanceBefore: number;
  balanceAfter: number;
  bet: number;
  grid: ApiCell[][];
  stops: number[];
  chain: ChainStep[];
  chainTotal: number;
  scatterWin: number;
  totalWin: number;
  chainLength: number;
  maxMultiplier: number;
  features: ResolvedFeature[];
  freeSpinsState: FreeSpinsState | null;
  spinId: number;
}

export interface SessionInitResponse {
  token: string;
  sessionId: string;
  balance: number;
  betLevelIdx: number;
  gameConfig?: unknown;
}

export type SpinType = 'manual' | 'autoplay' | 'free_spin' | 'buy_fs' | 'buy_wheel';
