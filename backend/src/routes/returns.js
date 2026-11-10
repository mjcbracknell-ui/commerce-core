import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { serializeReturn } from '../lib/serializers.js';
import { completeExchange, receiveReturn, refundReturn, rejectReturn } from '../services/returns.js';

const router = express.Router();
router.use(requireRole('owner', 'admin'));

const returnInclude = {
  order: { include: { store: true } },
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const returns = await prisma.orderReturn.findMany({
      where: { order: { storeId: req.storeId } },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return res.json({
      returns: returns.map((record) => ({
        ...serializeReturn(record),
        order_id: record.orderId,
        order_number: record.order.number,
      })),
    });
  }),
);

router.post(
  '/:id/receive',
  validateBody(z.object({ restock: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const record = await prisma.orderReturn.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: returnInclude,
    });
    if (!record) throw notFound('Return not found');
    const updated = await receiveReturn(record, { restock: req.body.restock });
    return res.json({ return: serializeReturn(updated) });
  }),
);

router.post(
  '/:id/refund',
  validateBody(
    z.object({
      amount: z.coerce.number().positive().optional(),
      notifyCustomer: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => {
    const record = await prisma.orderReturn.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: returnInclude,
    });
    if (!record) throw notFound('Return not found');
    const result = await refundReturn(record, req.body);
    return res.json({
      return: serializeReturn(result.returnRecord),
      order: {
        id: result.order.id,
        number: result.order.number,
        financial_status: result.order.financialStatus,
        refunded_total: Number(result.order.refundedTotal),
      },
    });
  }),
);

router.post(
  '/:id/exchange',
  validateBody(
    z.object({
      exchangeItems: z
        .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().positive() }))
        .optional(),
      carrier: z.string().trim().max(120).nullable().optional(),
      trackingNumber: z.string().trim().max(200).nullable().optional(),
      trackingUrl: z
        .string()
        .trim()
        .max(2048)
        .refine((value) => !value || /^https?:\/\//i.test(value), 'Tracking URL must start with http:// or https://')
        .nullable()
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const record = await prisma.orderReturn.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: returnInclude,
    });
    if (!record) throw notFound('Return not found');
    const updated = await completeExchange(record, req.body);
    return res.json({ return: serializeReturn(updated) });
  }),
);

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const record = await prisma.orderReturn.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: returnInclude,
    });
    if (!record) throw notFound('Return not found');
    const updated = await rejectReturn(record);
    return res.json({ return: serializeReturn(updated) });
  }),
);

export default router;
