import { RNG } from '../rng';
import type { MegaHatResult } from '../types';
import { MEGAHAT_SPACES_WEIGHTS } from '../../config/game';

const ROWS  = 3;
const REELS = 5;

/** Resolve Mega Hat Bonus (GDD §12.7).
 *  Oversized hats cover 4–15 cells; remaining cells receive prize values. */
export function resolveMegaHat(rng: RNG, totalBet: number): MegaHatResult {
  const spaceCount = rng.pickWeighted(MEGAHAT_SPACES_WEIGHTS);

  // Choose random cells to be hat-covered
  const allCells: { row: number; reel: number }[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < REELS; c++)
      allCells.push({ row: r, reel: c });

  const hatCells = rng.sample(allCells, spaceCount);
  const hatSet   = new Set(hatCells.map(p => `${p.row},${p.reel}`));

  const grid:      (string | null)[][] = Array.from({ length: ROWS }, () => Array(REELS).fill(null));
  const prizeGrid: number[][]          = Array.from({ length: ROWS }, () => Array(REELS).fill(0));
  let total = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < REELS; c++) {
      const isHat = hatSet.has(`${r},${c}`);
      if (isHat) {
        grid[r][c] = 'hat';
        const bonus = Math.ceil(spaceCount / 3);
        prizeGrid[r][c] = bonus;
        total += bonus;
      } else {
        grid[r][c] = 'prize';
        const roll = rng.nextFloat();
        let v: number;
        if (roll < 0.50)      v = rng.nextInt(1, 4);
        else if (roll < 0.80) v = rng.nextInt(3, 8);
        else if (roll < 0.95) v = rng.nextInt(8, 20);
        else                  v = rng.nextInt(20, 50);
        prizeGrid[r][c] = v;
        total += v;
      }
    }
  }

  const payout = total * totalBet;
  return { grid, prizeGrid, spaceCount, hatCells, total, payout };
}
