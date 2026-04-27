import * as crypto from 'crypto';

/** Xorshift128+ PRNG — exact TypeScript port of client rng.js.
 *  Uses BigInt for faithful 64-bit unsigned arithmetic.
 *  Each spin gets a fresh RNG instance built from the stored session state. */
export class RNG {
  private s0: bigint;
  private s1: bigint;
  private static readonly MASK64 = 0xFFFF_FFFF_FFFF_FFFFn;

  private constructor(s0: bigint, s1: bigint) {
    this.s0 = s0;
    this.s1 = s1;
  }

  /* ─── Factory methods ─────────────────────────────────────────────────── */

  /** Create from a raw 64-bit seed (e.g. from crypto.randomBytes). */
  static fromSeed(seed: bigint): RNG {
    const s0 = RNG.mix64(seed === 0n ? 0x9E3779B97F4A7C15n : seed);
    let s1 = RNG.mix64(s0 + 0x6A09E667F3BCC909n);
    if (s0 === 0n && s1 === 0n) s1 = 1n;
    return new RNG(s0, s1);
  }

  /** Create from persisted state strings (s0, s1 as decimal strings). */
  static fromState(s0Str: string, s1Str: string): RNG {
    let s0 = BigInt(s0Str);
    let s1 = BigInt(s1Str);
    // Guard: state must not be both zero
    if (s0 === 0n && s1 === 0n) {
      s0 = RNG.mix64(BigInt(Date.now()));
      s1 = RNG.mix64(s0 + 0x6A09E667F3BCC909n);
    }
    return new RNG(s0, s1);
  }

  /** Generate a cryptographically random seed and return an RNG instance. */
  static random(): RNG {
    const bytes = crypto.randomBytes(8);
    const seed = bytes.readBigUInt64BE(0);
    return RNG.fromSeed(seed);
  }

  /* ─── State persistence ───────────────────────────────────────────────── */

  getState(): { s0: string; s1: string } {
    return { s0: this.s0.toString(), s1: this.s1.toString() };
  }

  /* ─── Core algorithm ──────────────────────────────────────────────────── */

  private static mix64(x: bigint): bigint {
    x = BigInt.asUintN(64, x);
    x = BigInt.asUintN(64, (x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n);
    x = BigInt.asUintN(64, (x ^ (x >> 27n)) * 0x94d049bb133111ebn);
    return BigInt.asUintN(64, x ^ (x >> 31n));
  }

  private next64(): bigint {
    let x = this.s0;
    const y = this.s1;
    this.s0 = y;
    x = BigInt.asUintN(64, x ^ (x << 23n));
    this.s1 = BigInt.asUintN(64, x ^ y ^ (x >> 17n) ^ (y >> 26n));
    return BigInt.asUintN(64, this.s1 + y);
  }

  /* ─── Public API (mirrors client RNG.* functions) ─────────────────────── */

  /** Uniform float [0, 1) with 53-bit precision. */
  nextFloat(): number {
    return Number(this.next64() >> 11n) / 2 ** 53;
  }

  /** Uniform integer in [min, max). */
  nextInt(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.nextFloat() * (max - min));
  }

  /** Pick from weighted pairs [[value, weight], ...]. */
  pickWeighted<T>(pairs: [T, number][]): T {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.nextFloat() * total;
    for (const [k, w] of pairs) {
      r -= w;
      if (r <= 0) return k;
    }
    return pairs[pairs.length - 1][0];
  }

  /** Fisher-Yates shuffle in place, returns array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Sample k distinct items from arr (non-destructive). */
  sample<T>(arr: T[], k: number): T[] {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(k, copy.length));
  }

  /** Bernoulli trial — returns true with probability p. */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }
}
