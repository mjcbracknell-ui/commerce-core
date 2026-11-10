import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, discountIsActive, round2 } from '../src/lib/pricing.js';

const lines = [{ price: 19.99, quantity: 2 }];

test('prices a cart with tax and flat shipping', () => {
  const totals = computeTotals({ lines, settings: { taxRate: 10, shippingFlatRate: 5 } });
  assert.equal(totals.subtotal, 39.98);
  assert.equal(totals.shippingTotal, 5);
  assert.equal(totals.taxTotal, 4);
  assert.equal(totals.total, 48.98);
});

test('applies a percentage discount before tax', () => {
  const totals = computeTotals({
    lines,
    discount: { type: 'percentage', value: 10 },
    settings: { taxRate: 10, shippingFlatRate: 5 },
  });
  assert.equal(totals.discountTotal, 4);
  assert.equal(totals.taxTotal, 3.6);
  assert.equal(totals.total, 44.58);
});

test('caps fixed discounts at the subtotal', () => {
  const totals = computeTotals({ lines, discount: { type: 'fixed_amount', value: 500 } });
  assert.equal(totals.discountTotal, 39.98);
  assert.equal(totals.total, 0);
});

test('free shipping can come from a discount or a threshold', () => {
  const byDiscount = computeTotals({
    lines,
    discount: { type: 'free_shipping', value: 0 },
    settings: { shippingFlatRate: 9.99 },
  });
  assert.equal(byDiscount.shippingTotal, 0);

  const byThreshold = computeTotals({ lines, settings: { shippingFlatRate: 9.99, freeShippingThreshold: 30 } });
  assert.equal(byThreshold.shippingTotal, 0);

  const belowThreshold = computeTotals({ lines, settings: { shippingFlatRate: 9.99, freeShippingThreshold: 50 } });
  assert.equal(belowThreshold.shippingTotal, 9.99);
});

test('gift card applies after tax and never makes the total negative', () => {
  const totals = computeTotals({
    lines,
    settings: { taxRate: 10, shippingFlatRate: 5 },
    giftCard: { balance: 100 },
  });
  assert.equal(totals.giftCardApplied, 48.98);
  assert.equal(totals.total, 0);
});

test('round2 handles floating point noise', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test('discount activity respects window, usage limit and active flag', () => {
  const now = new Date('2026-01-15T12:00:00Z');
  assert.equal(discountIsActive({ active: true }, now), true);
  assert.equal(discountIsActive({ active: false }, now), false);
  assert.equal(discountIsActive({ active: true, startsAt: '2026-02-01' }, now), false);
  assert.equal(discountIsActive({ active: true, endsAt: '2026-01-01' }, now), false);
  assert.equal(discountIsActive({ active: true, usageLimit: 5, usageCount: 5 }, now), false);
  assert.equal(discountIsActive({ active: true, usageLimit: 5, usageCount: 4 }, now), true);
});
