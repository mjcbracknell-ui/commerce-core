import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const discountSchema = z.object({
  code: z.string().trim().min(1).max(60),
  type: z.enum(['percentage', 'fixed_amount', 'free_shipping']).default('percentage'),
  value: z.coerce.number().min(0).default(0),
  usageLimit: z.coerce.number().int().min(1).nullable().optional(),
  minSubtotal: z.coerce.number().min(0).nullable().optional(),
  active: z.boolean().default(true),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

const serialize = (discount) => ({
  id: discount.id,
  code: discount.code,
  type: discount.type,
  value: Number(discount.value),
  usage_limit: discount.usageLimit,
  usage_count: discount.usageCount,
  min_subtotal: discount.minSubtotal == null ? null : Number(discount.minSubtotal),
  active: discount.active,
  starts_at: discount.startsAt,
  ends_at: discount.endsAt,
  created_at: discount.createdAt,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const discounts = await prisma.discount.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ discounts: discounts.map(serialize), count: discounts.length });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(discountSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const discount = await prisma.discount.create({
      data: {
        storeId: req.storeId,
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        usageLimit: data.usageLimit ?? null,
        minSubtotal: data.minSubtotal ?? null,
        active: data.active,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
      },
    });
    return res.status(201).json({ discount: serialize(discount) });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(discountSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.discount.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Discount not found');
    const data = req.body;
    const discount = await prisma.discount.update({
      where: { id: existing.id },
      data: {
        ...(data.code ? { code: data.code.toUpperCase() } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
        ...(data.minSubtotal !== undefined ? { minSubtotal: data.minSubtotal } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
      },
    });
    return res.json({ discount: serialize(discount) });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.discount.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Discount not found');
    await prisma.discount.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  }),
);

export default router;
