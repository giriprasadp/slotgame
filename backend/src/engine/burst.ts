import { RNG } from './rng';
import type { Cell, BurstResult } from './types';
import { BURST_WEIGHTS_BASE, BURST_WEIGHTS_FS } from '../config/game';
import type { GameMode } from './types';

/** 8-neighbourhood offsets */
const ADJ: [number, number][] = [
  [-1,-1],[-1,0],[-1,1],
  [ 0,-1],        [0,1],
  [ 1,-1],[ 1,0],[ 1,1],
];

/** Resolve a single Bursting Wild at originCell.
 *  Places W01 in 1–4 adjacent cells (weighted by mode).
 *  Never places W02 (prevents recursive bursts — GDD §9.1).
 *  Returns the list of targeted cells. */
export function resolveBurst(
  rng: RNG,
  grid: Cell[][],
  originCell: Cell,
  mode: GameMode
): BurstResult {
  const weights = mode === 'FS' ? BURST_WEIGHTS_FS : BURST_WEIGHTS_BASE;
  const count = rng.pickWeighted(weights);

  const candidates: { row: number; reel: number }[] = [];
  for (const [dr, dc] of ADJ) {
    const nr = originCell.row + dr;
    const nc = originCell.reel + dc;
    if (nr < 0 || nr >= 3 || nc < 0 || nc >= 5) continue;
    const target = grid[nr][nc];
    if (target.sym === 'SC01') continue;    // scatters immune (GDD §5.2)
    if (target._burstClaimed) continue;     // already claimed this burst pass
    candidates.push({ row: nr, reel: nc });
  }

  const actualCount = Math.min(count, candidates.length);
  const targets: { row: number; reel: number }[] = [];

  if (actualCount > 0) {
    const chosen = rng.sample(candidates, actualCount);
    for (const { row, reel } of chosen) {
      const cell = grid[row][reel];
      cell.sym = 'W01';
      cell.golden = false;
      cell.burstCreated = true;
      cell._burstClaimed = true;
      targets.push({ row, reel });
    }
  }

  return {
    origin: { row: originCell.row, reel: originCell.reel },
    targets,
  };
}

/** Clear _burstClaimed flags on all cells before a new evaluation step. */
export function clearBurstClaims(grid: Cell[][]): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      delete grid[r][c]._burstClaimed;
    }
  }
}
