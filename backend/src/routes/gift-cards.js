import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const giftCardSchema = z.object({
  code: z.string().trim().min(4).max(60).optional(),
  balance: z.coerce.number().min(0).max(1_000_000),
  currency: z.string().length(3).optional(),
  active: z.boolean().default(true),
  expiresAt: z.coerce.date().nullable().optional(),
});

const serialize = (card) => ({
  id: card.id,
  code: card.code,
  balance: Number(card.balance),
  currency: card.currency,
  active: card.active,
  expires_at: card.expiresAt,
  created_at: card.createdAt,
});

const generateCode = () =>
  `GC-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cards = await prisma.giftCard.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' } });
    return res.json({ gift_cards: cards.map(serialize), count: cards.length });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(giftCardSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const card = await prisma.giftCard.create({
      data: {
        storeId: req.storeId,
        code: (data.code || generateCode()).toUpperCase(),
        balance: data.balance,
        currency: (data.currency || req.store.currency || 'USD').toUpperCase(),
        active: data.active,
        expiresAt: data.expiresAt ?? null,
      },
    });
    return res.status(201).json({ gift_card: serialize(card) });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(giftCardSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.giftCard.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Gift card not found');
    const data = req.body;
    const card = await prisma.giftCard.update({
      where: { id: existing.id },
      data: {
        ...(data.code ? { code: data.code.toUpperCase() } : {}),
        ...(data.balance !== undefined ? { balance: data.balance } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      },
    });
    return res.json({ gift_card: serialize(card) });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.giftCard.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Gift card not found');
    await prisma.giftCard.update({ where: { id: existing.id }, data: { active: false } });
    return res.json({ ok: true });
  }),
);

export default router;
