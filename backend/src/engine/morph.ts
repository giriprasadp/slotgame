import { RNG } from './rng';
import type { Cell, ChainStep, GoldenConversion, MorphedCell, ChainResult, PendingFeature, GameMode } from './types';
import { evaluate } from './evaluator';
import { resolveBurst, clearBurstClaims } from './burst';
import { cellFromId } from './evaluator';
import {
  MORPH_POOL_BASE, MORPH_POOL_FS,
  GOLDEN_BASE, GOLDEN_FS,
  MULTIPLIERS_BASE, MULTIPLIERS_FS,
  SCATTER_ID, WILD_IDS,
  FS_RETRIGGER_AWARD, FS_SAFETY_CAP,
  WHEEL_TRIGGER_BASE, WHEEL_TRIGGER_FS,
  CHAIN_SAFETY_CAP,
  PAYTABLE,
} from '../config/game';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function multForStep(step: number, mode: GameMode): number {
  const seq = mode === 'FS' ? MULTIPLIERS_FS : MULTIPLIERS_BASE;
  return seq[Math.min(step, seq.length - 1)];
}

function pickMorphSymbol(rng: RNG, mode: GameMode): string {
  const pool = mode === 'FS' ? MORPH_POOL_FS : MORPH_POOL_BASE;
  return rng.pickWeighted(pool);
}

function canBeGolden(symId: string): boolean {
  return symId !== SCATTER_ID
    && symId !== 'W01'
    && symId !== 'W02'
    && symId !== 'G01'
    && !!PAYTABLE[symId];
}

function rollGolden(rng: RNG, reel: number, mode: GameMode): boolean {
  const cfg = (mode === 'FS' ? GOLDEN_FS : GOLDEN_BASE)[reel];
  if (!cfg || !cfg.eligible) return false;
  return rng.chance(cfg.chance);
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/** Apply golden overlay rolls to all eligible cells on initial spin.
 *  Mirrors client Morph.applyGoldenRolls(). */
export function applyGoldenRolls(rng: RNG, grid: Cell[][], mode: GameMode): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = grid[r][c];
      if (cell.golden) continue;
      if (!canBeGolden(cell.sym)) continue;
      if (rollGolden(rng, c, mode)) {
        cell.golden = true;
      }
    }
  }
}

/** Replace winning cells with new symbols from morph pool.
 *  Also rolls golden chance on each new morph fill.  */
export function executeMorph(
  rng: RNG,
  grid: Cell[][],
  winCells: { row: number; reel: number }[],
  mode: GameMode
): MorphedCell[] {
  const newCells: MorphedCell[] = [];
  for (const { row, reel } of winCells) {
    const newSym = pickMorphSymbol(rng, mode);
    const cell = cellFromId(newSym, reel, row);
    if (canBeGolden(newSym) && rollGolden(rng, reel, mode)) {
      cell.golden = true;
    }
    grid[row][reel] = cell;
    newCells.push({ row, reel, sym: newSym, golden: cell.golden });
  }
  return newCells;
}

/** Convert Golden-flagged cells in winning positions to W02 (for burst).
 *  Returns list of converted positions. */
function convertGoldenInWinningCells(
  grid: Cell[][],
  winPositions: Set<string>
): GoldenConversion[] {
  const converted: GoldenConversion[] = [];
  for (const key of winPositions) {
    const [row, reel] = key.split(',').map(Number);
    const cell = grid[row][reel];
    if (cell.golden) {
      const baseSym = cell.sym;
      cell.sym = 'W02';
      cell.golden = false;
      converted.push({ row, reel, baseSym });
    }
  }
  return converted;
}

/** Execute one chain step evaluation — canonical order from GDD §5.3.
 *  Returns a complete ChainStep record (no side effects on multiplier index). */
function evaluateStep(
  rng: RNG,
  grid: Cell[][],
  totalBet: number,
  step: number,
  mode: GameMode
): ChainStep {
  clearBurstClaims(grid);

  // 1. Standard win evaluation
  const evalResult = evaluate(grid, totalBet);
  const hasLineWin = evalResult.lineWins.length > 0;

  if (!hasLineWin && evalResult.scatterWin === 0) {
    // No win — chain ends
    return {
      stepIndex:         step,
      multiplier:        multForStep(step, mode),
      stepBaseWin:       0,
      stepWin:           0,
      lineWins:          [],
      scatterCount:      evalResult.scatterCount,
      scatterWin:        0,
      scatterPositions:  evalResult.scatterPositions,
      bursts:            [],
      goldenConversions: [],
      winPositions:      [],
      winCells:          [],
      hasLineWin:        false,
      morphedCells:      [],
    };
  }

  // 3. Bursting Wild resolution — natural W02 in winning positions
  const bursts: import('./types').BurstResult[] = [];
  const w02Positions: { row: number; reel: number }[] = [];
  for (const key of evalResult.winPositions) {
    const [row, reel] = key.split(',').map(Number);
    if (grid[row][reel].sym === 'W02') w02Positions.push({ row, reel });
  }
  // Left-to-right for deterministic resolution
  w02Positions.sort((a, b) => a.reel - b.reel || a.row - b.row);
  for (const pos of w02Positions) {
    const result = resolveBurst(rng, grid, grid[pos.row][pos.reel], mode);
    bursts.push(result);
  }

  // 4. Golden symbol conversion → additional bursts
  const goldenConversions = convertGoldenInWinningCells(grid, evalResult.winPositions);
  for (const pos of goldenConversions) {
    const result = resolveBurst(rng, grid, grid[pos.row][pos.reel], mode);
    bursts.push(result);
  }

  // Mark winning cells
  for (const key of evalResult.winPositions) {
    const [row, reel] = key.split(',').map(Number);
    grid[row][reel].winning = true;
  }
  for (const { row, reel } of evalResult.scatterPositions) {
    grid[row][reel].winning = true;
  }

  // 6. Apply multiplier (to current step win before advancement — GDD §10.2)
  const multiplier = multForStep(step, mode);
  const stepBaseWin = evalResult.lineWins.reduce((s, w) => s + w.pay, 0);
  const stepWin = stepBaseWin * multiplier + evalResult.scatterWin;

  return {
    stepIndex:         step,
    multiplier,
    stepBaseWin,
    stepWin,
    lineWins:          evalResult.lineWins,
    scatterCount:      evalResult.scatterCount,
    scatterWin:        evalResult.scatterWin,
    scatterPositions:  evalResult.scatterPositions,
    bursts,
    goldenConversions,
    winPositions:      [...evalResult.winPositions],
    winCells:          evalResult.winCells,
    hasLineWin,
    morphedCells:      [], // filled by runChain after executeMorph
  };
}

/** Run the full morph chain loop synchronously.
 *  Returns ChainResult with all steps, totals, and pending features. */
export function runChain(
  rng: RNG,
  grid: Cell[][],
  totalBet: number,
  mode: GameMode
): ChainResult {
  const chainSteps: ChainStep[] = [];
  let chainStep = 0;
  let chainTotal = 0;
  let totalLineWin = 0;
  let totalScatterWin = 0;
  let maxMultiplier = 0;
  const pendingFeatures: PendingFeature[] = [];

  let iters = 0;
  while (iters < CHAIN_SAFETY_CAP) {
    iters++;

    // Clear winning flags before each re-evaluation
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++)
        grid[r][c].winning = false;

    const step = evaluateStep(rng, grid, totalBet, chainStep, mode);

    if (!step.hasLineWin && step.scatterWin === 0) break; // chain ends

    chainTotal += step.stepWin;
    totalLineWin += step.stepBaseWin;
    totalScatterWin += step.scatterWin;
    if (step.multiplier > maxMultiplier) maxMultiplier = step.multiplier;
    chainSteps.push(step);

    // Queue feature triggers (processed after chain — GDD §6.2)
    if (step.scatterCount >= 3) {
      pendingFeatures.push(
        mode === 'FS'
          ? { type: 'FS_RETRIGGER', scatterCount: step.scatterCount }
          : { type: 'FS_TRIGGER',   scatterCount: step.scatterCount }
      );
    }

    // Collect morph targets: all winning positions except SC01
    const toMorph: { row: number; reel: number }[] = [];
    for (const key of step.winPositions) {
      const [row, reel] = key.split(',').map(Number);
      if (grid[row][reel].sym === SCATTER_ID) continue;
      toMorph.push({ row, reel });
    }

    if (toMorph.length === 0) break; // scatter-only win, no morph

    // Execute morph — capture new cells for client-side grid replay
    const morphedCells = executeMorph(rng, grid, toMorph, mode);
    chainSteps[chainSteps.length - 1].morphedCells = morphedCells;

    // Advance multiplier index only if there was a line win (GDD §10.2)
    if (step.hasLineWin) chainStep++;
  }

  // Wheel trigger check: natural RNG roll at chain end (GDD §12.1)
  const wheelChance = mode === 'FS' ? WHEEL_TRIGGER_FS : WHEEL_TRIGGER_BASE;
  if (rng.chance(wheelChance)) {
    pendingFeatures.push({ type: 'WHEEL' });
  }

  // Sort features: FS first, Wheel second (GDD §4.5.7)
  pendingFeatures.sort((a, b) => {
    const order: Record<string, number> = { FS_TRIGGER: 0, FS_RETRIGGER: 0, WHEEL: 1 };
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });

  return {
    chainSteps,
    chainTotal,
    totalLineWin,
    totalScatterWin,
    chainLength: chainSteps.length,
    maxMultiplier,
    pendingFeatures,
  };
}
