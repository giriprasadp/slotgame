import { RNG } from '../rng';
import type { MansionResult, MansionEvent } from '../types';
import { MANSION_HAT_CHANCE, MANSION_ROUNDS, MANSION_PAYOUT } from '../../config/game';

const ROWS  = 3;
const REELS = 5;

/** Resolve Mansion Bonus (GDD §12.5).
 *  Hats land on a 3×5 grid; duplicates relocate to empty cells.
 *  Full-screen extras pay 10× bet. */
export function resolveMansion(rng: RNG, totalBet: number): MansionResult {
  const grid: (string | null)[][] = Array.from({ length: ROWS }, () => Array(REELS).fill(null));
  const events: MansionEvent[] = [];
  let mansionCount = 0;
  let extraHatsAfterFull = 0;

  for (let i = 0; i < MANSION_ROUNDS; i++) {
    if (!rng.chance(MANSION_HAT_CHANCE)) {
      events.push({ type: 'miss', round: i });
      continue;
    }

    const row  = rng.nextInt(0, ROWS);
    const reel = rng.nextInt(0, REELS);

    if (!grid[row][reel]) {
      grid[row][reel] = 'mansion';
      mansionCount++;
      events.push({ type: 'land', round: i, row, reel });
    } else {
      // Duplicate — relocate to a random empty cell
      const empties: { row: number; reel: number }[] = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < REELS; c++)
          if (!grid[r][c]) empties.push({ row: r, reel: c });

      if (empties.length > 0) {
        const pick = empties[rng.nextInt(0, empties.length)];
        grid[pick.row][pick.reel] = 'mansion';
        mansionCount++;
        events.push({
          type: 'relocate', round: i,
          fromRow: row, fromReel: reel,
          row: pick.row, reel: pick.reel,
        });
      } else {
        // Grid full — extra hat pays 10× bet
        extraHatsAfterFull++;
        events.push({ type: 'fullbonus', round: i });
      }
    }
  }

  const baseMult = MANSION_PAYOUT[Math.min(15, mansionCount)] ?? 0;
  const payout   = baseMult * totalBet + extraHatsAfterFull * 10 * totalBet;

  return { grid, events, mansionCount, extraHatsAfterFull, payout };
}
