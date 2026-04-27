import cron from 'node-cron';
import { computeRtp, saveRtpSnapshot } from '../services/rtpService';

/** Schedule RTP snapshot jobs using node-cron.
 *  Writes to rtp_snapshots table every 5 minutes for monitoring.
 *  Computes multiple windows (1h, 24h, 7 days) per snapshot cycle. */
export function startRtpSnapshotWorker(): void {
  const WINDOWS = [1, 24, 168]; // hours: 1h, 24h, 7d

  cron.schedule('*/5 * * * *', async () => {
    console.log('[rtp-worker] computing RTP snapshots...');
    for (const windowHours of WINDOWS) {
      try {
        const data = await computeRtp(windowHours);
        await saveRtpSnapshot(data);
        console.log(
          `[rtp-worker] window=${windowHours}h  spins=${data.totalSpins}  rtp=${(data.rtp * 100).toFixed(2)}%`
        );
      } catch (err) {
        console.error(`[rtp-worker] failed for window ${windowHours}h:`, (err as Error).message);
      }
    }
  });

  console.log('[rtp-worker] scheduled — every 5 minutes');
}
