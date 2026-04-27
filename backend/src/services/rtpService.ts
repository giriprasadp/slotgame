import { db, schema } from '../db';
import { sql, gte } from 'drizzle-orm';

export interface RtpWindow {
  windowHours: number;
  totalSpins:  number;
  totalWagered: number;
  totalWon:    number;
  rtp:         number;
}

/** Compute RTP over a rolling window from spin_log table. */
export async function computeRtp(windowHours: number): Promise<RtpWindow> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [row] = await db
    .select({
      totalSpins:   sql<number>`COUNT(*)`,
      totalWagered: sql<string>`COALESCE(SUM(total_bet), 0)`,
      totalWon:     sql<string>`COALESCE(SUM(total_win), 0)`,
    })
    .from(schema.spinLog)
    .where(gte(schema.spinLog.createdAt, since));

  const wagered = parseFloat(row.totalWagered as string) || 0;
  const won     = parseFloat(row.totalWon as string) || 0;
  const rtp     = wagered > 0 ? won / wagered : 0;

  return {
    windowHours,
    totalSpins:  Number(row.totalSpins) || 0,
    totalWagered: wagered,
    totalWon:    won,
    rtp,
  };
}

/** Write a snapshot record to rtp_snapshots table. */
export async function saveRtpSnapshot(data: RtpWindow): Promise<void> {
  await db.insert(schema.rtpSnapshots).values({
    windowHours:  data.windowHours,
    totalSpins:   data.totalSpins,
    totalWagered: String(data.totalWagered),
    totalWon:     String(data.totalWon),
    rtp:          String(data.rtp.toFixed(4)),
  });
}

/** Fetch the latest rtp snapshot for a given window. */
export async function getLatestSnapshot(windowHours: number): Promise<RtpWindow | null> {
  const [row] = await db
    .select()
    .from(schema.rtpSnapshots)
    .orderBy(sql`snapshot_at DESC`)
    .limit(1);

  if (!row) return null;

  return {
    windowHours: row.windowHours,
    totalSpins:  row.totalSpins,
    totalWagered: parseFloat(row.totalWagered as string),
    totalWon:    parseFloat(row.totalWon as string),
    rtp:         parseFloat(row.rtp as string),
  };
}
