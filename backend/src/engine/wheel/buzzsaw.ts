import { RNG } from '../rng';
import type { BuzzsawResult } from '../types';
import { BUZZSAW_BORDERS, BUZZSAW_ORDER } from '../../config/game';

const ROWS  = 3;
const REELS = 5;

/** Resolve Buzzsaw Bonus (GDD §12.6).
 *  Each row gets 0–2 buzzsaws that walk left→right, upgrading cell borders.
 *  Multiple passes stack: none→straw→wood→brick→mansion. */
export function resolveBuzzsaw(rng: RNG, totalBet: number): BuzzsawResult {
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(REELS).fill('none'));
  const rowBuzzsaws: number[] = [];

  for (let r = 0; r < ROWS; r++) {
    const n = rng.pickWeighted<number>([[0, 0.30], [1, 0.50], [2, 0.20]]);
    rowBuzzsaws.push(n);
    for (let k = 0; k < n; k++) {
      for (let c = 0; c < REELS; c++) {
        const curIdx = BUZZSAW_ORDER.indexOf(grid[r][c]);
        grid[r][c] = BUZZSAW_ORDER[Math.min(BUZZSAW_ORDER.length - 1, curIdx + 1)];
      }
    }
  }

  const payGrid: number[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: REELS }, (__, c) => BUZZSAW_BORDERS[grid[r][c]] ?? 0)
  );

  let total = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < REELS; c++)
      total += payGrid[r][c];

  const payout = total * totalBet;
  return { grid, payGrid, rowBuzzsaws, total, payout };
}
