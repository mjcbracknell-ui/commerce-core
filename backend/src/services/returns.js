import prisma from '../db.js';
import { badRequest, conflict } from '../lib/http.js';
import { round2 } from '../lib/pricing.js';
import { dispatchEventLater } from '../lib/webhooks.js';
import { sendOrderRefunded } from '../lib/mailer.js';
import { serializeReturn } from '../lib/serializers.js';

const activeReturnStatuses = new Set(['requested', 'received', 'refunded', 'exchanged']);
const lineVariantId = (item) => item?.variantId || item?.variant_id || null;

export function returnValue(returnRecord) {
  return round2(
    (returnRecord.lineItems || []).reduce(
      (sum, item) => sum + round2(Number(item.price || 0) * Number(item.quantity || 0)),
      0,
    ),
  );
}

export function returnableItems(order) {
  const shipped = new Map();
  for (const fulfillment of order.fulfillments || []) {
    for (const item of fulfillment.lineItems || []) {
      const variantId = lineVariantId(item);
      if (!variantId) continue;
      shipped.set(variantId, (shipped.get(variantId) || 0) + Number(item.quantity || 0));
    }
  }

  const returned = new Map();
  for (const record of order.returns || []) {
    if (!activeReturnStatuses.has(record.status)) continue;
    for (const item of record.lineItems || []) {
      const variantId = lineVariantId(item);
      if (!variantId) continue;
      returned.set(variantId, (returned.get(variantId) || 0) + Number(item.quantity || 0));
    }
  }

  const seen = new Set();
  return (order.lineItems || [])
    .map((item) => {
      const variantId = lineVariantId(item);
      if (!variantId || seen.has(variantId)) return null;
      seen.add(variantId);
      const quantity = Math.max(0, (shipped.get(variantId) || 0) - (returned.get(variantId) || 0));
      return quantity > 0
        ? {
            variantId,
            title: item.title,
            variantTitle: item.variantTitle,
            sku: item.sku,
            price: Number(item.price) || 0,
            quantity,
          }
        : null;
    })
    .filter(Boolean);
}

function normalizeExchangeItems(items = []) {
  const normalized = [];
  for (const item of items) {
    const variantId = lineVariantId(item);
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity <= 0) {
      throw badRequest('Exchange items need a variantId and a positive whole-number quantity');
    }
    normalized.push({ variantId, quantity });
  }
  return normalized;
}

export async function createReturn({
  order,
  items = [],
  reason = null,
  note = null,
  resolution = 'refund',
  requestedBy = 'customer',
  exchangeItems = [],
}) {
  if (!order) throw badRequest('Order is required');
  if (order.canceledAt) throw badRequest('A canceled order cannot be returned');
  if (!['refund', 'exchange'].includes(resolution)) throw badRequest('Choose refund or exchange');
  if (!items.length) throw badRequest('Choose at least one item to return');

  const available = new Map(returnableItems(order).map((item) => [item.variantId, item]));
  const requested = new Map();
  for (const item of items) {
    const variantId = lineVariantId(item);
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity <= 0) {
      throw badRequest('Return items need a variantId and a positive whole-number quantity');
    }
    requested.set(variantId, (requested.get(variantId) || 0) + quantity);
  }

  const lines = [];
  for (const [variantId, quantity] of requested) {
    const item = available.get(variantId);
    if (!item) throw badRequest('One or more items are not available to return');
    if (quantity > item.quantity) {
      throw badRequest(`Only ${item.quantity} of ${item.title} can still be returned`);
    }
    const itemReason = items.find((candidate) => lineVariantId(candidate) === variantId)?.reason || reason;
    lines.push({
      variantId,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      price: item.price,
      quantity,
      reason: String(itemReason || 'Other').slice(0, 300),
    });
  }

  const normalizedExchange = normalizeExchangeItems(exchangeItems);
  if (normalizedExchange.length) {
    const variants = await prisma.variant.findMany({
      where: {
        id: { in: normalizedExchange.map((item) => item.variantId) },
        product: { storeId: order.storeId },
      },
    });
    if (variants.length !== normalizedExchange.length) {
      throw badRequest('One or more exchange items are not available in this store');
    }
  }

  return prisma.orderReturn.create({
    data: {
      orderId: order.id,
      status: 'requested',
      resolution,
      reason: reason ? String(reason).slice(0, 300) : null,
      note: note ? String(note).slice(0, 2000) : null,
      lineItems: lines,
      exchangeItems: normalizedExchange,
      requestedBy,
    },
  });
}

export async function receiveReturn(returnRecord, { restock = true } = {}) {
  if (returnRecord.status !== 'requested') {
    throw badRequest('Only a requested return can be marked as received');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (restock) {
      for (const item of returnRecord.lineItems || []) {
        const variantId = lineVariantId(item);
        if (!variantId) continue;
        await tx.variant.updateMany({
          where: { id: variantId },
          data: { inventory: { increment: Number(item.quantity) || 0 } },
        });
      }
    }
    return tx.orderReturn.update({
      where: { id: returnRecord.id },
      data: {
        status: 'received',
        restock,
        receivedAt: new Date(),
      },
    });
  });

  return updated;
}

export async function rejectReturn(returnRecord) {
  if (returnRecord.status !== 'requested') {
    throw badRequest('Only a requested return can be rejected');
  }
  return prisma.orderReturn.update({
    where: { id: returnRecord.id },
    data: { status: 'rejected' },
  });
}

export async function refundReturn(returnRecord, { amount = null, notifyCustomer = true } = {}) {
  if (returnRecord.resolution !== 'refund') {
    throw badRequest('This return is an exchange, not a refund');
  }
  if (returnRecord.status !== 'received') {
    throw badRequest('Mark the return as received before refunding it');
  }

  const value = returnValue(returnRecord);
  const refundAmount = round2(amount == null ? value : Number(amount));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw badRequest('Refund amount must be greater than zero');
  }
  if (refundAmount > value + 0.001) {
    throw badRequest(`The refund cannot exceed the returned item value of ${value.toFixed(2)}`);
  }

  const order = returnRecord.order;
  const remainingRefundable = round2(Number(order.total) - Number(order.refundedTotal || 0));
  if (refundAmount > remainingRefundable + 0.001) {
    throw badRequest(`Only ${remainingRefundable.toFixed(2)} remains refundable on this order`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const refundedTotal = round2(Number(order.refundedTotal || 0) + refundAmount);
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        refundedTotal,
        financialStatus: refundedTotal >= Number(order.total) - 0.001 ? 'refunded' : 'partially_refunded',
      },
      include: { customer: true },
    });
    const updatedReturn = await tx.orderReturn.update({
      where: { id: returnRecord.id },
      data: {
        status: 'refunded',
        refundAmount,
        refundedAt: new Date(),
      },
    });
    return { order: updatedOrder, returnRecord: updatedReturn };
  });

  dispatchEventLater(result.order.storeId, 'orders/refunded', {
    ...result.order,
    refund_amount: refundAmount,
    return: serializeReturn(result.returnRecord),
  });
  if (notifyCustomer) {
    sendOrderRefunded(result.order, { name: order.store?.name }, refundAmount).catch(() => {});
  }
  return result;
}

export async function completeExchange(
  returnRecord,
  { exchangeItems = null, carrier = null, trackingNumber = null, trackingUrl = null } = {},
) {
  if (returnRecord.resolution !== 'exchange') {
    throw badRequest('This return is not an exchange');
  }
  if (returnRecord.status !== 'received') {
    throw badRequest('Mark the return as received before completing the exchange');
  }

  const items = normalizeExchangeItems(exchangeItems?.length ? exchangeItems : returnRecord.exchangeItems || []);
  const updated = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const result = await tx.variant.updateMany({
        where: { id: item.variantId, inventory: { gte: item.quantity } },
        data: { inventory: { decrement: item.quantity } },
      });
      if (result.count === 0) throw conflict('An exchange item is out of stock');
    }
    return tx.orderReturn.update({
      where: { id: returnRecord.id },
      data: {
        status: 'exchanged',
        exchangeItems: items.length ? items : returnRecord.exchangeItems || [],
        exchangeFulfilledAt: new Date(),
        exchangeCarrier: carrier || null,
        exchangeTrackingNumber: trackingNumber || null,
        exchangeTrackingUrl: trackingUrl || null,
      },
    });
  });

  return updated;
}
