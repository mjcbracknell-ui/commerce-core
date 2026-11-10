import prisma from '../db.js';

export const PROCESSED_STRIPE_EVENT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete processed Stripe events older than the retention window. */
export async function cleanupProcessedStripeEvents({
  client = prisma,
  olderThanDays = PROCESSED_STRIPE_EVENT_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  const cutoff = new Date(now.getTime() - olderThanDays * DAY_MS);
  const result = await client.processedStripeEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff, olderThanDays };
}

/** Run the cleanup once at startup and then once a day. */
export function scheduleProcessedStripeEventCleanup({
  client = prisma,
  intervalMs = DAY_MS,
  logger = console,
} = {}) {
  const run = () => {
    cleanupProcessedStripeEvents({ client })
      .then(({ deleted, cutoff }) => {
        if (deleted) {
          logger.log(`[stripe] removed ${deleted} processed events older than ${cutoff.toISOString()}`);
        }
      })
      .catch((error) => logger.error('[stripe] event cleanup failed:', error));
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}