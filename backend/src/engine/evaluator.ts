import { RNG } from './rng';
import type { Cell, LineWin } from './types';
import {
  PAYTABLE, PAYLINES, SCATTER_PAY, WILD_IDS, SCATTER_ID,
  REEL_STRIPS_BASE, REEL_STRIPS_FS, GOLDEN_SYM_POOL,
} from '../config/game';
import type { GameMode } from './types';

/** Build a fresh Cell object (mirrors client Evaluator.cellFromId). */
export function cellFromId(symId: string, reel: number, row: number): Cell {
  return {
    sym: symId,
    golden: false,
    reel,
    row,
    winning: false,
    burstCreated: false,
    morphMark: false,
  };
}

/** Generate a full 3×5 grid from reel strips using provided RNG instance.
 *  Returns grid and stop indices for audit logging. */
export function spinGrid(
  rng: RNG,
  mode: GameMode
): { grid: Cell[][]; stops: number[] } {
  const strips = mode === 'FS' ? REEL_STRIPS_FS : REEL_STRIPS_BASE;
  const grid: Cell[][] = [[], [], []];
  const stops: number[] = [];

  for (let r = 0; r < 5; r++) {
    const strip = strips[r];
    const len = strip.length;
    const stopIdx = rng.nextInt(0, len);
    stops.push(stopIdx);
    for (let row = 0; row < 3; row++) {
      const idx = ((stopIdx - 1 + row) % len + len) % len;
      const symId = strip[idx];
      if (symId === 'G01') {
        // G01 strip position = always-golden cell; pick underlying payable symbol
        const cell = cellFromId(rng.pickWeighted(GOLDEN_SYM_POOL), r, row);
        cell.golden = true;
        grid[row][r] = cell;
      } else {
        grid[row][r] = cellFromId(symId, r, row);
      }
    }
  }

  return { grid, stops };
}

/** Check if a cell matches a target symbol (with Wild substitution). */
function matchSymbol(cell: Cell, target: string): boolean {
  if (cell.sym === target) return true;
  if (WILD_IDS.has(cell.sym) && target !== SCATTER_ID) return true;
  return false;
}

/** Evaluate a single payline. Returns best win or null. */
function evalLine(
  grid: Cell[][],
  line: number[],
  totalBet: number
): LineWin | null {
  const cells = line.map((rowIdx, reel) => grid[rowIdx][reel]);

  // First cell cannot be scatter
  if (cells[0].sym === SCATTER_ID) return null;

  // Find first non-wild symbol to use as target
  const candidates = new Set<string>();
  for (const c of cells) {
    if (!WILD_IDS.has(c.sym) && c.sym !== SCATTER_ID) {
      candidates.add(c.sym);
      break;
    }
  }
  // All-wilds: pay as C04 (highest payer — GDD §4.5 rule 6)
  if (candidates.size === 0) candidates.add('C04');

  let best: LineWin | null = null;
  for (const target of candidates) {
    if (!PAYTABLE[target]) continue;
    let count = 0;
    const positions: { reel: number; row: number }[] = [];
    for (let r = 0; r < 5; r++) {
      if (matchSymbol(cells[r], target)) {
        count++;
        positions.push({ reel: r, row: line[r] });
      } else break;
    }
    if (count >= 3) {
      const pay = PAYTABLE[target][count - 3] * totalBet;
      if (!best || pay > best.pay) {
        best = { line: 0 /* filled by caller */, target, count, pay, positions };
      }
    }
  }
  return best;
}

export interface EvalResult {
  lineWins:         LineWin[];
  scatterWin:       number;
  scatterCount:     number;
  scatterPositions: { row: number; reel: number }[];
  winPositions:     Set<string>;       // "row,reel"
  winCells:         { row: number; reel: number }[];
  totalBaseWin:     number;
}

/** Full grid evaluation — paylines + scatter. Mirrors client Evaluator.evaluate(). */
export function evaluate(grid: Cell[][], totalBet: number): EvalResult {
  const lineWins: LineWin[] = [];
  let totalBaseWin = 0;
  const winPositionsSet = new Set<string>();

  PAYLINES.forEach((line, idx) => {
    const w = evalLine(grid, line, totalBet);
    if (w) {
      w.line = idx + 1;
      lineWins.push(w);
      totalBaseWin += w.pay;
      for (const p of w.positions) {
        winPositionsSet.add(`${p.row},${p.reel}`);
      }
    }
  });

  // Scatter: count anywhere on grid
  let scatterCount = 0;
  const scatterPositions: { row: number; reel: number }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r][c].sym === SCATTER_ID) {
        scatterCount++;
        scatterPositions.push({ row: r, reel: c });
      }
    }
  }

  let scatterWin = 0;
  if (scatterCount >= 3) {
    const mult = SCATTER_PAY[Math.min(5, scatterCount)] ?? 0;
    scatterWin = mult * totalBet;
  }

  const winCells = [...winPositionsSet].map(k => {
    const [row, reel] = k.split(',').map(Number);
    return { row, reel };
  });

  return {
    lineWins,
    scatterWin,
    scatterCount,
    scatterPositions,
    winPositions: winPositionsSet,
    winCells,
    totalBaseWin,
  };
}
