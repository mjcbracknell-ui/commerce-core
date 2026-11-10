export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const DEFAULT_STORE_SETTINGS = {
  currency: 'USD',
  taxRate: 0,
  shippingFlatRate: 0,
  freeShippingThreshold: null,
  supportEmail: '',
  orderPrefix: '',
};

export function storeSettings(store) {
  return { ...DEFAULT_STORE_SETTINGS, ...(store?.settings || {}) };
}

export function discountIsActive(discount, now = new Date()) {
  if (!discount || discount.active === false) return false;
  if (discount.startsAt && new Date(discount.startsAt) > now) return false;
  if (discount.endsAt && new Date(discount.endsAt) < now) return false;
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) return false;
  return true;
}

/**
 * Price a cart on the server. Never trust client-side prices.
 *
 * @param {object} input
 * @param {Array<{price:number|string, quantity:number}>} input.lines
 * @param {object|null} input.discount  {type, value, minSubtotal}
 * @param {{balance:number|string}|null} input.giftCard
 * @param {object} input.settings       store settings
 */
export function computeTotals({ lines = [], discount = null, giftCard = null, settings = {} }) {
  const s = { ...DEFAULT_STORE_SETTINGS, ...settings };
  const subtotal = round2(
    lines.reduce((sum, line) => sum + round2(Number(line.price) * Number(line.quantity || 0)), 0),
  );

  let discountTotal = 0;
  let freeShipping = false;
  const value = Number(discount?.value || 0);
  if (discount) {
    if (discount.type === 'percentage') {
      discountTotal = round2((subtotal * Math.min(Math.max(value, 0), 100)) / 100);
    } else if (discount.type === 'fixed_amount') {
      discountTotal = round2(Math.min(Math.max(value, 0), subtotal));
    } else if (discount.type === 'free_shipping') {
      freeShipping = true;
    }
  }

  const taxable = round2(Math.max(subtotal - discountTotal, 0));
  let shippingTotal = round2(Math.max(Number(s.shippingFlatRate) || 0, 0));
  const threshold = s.freeShippingThreshold;
  if (freeShipping || (threshold != null && taxable >= Number(threshold))) shippingTotal = 0;
  if (subtotal === 0) shippingTotal = 0;

  const taxTotal = round2((taxable * Math.max(Number(s.taxRate) || 0, 0)) / 100);
  const beforeGiftCard = round2(taxable + shippingTotal + taxTotal);
  const balance = Number(giftCard?.balance || 0);
  const giftCardApplied = giftCard ? round2(Math.min(Math.max(balance, 0), beforeGiftCard)) : 0;
  const total = round2(Math.max(beforeGiftCard - giftCardApplied, 0));

  return {
    subtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    giftCardApplied,
    total,
    freeShipping,
  };
}

export function money(value) {
  return round2(Number(value) || 0);
}
