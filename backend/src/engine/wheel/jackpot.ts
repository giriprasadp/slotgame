import { RNG } from '../rng';
import type { JackpotResult } from '../types';
import { JACKPOT_TIERS, BET_LEVELS } from '../../config/game';

/** Resolve jackpot tier and payout.
 *  Mini/Minor scale with bet level (GDD §12.4). */
export function resolveJackpot(
  rng: RNG,
  totalBet: number,
  betLevelIdx: number
): JackpotResult {
  const weights: [string, number][] = JACKPOT_TIERS.map(t => [t.id, t.weight]);
  const tierId = rng.pickWeighted(weights);
  const tier = JACKPOT_TIERS.find(t => t.id === tierId)!;

  // Mini & Minor scale linearly with bet level (idx 0..8 → 1.0..3.0× base)
  const lvlFraction = BET_LEVELS.length > 1
    ? betLevelIdx / (BET_LEVELS.length - 1)
    : 0;
  const scale = tier.minScale + (tier.maxScale - tier.minScale) * lvlFraction;
  const payout = tier.base * scale * totalBet;

  return { tier: tierId, payout, scale, base: tier.base };
}
