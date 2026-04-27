import { db, schema } from '../db';
import { eq, sql } from 'drizzle-orm';
import type { Session } from '../db/schema';

/** Atomically deduct the bet from the session balance in a transaction.
 *  Returns updated balance, or throws if insufficient funds. */
export async function deductBet(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  amount: number
): Promise<number> {
  const [updated] = await tx
    .update(schema.sessions)
    .set({
      balance:      sql`${schema.sessions.balance} - ${String(amount)}`,
      totalWagered: sql`${schema.sessions.totalWagered} + ${String(amount)}`,
      totalSpins:   sql`${schema.sessions.totalSpins} + 1`,
      lastSeenAt:   new Date(),
    })
    .where(
      sql`${schema.sessions.id} = ${sessionId}
          AND ${schema.sessions.balance} >= ${String(amount)}`
    )
    .returning({ balance: schema.sessions.balance });

  if (!updated) {
    throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE', statusCode: 400 });
  }

  return parseFloat(updated.balance as string);
}

/** Atomically credit winnings to the session balance. */
export async function creditWin(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  amount: number
): Promise<number> {
  if (amount <= 0) {
    // Nothing to credit — just read current balance
    const [sess] = await tx
      .select({ balance: schema.sessions.balance })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    return parseFloat(sess.balance as string);
  }

  const [updated] = await tx
    .update(schema.sessions)
    .set({
      balance:    sql`${schema.sessions.balance} + ${String(amount)}`,
      totalWon:   sql`${schema.sessions.totalWon} + ${String(amount)}`,
      biggestWin: sql`GREATEST(${schema.sessions.biggestWin}, ${String(amount)})`,
    })
    .where(eq(schema.sessions.id, sessionId))
    .returning({ balance: schema.sessions.balance });

  return parseFloat(updated.balance as string);
}

/** Update RNG state after a spin (persist s0/s1 for next spin continuity). */
export async function saveRngState(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  s0: string,
  s1: string
): Promise<void> {
  await tx
    .update(schema.sessions)
    .set({ rngS0: s0, rngS1: s1 })
    .where(eq(schema.sessions.id, sessionId));
}

/** Deduct a fixed amount (buy feature cost) — no spin counter increment. */
export async function deductPurchase(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  amount: number
): Promise<number> {
  const [updated] = await tx
    .update(schema.sessions)
    .set({
      balance:      sql`${schema.sessions.balance} - ${String(amount)}`,
      totalWagered: sql`${schema.sessions.totalWagered} + ${String(amount)}`,
    })
    .where(
      sql`${schema.sessions.id} = ${sessionId}
          AND ${schema.sessions.balance} >= ${String(amount)}`
    )
    .returning({ balance: schema.sessions.balance });

  if (!updated) {
    throw Object.assign(new Error('Insufficient balance for purchase'), { code: 'INSUFFICIENT_BALANCE', statusCode: 400 });
  }

  return parseFloat(updated.balance as string);
}
