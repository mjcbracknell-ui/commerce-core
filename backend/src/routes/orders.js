import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, badRequest, notFound, parseIntParam } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { serializeFulfillment, serializeOrder, serializeReturn } from '../lib/serializers.js';
import { placeOrder, markOrderPaid } from '../services/orders.js';
import { createReturn } from '../services/returns.js';
import { dispatchEventLater } from '../lib/webhooks.js';
import { sendOrderFulfilled, sendOrderRefunded } from '../lib/mailer.js';

const router = express.Router();

const orderInclude = {
  customer: true,
  fulfillments: { orderBy: { createdAt: 'asc' } },
  returns: { orderBy: { createdAt: 'asc' } },
};

const lineItemVariantId = (item) => item?.variantId || item?.variant_id || null;

function remainingItems(order) {
  const shipped = new Map();
  for (const fulfillment of order.fulfillments || []) {
    for (const item of fulfillment.lineItems || []) {
      const variantId = lineItemVariantId(item);
      if (!variantId) continue;
      shipped.set(variantId, (shipped.get(variantId) || 0) + Number(item.quantity || 0));
    }
  }

  return (order.lineItems || [])
    .map((item) => {
      const variantId = lineItemVariantId(item);
      return {
        ...item,
        variantId,
        remaining: Number(item.quantity || 0) - (shipped.get(variantId) || 0),
      };
    })
    .filter((item) => item.variantId && item.remaining > 0);
}

const totalItemQuantity = (order) =>
  (order.lineItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const fulfilledItemQuantity = (fulfillments = []) =>
  fulfillments.reduce(
    (sum, fulfillment) =>
      sum + (fulfillment.lineItems || []).reduce((lineSum, item) => lineSum + Number(item.quantity || 0), 0),
    0,
  );

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseIntParam(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parseIntParam(req.query.limit, 50, { min: 1, max: 250 });
    const search = String(req.query.search || '').trim();
    const financialStatus = String(req.query.financial_status || '').trim();
    const fulfillmentStatus = String(req.query.fulfillment_status || '').trim();

    const where = {
      storeId: req.storeId,
      ...(financialStatus ? { financialStatus } : {}),
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [orders, count] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return res.json({
      orders: orders.map((order) => serializeOrder(order)),
      count,
      page,
      limit,
      pages: Math.ceil(count / limit) || 1,
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: orderInclude,
    });
    if (!order) throw notFound('Order not found');
    return res.json({ order: serializeOrder(order) });
  }),
);

const fulfillSchema = z.object({
  trackingNumber: z.string().trim().max(200).optional(),
  trackingUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || /^https?:\/\//i.test(value), 'Tracking URL must start with http:// or https://')
    .optional(),
  carrier: z.string().trim().max(120).optional(),
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().positive() }))
    .min(1)
    .optional(),
  notifyCustomer: z.boolean().default(true),
});

router.post(
  '/:id/fulfill',
  requireRole('owner', 'admin'),
  validateBody(fulfillSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: orderInclude,
    });
    if (!existing) throw notFound('Order not found');
    if (existing.canceledAt) throw badRequest('A canceled order cannot be fulfilled');

    const remaining = remainingItems(existing);
    if (!remaining.length) throw badRequest('Order has no remaining items to fulfill');

    const remainingByVariant = new Map(remaining.map((item) => [item.variantId, item]));
    const requestedByVariant = new Map();
    if (req.body.items?.length) {
      for (const item of req.body.items) {
        requestedByVariant.set(item.variantId, (requestedByVariant.get(item.variantId) || 0) + item.quantity);
      }
    } else {
      for (const item of remaining) requestedByVariant.set(item.variantId, item.remaining);
    }

    const shipmentLines = [];
    let shipmentQuantity = 0;
    for (const [variantId, quantity] of requestedByVariant) {
      const item = remainingByVariant.get(variantId);
      if (!item) throw badRequest('One or more items are not available to fulfill');
      if (quantity > item.remaining) {
        throw badRequest(`Only ${item.remaining} of ${item.title} remain to be fulfilled`);
      }
      shipmentLines.push({
        variantId,
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        quantity,
      });
      shipmentQuantity += quantity;
    }

    if (!shipmentQuantity) throw badRequest('Select at least one item to fulfill');

    const trackingNumber = req.body.trackingNumber || null;
    const trackingUrl = req.body.trackingUrl || null;
    const carrier = req.body.carrier || null;
    const result = await prisma.$transaction(async (tx) => {
      const fulfillment = await tx.fulfillment.create({
        data: {
          orderId: existing.id,
          carrier,
          trackingNumber,
          trackingUrl,
          lineItems: shipmentLines,
        },
      });
      const fulfillmentStatus =
        fulfilledItemQuantity(existing.fulfillments) + shipmentQuantity >= totalItemQuantity(existing)
          ? 'fulfilled'
          : 'partially_fulfilled';
      const order = await tx.order.update({
        where: { id: existing.id },
        data: {
          fulfillmentStatus,
          ...(fulfillmentStatus === 'fulfilled' ? { fulfilledAt: new Date() } : {}),
          ...(trackingNumber ? { trackingNumber } : {}),
        },
        include: orderInclude,
      });
      return { order, fulfillment };
    });

    dispatchEventLater(req.storeId, 'orders/fulfilled', serializeOrder(result.order));
    if (req.body.notifyCustomer) {
      sendOrderFulfilled(result.order, req.store, result.fulfillment).catch(() => {});
    }
    return res.json({ order: serializeOrder(result.order), fulfillment: serializeFulfillment(result.fulfillment) });
  }),
);

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
        reason: z.string().trim().min(1).max(300),
      }),
    )
    .min(1),
  resolution: z.enum(['refund', 'exchange']).default('refund'),
  note: z.string().trim().max(2000).nullable().optional(),
  exchangeItems: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().positive() }))
    .optional(),
});

router.post(
  '/:id/returns',
  requireRole('owner', 'admin'),
  validateBody(returnSchema),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: orderInclude,
    });
    if (!order) throw notFound('Order not found');
    const created = await createReturn({
      order,
      items: req.body.items,
      note: req.body.note || null,
      resolution: req.body.resolution,
      exchangeItems: req.body.exchangeItems || [],
      requestedBy: 'admin',
    });
    return res.status(201).json({ return: serializeReturn(created) });
  }),
);

const refundSchema = z.object({
  amount: z.coerce.number().min(0).optional(),
  notifyCustomer: z.boolean().default(true),
});

router.post(
  '/:id/refund',
  requireRole('owner', 'admin'),
  validateBody(refundSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Order not found');
    if (existing.financialStatus === 'refunded') throw badRequest('Order is already refunded');

    const remaining = Math.max(0, Number(existing.total) - Number(existing.refundedTotal || 0));
    const amount = req.body.amount ?? remaining;
    if (amount <= 0) throw badRequest('Order has no remaining refundable balance');
    if (amount > remaining + 0.001) {
      throw badRequest(`Only ${remaining.toFixed(2)} remains refundable on this order`);
    }

    const refundedTotal = Math.min(Number(existing.total), Number(existing.refundedTotal || 0) + amount);
    const status = refundedTotal >= Number(existing.total) - 0.001 ? 'refunded' : 'partially_refunded';

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: { financialStatus: status, refundedTotal },
      include: orderInclude,
    });
    dispatchEventLater(req.storeId, 'orders/refunded', { ...serializeOrder(order), refund_amount: amount });
    if (req.body.notifyCustomer) sendOrderRefunded(order, req.store, amount).catch(() => {});
    return res.json({ order: serializeOrder(order), refund_amount: amount });
  }),
);

router.post(
  '/:id/cancel',
  requireRole('owner', 'admin'),
  validateBody(z.object({ reason: z.string().max(500).optional(), restock: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: orderInclude,
    });
    if (!existing) throw notFound('Order not found');
    if (existing.canceledAt) throw badRequest('Order is already canceled');

    const order = await prisma.$transaction(async (tx) => {
      if (req.body.restock) {
        for (const line of existing.lineItems || []) {
          if (!line.variantId) continue;
          await tx.variant.updateMany({
            where: { id: line.variantId },
            data: { inventory: { increment: Number(line.quantity) || 0 } },
          });
        }
      }
      return tx.order.update({
        where: { id: existing.id },
        data: {
          canceledAt: new Date(),
          cancelReason: req.body.reason || null,
          financialStatus: existing.financialStatus === 'paid' ? 'refunded' : 'cancelled',
          fulfillmentStatus: 'unfulfilled',
        },
        include: orderInclude,
      });
    });

    dispatchEventLater(req.storeId, 'orders/cancelled', serializeOrder(order));
    return res.json({ order: serializeOrder(order) });
  }),
);

router.post(
  '/:id/mark-paid',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Order not found');
    const order = await markOrderPaid(existing.id);
    return res.json({ order: serializeOrder(order) });
  }),
);

const manualOrderSchema = z.object({
  email: z.string().email(),
  items: z
    .array(z.object({ variantId: z.string(), quantity: z.coerce.number().int().positive() }))
    .min(1),
  shippingAddress: z.record(z.any()).nullable().optional(),
  discountCode: z.string().nullable().optional(),
  giftCardCode: z.string().nullable().optional(),
  paymentMethod: z.enum(['manual', 'cod', 'card']).default('manual'),
  notes: z.string().max(2000).nullable().optional(),
  markPaid: z.boolean().default(false),
});

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(manualOrderSchema),
  asyncHandler(async (req, res) => {
    const { order } = await placeOrder({
      store: req.store,
      items: req.body.items,
      email: req.body.email,
      shippingAddress: req.body.shippingAddress || null,
      discountCode: req.body.discountCode || null,
      giftCardCode: req.body.giftCardCode || null,
      paymentMethod: req.body.paymentMethod,
      notes: req.body.notes || null,
      financialStatus: req.body.markPaid ? 'paid' : 'pending',
    });
    return res.status(201).json({ order: serializeOrder(order) });
  }),
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(z.object({ notes: z.string().max(4000).nullable().optional(), trackingNumber: z.string().max(200).nullable().optional() })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.order.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Order not found');
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...(req.body.notes !== undefined ? { notes: req.body.notes } : {}),
        ...(req.body.trackingNumber !== undefined ? { trackingNumber: req.body.trackingNumber } : {}),
      },
      include: orderInclude,
    });
    return res.json({ order: serializeOrder(order) });
  }),
);

export default router;
