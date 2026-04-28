/**
 * RTP Simulation — Huff and Puff
 *
 * Verifies the Return-to-Player by running spins directly through the engine.
 * No HTTP, no database, no network — pure engine calls only.
 *
 * Modes:
 *   npx tsx src/rtp-sim.ts                     # verify scaled RTP hits 96.10% target
 *   npx tsx src/rtp-sim.ts --measure            # measure natural RTP (unscaled baseline)
 *   npx tsx src/rtp-sim.ts --spins 5000000      # custom spin count
 *   npx tsx src/rtp-sim.ts --measure --spins 5000000  # calibrate NATURAL_RTP constant
 *
 * Workflow to recalibrate after reel-strip changes:
 *   1. npx tsx src/rtp-sim.ts --measure --spins 5000000
 *   2. Copy printed "Natural RTP" into NATURAL_RTP in config/game.ts
 *   3. npx tsx src/rtp-sim.ts  (should now PASS)
 */

import { RNG }                        from './engine/rng';
import { spinGrid }                   from './engine/evaluator';
import { applyGoldenRolls, runChain } from './engine/morph';
import { resolveWheel }               from './engine/wheel/wheel';
import {
  SCATTER_FS_AWARD,
  FS_RETRIGGER_AWARD,
  FS_SAFETY_CAP,
  WHEEL_TRIGGER_FS,
  RTP_TARGET,
  NATURAL_RTP,
  PAYOUT_SCALE,
} from './config/game';
import type { ChainResult } from './engine/types';

/* --- CLI args ---------------------------------------------------------------- */
const args        = process.argv.slice(2);
const spinFlagIdx = args.indexOf('--spins');
const TOTAL_BASE_SPINS = spinFlagIdx >= 0 ? parseInt(args[spinFlagIdx + 1], 10) : 1_000_000;
const MEASURE_MODE     = args.includes('--measure');  // measure natural RTP, skip scale
const BET_LEVEL_IDX    = 3;    // BET_LEVELS[3] -> total 100 coins
const TOTAL_BET        = 100;

/* --- Accumulators ------------------------------------------------------------ */
let totalWagered   = 0;
let totalWon       = 0;

// Component breakdown (line wins are AFTER multipliers: stepBaseWin * multiplier)
let baseLineWin    = 0;
let baseScatterWin = 0;
let fsLineWin      = 0;
let fsScatterWin   = 0;
let wheelWon       = 0;

// Feature counters
let fsTriggers     = 0;
let fsSpinsPlayed  = 0;
let wheelTriggers  = 0;
let morphCascades  = 0;
let chainLenSum    = 0;

/* --- Helper: sum multiplied line wins across all chain steps ----------------- */
function multipliedLineWin(chain: ChainResult): number {
  return chain.chainSteps.reduce(
    (acc, step) => acc + step.stepBaseWin * step.multiplier,
    0
  );
}

/* --- FS session simulator (no DB — mirrors spinService FS accumulation) ------ */
function simulateFsSession(rng: RNG, lockedBet: number): number {
  let remaining    = SCATTER_FS_AWARD;
  let runningTotal = 0;

  while (remaining > 0) {
    remaining--;
    fsSpinsPlayed++;

    const { grid } = spinGrid(rng, 'FS');
    applyGoldenRolls(rng, grid, 'FS');
    const chain: ChainResult = runChain(rng, grid, lockedBet, 'FS');

    runningTotal += chain.chainTotal;
    fsLineWin    += multipliedLineWin(chain);
    fsScatterWin += chain.totalScatterWin;

    if (chain.chainLength > 1) morphCascades++;
    chainLenSum += chain.chainLength;

    for (const feat of chain.pendingFeatures) {
      if (feat.type === 'FS_RETRIGGER') {
        const award = FS_RETRIGGER_AWARD[Math.min(5, feat.scatterCount)] ?? 0;
        remaining = Math.min(FS_SAFETY_CAP, remaining + award);
        fsTriggers++;
      }
      if (feat.type === 'WHEEL') {
        wheelTriggers++;
        const result  = resolveWheel(rng, lockedBet, BET_LEVEL_IDX);
        runningTotal += result.totalPayout;
        wheelWon     += result.totalPayout;
      }
    }
  }

  return runningTotal;
}

/* --- Progress bar ------------------------------------------------------------ */
const REPORT_EVERY = Math.max(1, Math.floor(TOTAL_BASE_SPINS / 20));

function printProgress(done: number): void {
  const rtp = totalWon / (totalWagered || 1);
  process.stdout.write(
    `\r  spins: ${done.toLocaleString().padStart(12)}  ` +
    `wagered: ${totalWagered.toFixed(0).padStart(14)}  ` +
    `rtp: ${(rtp * 100).toFixed(4)}%   `
  );
}

function pct(num: number, den: number, dec = 4): string {
  return den === 0 ? 'N/A' : `${(num / den * 100).toFixed(dec)}%`;
}

/* --- Main loop --------------------------------------------------------------- */
console.log('\nHuff and Puff — RTP Simulation');
console.log('='.repeat(60));
console.log(`  Mode         : ${MEASURE_MODE ? 'MEASURE (natural RTP, no scaling)' : 'VERIFY (scaled to target RTP)'}`);
console.log(`  Base spins   : ${TOTAL_BASE_SPINS.toLocaleString()}`);
console.log(`  Bet per spin : ${TOTAL_BET} coins`);
console.log(`  Total wagered: ~${(TOTAL_BASE_SPINS * TOTAL_BET).toLocaleString()} coins`);
if (!MEASURE_MODE) {
  console.log(`  Target RTP   : ${(RTP_TARGET * 100).toFixed(2)}% +/- 0.50%`);
  console.log(`  Natural RTP  : ${(NATURAL_RTP * 100).toFixed(4)}% (config/game.ts NATURAL_RTP)`);
  console.log(`  Payout scale : ${PAYOUT_SCALE.toFixed(6)}x  (= ${(RTP_TARGET * 100).toFixed(2)} / ${(NATURAL_RTP * 100).toFixed(4)})`);
}
console.log('-'.repeat(60) + '\n');

const t0  = Date.now();
const rng = RNG.random();

for (let spin = 0; spin < TOTAL_BASE_SPINS; spin++) {
  totalWagered += TOTAL_BET;

  const { grid } = spinGrid(rng, 'BASE');
  applyGoldenRolls(rng, grid, 'BASE');
  const chain: ChainResult = runChain(rng, grid, TOTAL_BET, 'BASE');

  totalWon       += chain.chainTotal;
  baseLineWin    += multipliedLineWin(chain);
  baseScatterWin += chain.totalScatterWin;

  if (chain.chainLength > 1) morphCascades++;
  chainLenSum += chain.chainLength;

  for (const feat of chain.pendingFeatures) {
    if (feat.type === 'FS_TRIGGER') {
      fsTriggers++;
      totalWon += simulateFsSession(rng, TOTAL_BET);
    }
    if (feat.type === 'WHEEL') {
      wheelTriggers++;
      const result = resolveWheel(rng, TOTAL_BET, BET_LEVEL_IDX);
      totalWon += result.totalPayout;
      wheelWon += result.totalPayout;
    }
  }

  if ((spin + 1) % REPORT_EVERY === 0) printProgress(spin + 1);
}
printProgress(TOTAL_BASE_SPINS);
console.log();

const elapsed     = ((Date.now() - t0) / 1000).toFixed(1);
const naturalRTP  = totalWon / totalWagered;        // unscaled
const projectedRTP = naturalRTP * PAYOUT_SCALE;     // what players receive
const TARGET_RTP  = RTP_TARGET;
const TOLERANCE   = 0.0050;
const pass        = MEASURE_MODE || Math.abs(projectedRTP - TARGET_RTP) <= TOLERANCE;

/* --- Results ----------------------------------------------------------------- */
console.log('\n' + '='.repeat(60));
console.log(`  RESULTS  (${elapsed}s)`);
console.log('-'.repeat(60));
console.log(`  Total wagered      : ${totalWagered.toLocaleString()}`);
console.log(`  Total won (raw)    : ${totalWon.toFixed(2)}`);
console.log('');
console.log(`  Natural RTP        : ${(naturalRTP * 100).toFixed(4)}%  (engine baseline, no scaling)`);
if (!MEASURE_MODE) {
  console.log(`  Payout scale       : ${PAYOUT_SCALE.toFixed(6)}x`);
  console.log(`  Projected RTP      : ${(projectedRTP * 100).toFixed(4)}%  (what players receive)`);
  console.log(`  Target RTP         : ${(TARGET_RTP * 100).toFixed(2)}%`);
  console.log(`  Tolerance          : +/-${(TOLERANCE * 100).toFixed(2)}%`);
  console.log(`  Result             : ${pass ? 'PASS' : 'FAIL'}`);
} else {
  console.log('');
  console.log(`  >>> Set NATURAL_RTP = ${naturalRTP.toFixed(6)} in config/game.ts <<<`);
  console.log(`  (Current value    : ${NATURAL_RTP.toFixed(6)})`);
  const drift = Math.abs(naturalRTP - NATURAL_RTP);
  if (drift > 0.002) {
    console.log(`  WARNING: drift ${(drift * 100).toFixed(3)}pp — NATURAL_RTP needs updating!`);
  } else {
    console.log(`  Config drift      : ${(drift * 100).toFixed(3)}pp — within acceptable range.`);
  }
}

// RTP component breakdown
const residual = totalWon - (baseLineWin + baseScatterWin + fsLineWin + fsScatterWin + wheelWon);
console.log('\n' + '-'.repeat(60));
console.log(`  RTP breakdown  (natural, pre-scale — line wins include cascade multipliers)`);
console.log('-'.repeat(60));
console.log(`  Base line wins (x mult) : ${pct(baseLineWin,    totalWagered)}`);
console.log(`  Base scatter pays       : ${pct(baseScatterWin, totalWagered)}`);
console.log(`  FS line wins   (x mult) : ${pct(fsLineWin,      totalWagered)}`);
console.log(`  FS scatter pays         : ${pct(fsScatterWin,   totalWagered)}`);
console.log(`  Wheel feature           : ${pct(wheelWon,       totalWagered)}`);
if (Math.abs(residual) > 1) {
  console.log(`  Burst/residual          : ${pct(residual, totalWagered)}`);
}
console.log(`  ${'─'.repeat(40)}`);
console.log(`  Natural total           : ${pct(totalWon, totalWagered)}`);
if (!MEASURE_MODE) {
  console.log(`  Scaled total (x${PAYOUT_SCALE.toFixed(4)})    : ${(naturalRTP * PAYOUT_SCALE * 100).toFixed(4)}%`);
}

// Feature stats
const totalSpins = TOTAL_BASE_SPINS + fsSpinsPlayed;
console.log('\n' + '-'.repeat(60));
console.log('  Feature statistics');
console.log('-'.repeat(60));
console.log(`  FS triggers (incl retrigger) : ${fsTriggers.toLocaleString()}  (1 in ${(TOTAL_BASE_SPINS / Math.max(1, fsTriggers)).toFixed(0)} base spins)`);
console.log(`  FS spins played              : ${fsSpinsPlayed.toLocaleString()}`);
console.log(`  Wheel triggers               : ${wheelTriggers.toLocaleString()}  (1 in ${(totalSpins / Math.max(1, wheelTriggers)).toFixed(0)} total spins)`);
console.log(`  Morph cascades (>1 step)     : ${morphCascades.toLocaleString()}`);
console.log(`  Avg chain length             : ${(chainLenSum / Math.max(1, totalSpins)).toFixed(3)}`);

// Validation checklist
const fsFreq = TOTAL_BASE_SPINS / Math.max(1, fsTriggers);
const wFreq  = totalSpins / Math.max(1, wheelTriggers);

const checks: Array<{ label: string; ok: boolean; value: string }> = [
  {
    label: MEASURE_MODE
      ? 'Natural RTP measured (no target check in measure mode)'
      : 'Projected RTP within +/-0.50% of target',
    ok:    MEASURE_MODE || pass,
    value: MEASURE_MODE
      ? `${(naturalRTP * 100).toFixed(4)}%`
      : `${(projectedRTP * 100).toFixed(4)}%`,
  },
  {
    label: 'Features add value above base-only return',
    ok:    (baseLineWin + baseScatterWin) / totalWagered < naturalRTP,
    value: `base-only=${pct(baseLineWin + baseScatterWin, totalWagered, 2)}`,
  },
  {
    label: 'FS trigger frequency plausible  (1/80 to 1/400)',
    ok:    fsFreq >= 80 && fsFreq <= 400,
    value: `1 in ${fsFreq.toFixed(0)}`,
  },
  {
    label: 'Wheel trigger frequency plausible (1/100 to 1/600)',
    ok:    wFreq >= 100 && wFreq <= 600,
    value: `1 in ${wFreq.toFixed(0)}`,
  },
  {
    label: 'FS contributes >= 10% of total return',
    ok:    (fsLineWin + fsScatterWin) / Math.max(1, totalWon) >= 0.10,
    value: pct(fsLineWin + fsScatterWin, totalWon, 2),
  },
  {
    label: 'Wheel contributes >= 5% of total return',
    ok:    wheelWon / Math.max(1, totalWon) >= 0.05,
    value: pct(wheelWon, totalWon, 2),
  },
  {
    label: 'No NaN / Infinity in totals',
    ok:    isFinite(naturalRTP) && !isNaN(naturalRTP),
    value: 'ok',
  },
];

console.log('\n' + '-'.repeat(60));
console.log('  Validation checklist');
console.log('-'.repeat(60));
let allPass = true;
for (const c of checks) {
  allPass = allPass && c.ok;
  const icon = c.ok ? '[PASS]' : '[FAIL]';
  console.log(`  ${icon} ${c.label.padEnd(48)} ${c.value}`);
}

console.log('\n' + '='.repeat(60));
if (allPass) {
  if (MEASURE_MODE) {
    console.log(`  MEASURE COMPLETE`);
    console.log(`  Set NATURAL_RTP = ${naturalRTP.toFixed(6)} in config/game.ts`);
    console.log(`  Projected scaled RTP will be: ${(naturalRTP * PAYOUT_SCALE * 100).toFixed(4)}%`);
  } else {
    console.log('  ALL CHECKS PASSED -- RTP validated at target');
  }
} else {
  console.log('  SOME CHECKS FAILED');
  if (!pass && !MEASURE_MODE) {
    const gap = ((projectedRTP - TARGET_RTP) * 100).toFixed(4);
    console.log(`  Projected RTP gap: ${gap}pp`);
    console.log(`  Fix: run --measure to get new NATURAL_RTP, update config/game.ts`);
  }
}
console.log('='.repeat(60) + '\n');

process.exit(allPass ? 0 : 1);
