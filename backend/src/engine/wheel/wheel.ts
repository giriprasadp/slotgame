import { RNG } from '../rng';
import type { WheelResult, WheelSegment } from '../types';
import { WHEEL_SEGMENTS, WHEEL_PROBS, BET_LEVELS } from '../../config/game';
import { resolveJackpot } from './jackpot';
import { resolveMansion } from './mansion';
import { resolveBuzzsaw } from './buzzsaw';
import { resolveMegaHat } from './megahat';

/** Pick a wheel segment by probability, then map to a visual index.
 *  Mirrors client Wheel.pickSegmentIndex(). */
function pickSegmentIndex(rng: RNG): WheelSegment {
  const r = rng.nextFloat();
  let acc = 0;
  let chosenType = 'WH_MH';
  for (const [k, p] of Object.entries(WHEEL_PROBS)) {
    acc += p;
    if (r <= acc) { chosenType = k; break; }
  }

  const candidates: number[] = [];
  WHEEL_SEGMENTS.forEach((s, i) => { if (s === chosenType) candidates.push(i); });
  const chosenIdx = candidates[rng.nextInt(0, candidates.length)];
  return { type: chosenType, idx: chosenIdx };
}

/** Resolve a full Wheel Feature spin.
 *  RNG state advances deterministically — same sequence as client Wheel.js. */
export function resolveWheel(
  rng: RNG,
  totalBet: number,
  betLevelIdx: number
): WheelResult {
  const segment = pickSegmentIndex(rng);

  let bonus: WheelResult['bonus'];
  let totalPayout: number;

  switch (segment.type) {
    case 'WH_JP': {
      const result = resolveJackpot(rng, totalBet, betLevelIdx);
      bonus = result;
      totalPayout = result.payout;
      break;
    }
    case 'WH_MN': {
      const result = resolveMansion(rng, totalBet);
      bonus = result;
      totalPayout = result.payout;
      break;
    }
    case 'WH_BZ': {
      const result = resolveBuzzsaw(rng, totalBet);
      bonus = result;
      totalPayout = result.payout;
      break;
    }
    case 'WH_MH': {
      const result = resolveMegaHat(rng, totalBet);
      bonus = result;
      totalPayout = result.payout;
      break;
    }
    default:
      throw new Error(`Unknown wheel segment type: ${segment.type}`);
  }

  return {
    segment,
    bonusType: segment.type as WheelResult['bonusType'],
    bonus,
    totalPayout,
  };
}
