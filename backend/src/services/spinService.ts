import { db, schema } from '../db';
import { eq, sql } from 'drizzle-orm';
import { RNG } from '../engine/rng';
import { spinGrid } from '../engine/evaluator';
import { applyGoldenRolls, runChain } from '../engine/morph';
import { resolveWheel } from '../engine/wheel/wheel';
import { releaseSpinLock } from '../cache/redis';
import { deductBet, creditWin, saveRngState, deductPurchase } from './economyService';
import type {
  SpinType, GameMode, SpinResponse, ResolvedFeature, FreeSpinsState,
  ChainResult, WheelResult, Cell,
} from '../engine/types';
import {
  BET_LEVELS, SCATTER_FS_AWARD, FS_RETRIGGER_AWARD, FS_SAFETY_CAP,
  BUY_FS_MULT, BUY_WHEEL_MULT,
} from '../config/game';
import type { Session, FreeSpinsSession } from '../db/schema';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function parseNum(v: unknown): number {
  return typeof v === 'string' ? parseFloat(v) : (v as number) ?? 0;
}

async function getActiveFsSession(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string
): Promise<FreeSpinsSession | null> {
  const rows = await tx
    .select()
    .from(schema.freeSpinsSessions)
    .where(
      sql`${schema.freeSpinsSessions.sessionId} = ${sessionId}
          AND ${schema.freeSpinsSessions.completed} = false`
    )
    .limit(1);
  return rows[0] ?? null;
}

/* ─── Core spin handler ─────────────────────────────────────────────────── */

export async function executeSpin(params: {
  sessionId:   string;
  betLevelIdx: number;
  spinType:    SpinType;
}): Promise<SpinResponse> {
  const { sessionId, betLevelIdx, spinType } = params;

  try {
    return await db.transaction(async (tx) => {
      /* 1. Lock + read session */
      const [sess] = await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .for('update');

      if (!sess) throw httpError(404, 'SESSION_NOT_FOUND');

      const betLevel = BET_LEVELS[betLevelIdx];
      if (!betLevel) throw httpError(400, 'INVALID_BET_LEVEL');

      /* 2. Check active Free Spins session */
      const fsSession = await getActiveFsSession(tx, sessionId);
      const mode: GameMode = fsSession ? 'FS' : 'BASE';
      const totalBet = fsSession
        ? parseNum(fsSession.lockedBet)
        : betLevel.total;
      const effectiveBetLevelIdx = fsSession
        ? fsSession.betLevelIdx
        : betLevelIdx;

      /* 3. Deduct bet / consume FS spin */
      const balanceBefore = parseNum(sess.balance);

      if (mode === 'FS') {
        // FS spins are free — just decrement remaining count
        const spinsRemaining = fsSession!.spinsRemaining;
        if (spinsRemaining <= 0) throw httpError(409, 'NO_FREE_SPINS_REMAINING');
        await tx
          .update(schema.freeSpinsSessions)
          .set({ spinsRemaining: spinsRemaining - 1, spinsCompleted: fsSession!.spinsCompleted + 1 })
          .where(eq(schema.freeSpinsSessions.id, fsSession!.id));
      } else {
        if (balanceBefore < totalBet) throw httpError(400, 'INSUFFICIENT_BALANCE');
        await deductBet(tx, sessionId, totalBet);
      }

      /* 4. Build RNG from stored state */
      const rng = RNG.fromState(sess.rngS0, sess.rngS1);
      const rngStateBefore = rng.getState();

      /* 5. Generate spin result */
      const { grid, stops } = spinGrid(rng, mode);
      applyGoldenRolls(rng, grid, mode);

      /* 6. Run morph chain (fully synchronous, server-side) */
      const chainResult: ChainResult = runChain(rng, grid, totalBet, mode);

      /* 7. Resolve pending features */
      const resolvedFeatures: ResolvedFeature[] = [];
      let featurePayout = 0;
      let fsTriggerScatterCount = 0;

      for (const feat of chainResult.pendingFeatures) {
        if (feat.type === 'FS_TRIGGER') {
          fsTriggerScatterCount = feat.scatterCount;
          // Create FS session record — ON CONFLICT DO NOTHING guards against a race condition
          // where two concurrent requests (e.g. two browser tabs sharing the same session token)
          // both see no FS session and both attempt the INSERT. The second INSERT is silently
          // ignored; the first one wins and the FS session is established correctly.
          await tx.insert(schema.freeSpinsSessions).values({
            sessionId,
            triggerScatterCount: feat.scatterCount,
            lockedBet:           String(totalBet),
            betLevelIdx:         effectiveBetLevelIdx,
            totalAwarded:        SCATTER_FS_AWARD,
            spinsRemaining:      SCATTER_FS_AWARD,
          }).onConflictDoNothing();
          resolvedFeatures.push({ type: 'FS_TRIGGER', scatterCount: feat.scatterCount });

        } else if (feat.type === 'FS_RETRIGGER' && fsSession) {
          const award = FS_RETRIGGER_AWARD[Math.min(5, feat.scatterCount)] ?? 0;
          const newRemaining = Math.min(
            FS_SAFETY_CAP,
            fsSession.spinsRemaining - 1 + award // -1 already consumed above
          );
          await tx
            .update(schema.freeSpinsSessions)
            .set({
              spinsRemaining:  newRemaining,
              totalAwarded:    fsSession.totalAwarded + award,
              retriggerCount:  fsSession.retriggerCount + 1,
            })
            .where(eq(schema.freeSpinsSessions.id, fsSession.id));
          resolvedFeatures.push({ type: 'FS_RETRIGGER', scatterCount: feat.scatterCount, spinsAdded: award });

        } else if (feat.type === 'WHEEL') {
          const wheelResult: WheelResult = resolveWheel(rng, totalBet, effectiveBetLevelIdx);
          featurePayout += wheelResult.totalPayout;
          resolvedFeatures.push({ type: 'WHEEL', wheelResult });
        }
      }

      /* 8. FS accumulation + completion check */
      let updatedFsSession: FreeSpinsSession | null = null;
      if (mode === 'FS' && fsSession) {
        const newRunning     = parseNum(fsSession.runningTotal) + chainResult.chainTotal;
        const newLongest     = Math.max(fsSession.longestChain, chainResult.chainLength);
        const newMaxMult     = Math.max(fsSession.maxMultiplier, chainResult.maxMultiplier);
        const spinsAfter     = fsSession.spinsRemaining - 1;

        // Check FS retrigger updated value
        const retriggerFeat  = resolvedFeatures.find(f => f.type === 'FS_RETRIGGER') as
          { type: 'FS_RETRIGGER'; spinsAdded: number } | undefined;
        const finalRemaining = retriggerFeat
          ? Math.min(FS_SAFETY_CAP, spinsAfter + retriggerFeat.spinsAdded)
          : spinsAfter;

        const isCompleted = finalRemaining <= 0 && !retriggerFeat;

        const [updFs] = await tx
          .update(schema.freeSpinsSessions)
          .set({
            runningTotal:  String(newRunning),
            longestChain:  newLongest,
            maxMultiplier: newMaxMult,
            completed:     isCompleted,
            completedAt:   isCompleted ? new Date() : undefined,
          })
          .where(eq(schema.freeSpinsSessions.id, fsSession.id))
          .returning();
        updatedFsSession = updFs;

        // Credit the FS session total to balance on completion
        if (isCompleted) {
          featurePayout += newRunning;
        }
      }

      /* 9. Credit winnings */
      const totalWin = (mode === 'BASE' ? chainResult.chainTotal : 0) + featurePayout;
      const balanceAfter = await creditWin(tx, sessionId, totalWin);

      /* 10. Save RNG state */
      const rngStateAfter = rng.getState();
      await saveRngState(tx, sessionId, rngStateAfter.s0, rngStateAfter.s1);

      /* 11. Write spin_log (immutable audit record) */
      const [spinRecord] = await tx
        .insert(schema.spinLog)
        .values({
          sessionId,
          spinNumber:    sess.totalSpins + 1,
          gameMode:      mode,
          betLevelIdx:   effectiveBetLevelIdx,
          totalBet:      String(totalBet),
          spinType,
          rngSeedState:  `${rngStateBefore.s0},${rngStateBefore.s1}`,
          stops:         stops,
          gridResult:    grid as unknown as Record<string, unknown>[],
          chainSteps:    chainResult.chainSteps as unknown as Record<string, unknown>[],
          chainLength:   chainResult.chainLength,
          maxMultiplier: chainResult.maxMultiplier,
          totalWin:      String(totalWin),
          scatterWin:    String(chainResult.totalScatterWin),
          lineWin:       String(chainResult.totalLineWin),
          features:      resolvedFeatures as unknown as Record<string, unknown>[],
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
        })
        .returning({ id: schema.spinLog.id });

      /* 12. Build FS state for response */
      const currentFsSession = updatedFsSession ?? await getActiveFsSession(tx, sessionId);
      const freeSpinsState: FreeSpinsState | null = currentFsSession && !currentFsSession.completed
        ? {
            remaining:    currentFsSession.spinsRemaining,
            completed:    currentFsSession.spinsCompleted,
            runningTotal: parseNum(currentFsSession.runningTotal),
            lockedBet:    parseNum(currentFsSession.lockedBet),
          }
        : null;

      return {
        balanceBefore,
        balanceAfter,
        bet: totalBet,
        grid: grid as Cell[][],
        stops,
        chain: chainResult.chainSteps,
        chainTotal: chainResult.chainTotal,
        scatterWin: chainResult.totalScatterWin,
        totalWin,
        chainLength: chainResult.chainLength,
        maxMultiplier: chainResult.maxMultiplier,
        features: resolvedFeatures,
        freeSpinsState,
        spinId: spinRecord.id,
      };
    });
  } finally {
    await releaseSpinLock(sessionId);
  }
}

/* ─── Buy Feature handler ───────────────────────────────────────────────── */

export async function executeBuySpin(params: {
  sessionId:   string;
  featureType: 'FS' | 'WHEEL';
  betLevelIdx: number;
}): Promise<SpinResponse> {
  const { sessionId, featureType, betLevelIdx } = params;

  try {
    return await db.transaction(async (tx) => {
      const [sess] = await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .for('update');

      if (!sess) throw httpError(404, 'SESSION_NOT_FOUND');

      const betLevel = BET_LEVELS[betLevelIdx];
      if (!betLevel) throw httpError(400, 'INVALID_BET_LEVEL');

      const totalBet = betLevel.total;
      const cost = featureType === 'FS'
        ? totalBet * BUY_FS_MULT
        : totalBet * BUY_WHEEL_MULT;

      const balanceBefore = parseNum(sess.balance);
      if (balanceBefore < cost) throw httpError(400, 'INSUFFICIENT_BALANCE');

      // Deduct purchase cost
      await deductPurchase(tx, sessionId, cost);

      const rng = RNG.fromState(sess.rngS0, sess.rngS1);
      const rngStateBefore = rng.getState();

      const resolvedFeatures: ResolvedFeature[] = [];
      let featurePayout = 0;

      if (featureType === 'FS') {
        // Instant Free Spins (no scatter pay on buy — GDD §13.1)
        await tx.insert(schema.freeSpinsSessions).values({
          sessionId,
          triggerScatterCount: 0,
          lockedBet:           String(totalBet),
          betLevelIdx,
          totalAwarded:        SCATTER_FS_AWARD,
          spinsRemaining:      SCATTER_FS_AWARD,
        });
        resolvedFeatures.push({ type: 'FS_TRIGGER', scatterCount: 0 });
      } else {
        // Instant Wheel
        const wheelResult = resolveWheel(rng, totalBet, betLevelIdx);
        featurePayout = wheelResult.totalPayout;
        resolvedFeatures.push({ type: 'WHEEL', wheelResult });
      }

      const balanceAfterDeduct = balanceBefore - cost;
      const balanceAfter = await creditWin(tx, sessionId, featurePayout);

      const rngStateAfter = rng.getState();
      await saveRngState(tx, sessionId, rngStateAfter.s0, rngStateAfter.s1);

      const [spinRecord] = await tx
        .insert(schema.spinLog)
        .values({
          sessionId,
          spinNumber:    sess.totalSpins + 1,
          gameMode:      'BASE',
          betLevelIdx,
          totalBet:      String(cost),
          spinType:      featureType === 'FS' ? 'buy_fs' : 'buy_wheel',
          rngSeedState:  `${rngStateBefore.s0},${rngStateBefore.s1}`,
          stops:         [],
          gridResult:    [],
          chainSteps:    [],
          chainLength:   0,
          maxMultiplier: 0,
          totalWin:      String(featurePayout),
          scatterWin:    '0',
          lineWin:       '0',
          features:      resolvedFeatures as unknown as Record<string, unknown>[],
          balanceBefore: String(balanceBefore),
          balanceAfter:  String(balanceAfter),
        })
        .returning({ id: schema.spinLog.id });

      const fsSession = featureType === 'FS'
        ? await getActiveFsSession(tx, sessionId)
        : null;

      return {
        balanceBefore,
        balanceAfter,
        bet: cost,
        grid: [],
        stops: [],
        chain: [],
        chainTotal: 0,
        scatterWin: 0,
        totalWin: featurePayout,
        chainLength: 0,
        maxMultiplier: 0,
        features: resolvedFeatures,
        freeSpinsState: fsSession
          ? {
              remaining:    fsSession.spinsRemaining,
              completed:    fsSession.spinsCompleted,
              runningTotal: parseNum(fsSession.runningTotal),
              lockedBet:    parseNum(fsSession.lockedBet),
            }
          : null,
        spinId: spinRecord.id,
      };
    });
  } finally {
    await releaseSpinLock(sessionId);
  }
}

/* ─── Error factory ─────────────────────────────────────────────────────── */
function httpError(statusCode: number, code: string, message?: string): Error {
  return Object.assign(new Error(message ?? code), { statusCode, code });
}
