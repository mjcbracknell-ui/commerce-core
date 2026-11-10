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

const normalize = (value) => String(value || '').trim().toLowerCase();

export function destinationFromAddress(address = null) {
  return {
    country: normalize(address?.country || address?.country_code),
    region: normalize(address?.region || address?.province || address?.state),
  };
}

const listMatches = (values, candidate) =>
  !values?.length || values.some((value) => normalize(value) === '*' || normalize(value) === candidate);

function shippingZoneFor(zones, destination) {
  if (!destination?.country) return null;
  return (
    zones.find(
      (zone) =>
        zone.active !== false &&
        listMatches(zone.countries, destination.country) &&
        listMatches(zone.regions, destination.region),
    ) || null
  );
}

export function shippingQuote({ settings = {}, shippingZones = [], destination = null, taxable = 0 }) {
  const s = { ...DEFAULT_STORE_SETTINGS, ...settings };
  const zone = shippingZoneFor(shippingZones, destination);

  if (zone) {
    const rate = (zone.rates || [])
      .filter((candidate) => candidate.active !== false)
      .find(
        (candidate) =>
          (candidate.minSubtotal == null || taxable >= Number(candidate.minSubtotal)) &&
          (candidate.maxSubtotal == null || taxable <= Number(candidate.maxSubtotal)),
      );
    if (rate) {
      let amount = round2(Math.max(Number(rate.rate) || 0, 0));
      if (rate.freeOver != null && taxable >= Number(rate.freeOver)) amount = 0;
      if (amount > 0 && s.freeShippingThreshold != null && taxable >= Number(s.freeShippingThreshold)) {
        amount = 0;
      }
      return { amount, method: rate.name, zone: zone.name };
    }
    return { amount: 0, method: zone.name, zone: zone.name };
  }

  let amount = round2(Math.max(Number(s.shippingFlatRate) || 0, 0));
  if (s.freeShippingThreshold != null && taxable >= Number(s.freeShippingThreshold)) amount = 0;
  return { amount, method: 'Flat rate', zone: null };
}

export function taxQuote({ settings = {}, taxRegions = [], destination = null }) {
  const s = { ...DEFAULT_STORE_SETTINGS, ...settings };
  if (destination?.country) {
    const matches = taxRegions
      .filter(
        (region) =>
          region.active !== false &&
          (normalize(region.country) === '*' || normalize(region.country) === destination.country) &&
          (!region.region || normalize(region.region) === destination.region),
      )
      .sort((a, b) => {
        const specificity = Number(Boolean(b.region)) - Number(Boolean(a.region));
        if (specificity) return specificity;
        return (Number(a.position) || 0) - (Number(b.position) || 0);
      });
    if (matches.length) {
      return {
        rate: Math.max(Number(matches[0].rate) || 0, 0),
        name: matches[0].name,
        region: matches[0].region || matches[0].country,
      };
    }
  }
  return { rate: Math.max(Number(s.taxRate) || 0, 0), name: 'Default tax rate', region: null };
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
 * @param {Array} input.shippingZones    store zones with rates
 * @param {Array} input.taxRegions       store tax regions
 * @param {object|null} input.destination {country, region}
 */
export function computeTotals({
  lines = [],
  discount = null,
  giftCard = null,
  settings = {},
  shippingZones = [],
  taxRegions = [],
  destination = null,
}) {
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
  const shipping = shippingQuote({ settings: s, shippingZones, destination, taxable });
  const shippingTotal = freeShipping || subtotal === 0 ? 0 : shipping.amount;

  const tax = taxQuote({ settings: s, taxRegions, destination });
  const taxTotal = round2((taxable * tax.rate) / 100);
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
    freeShipping: freeShipping || shippingTotal === 0,
    shippingMethod: shipping.method,
    shippingZone: shipping.zone,
    taxRate: tax.rate,
    taxRegion: tax.region,
  };
}

export function money(value) {
  return round2(Number(value) || 0);
}
