import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const serialize = (apiKey) => ({
  id: apiKey.id,
  name: apiKey.name,
  scopes: apiKey.scopes,
  masked_key: `${apiKey.key.slice(0, 12)}...${apiKey.key.slice(-4)}`,
  last_used_at: apiKey.lastUsedAt,
  revoked_at: apiKey.revokedAt,
  created_at: apiKey.createdAt,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const keys = await prisma.apiKey.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' } });
    return res.json({ api_keys: keys.map(serialize) });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(z.object({ name: z.string().trim().min(1).max(120), scopes: z.array(z.string()).default(['storefront:read']) })),
  asyncHandler(async (req, res) => {
    const key = `cc_live_${crypto.randomBytes(24).toString('base64url')}`;
    const apiKey = await prisma.apiKey.create({
      data: { storeId: req.storeId, name: req.body.name, scopes: req.body.scopes, key },
    });
    // The plaintext key is shown exactly once.
    return res.status(201).json({ api_key: serialize(apiKey), key });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!key) throw notFound('API key not found');
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    return res.json({ ok: true });
  }),
);

export default router;
