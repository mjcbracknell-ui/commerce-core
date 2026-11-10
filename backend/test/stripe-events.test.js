import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCESSED_STRIPE_EVENT_RETENTION_DAYS,
  cleanupProcessedStripeEvents,
} from '../src/services/stripe-events.js';

function fakeClient() {
  let where = null;
  return {
    client: {
      processedStripeEvent: {
        deleteMany: async (args) => {
          where = args.where;
          return { count: 4 };
        },
      },
    },
    getWhere: () => where,
  };
}

test('deletes processed Stripe events older than 30 days', async () => {
  const { client, getWhere } = fakeClient();
  const now = new Date('2026-11-10T12:00:00.000Z');
  const result = await cleanupProcessedStripeEvents({ client, now });

  assert.equal(PROCESSED_STRIPE_EVENT_RETENTION_DAYS, 30);
  assert.equal(result.deleted, 4);
  assert.equal(result.cutoff.toISOString(), '2026-10-11T12:00:00.000Z');
  assert.equal(getWhere().createdAt.lt.toISOString(), '2026-10-11T12:00:00.000Z');
});

test('honours a custom retention window', async () => {
  const { client, getWhere } = fakeClient();
  const now = new Date('2026-11-10T00:00:00.000Z');
  const result = await cleanupProcessedStripeEvents({ client, now, olderThanDays: 7 });

  assert.equal(result.olderThanDays, 7);
  assert.equal(result.cutoff.toISOString(), '2026-11-03T00:00:00.000Z');
  assert.equal(getWhere().createdAt.lt.toISOString(), '2026-11-03T00:00:00.000Z');
});