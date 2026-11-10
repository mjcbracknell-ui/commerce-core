import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { WEBHOOK_TOPICS, sendTestDelivery } from '../lib/webhooks.js';

const router = express.Router();

const webhookSchema = z.object({
  topic: z.enum(WEBHOOK_TOPICS),
  url: z.string().url(),
  secret: z.string().min(16).max(128).optional(),
  active: z.boolean().default(true),
});

const serialize = (webhook) => ({
  id: webhook.id,
  topic: webhook.topic,
  url: webhook.url,
  active: webhook.active,
  last_status: webhook.lastStatus,
  last_delivered_at: webhook.lastDeliveredAt,
  created_at: webhook.createdAt,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const webhooks = await prisma.webhook.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' } });
    return res.json({ webhooks: webhooks.map(serialize), topics: WEBHOOK_TOPICS });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(webhookSchema),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.create({
      data: {
        storeId: req.storeId,
        topic: req.body.topic,
        url: req.body.url,
        secret: req.body.secret || crypto.randomBytes(24).toString('hex'),
        active: req.body.active,
      },
    });
    return res.status(201).json({ webhook: serialize(webhook), secret: webhook.secret });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(webhookSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Webhook not found');
    const webhook = await prisma.webhook.update({
      where: { id: existing.id },
      data: {
        ...(req.body.topic ? { topic: req.body.topic } : {}),
        ...(req.body.url ? { url: req.body.url } : {}),
        ...(req.body.active !== undefined ? { active: req.body.active } : {}),
      },
    });
    return res.json({ webhook: serialize(webhook) });
  }),
);

router.post(
  '/:id/test',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!webhook) throw notFound('Webhook not found');
    const result = await sendTestDelivery(webhook);
    return res.json({ ok: !result.error, delivery: result });
  }),
);

router.get(
  '/:id/deliveries',
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!webhook) throw notFound('Webhook not found');
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: webhook.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ deliveries });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Webhook not found');
    await prisma.webhook.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  }),
);

export default router;
