import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { storeSettings } from '../lib/pricing.js';

const router = express.Router();

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  domain: z.string().trim().min(3).max(253).optional(),
  currency: z.string().length(3).optional(),
  settings: z
    .object({
      taxRate: z.coerce.number().min(0).max(100).optional(),
      shippingFlatRate: z.coerce.number().min(0).max(100000).optional(),
      freeShippingThreshold: z.coerce.number().min(0).nullable().optional(),
      supportEmail: z.string().email().or(z.literal('')).optional(),
      orderPrefix: z.string().max(10).optional(),
    })
    .partial()
    .optional(),
});

const serialize = (store) => ({
  id: store.id,
  name: store.name,
  domain: store.domain,
  currency: store.currency,
  settings: storeSettings(store),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    return res.json({ store: serialize(req.store) });
  }),
);

router.put(
  '/',
  requireRole('owner', 'admin'),
  validateBody(settingsSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const store = await prisma.store.update({
      where: { id: req.storeId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.domain ? { domain: data.domain.toLowerCase() } : {}),
        ...(data.currency ? { currency: data.currency.toUpperCase() } : {}),
        settings: {
          ...storeSettings(req.store),
          ...(data.settings || {}),
          ...(data.currency ? { currency: data.currency.toUpperCase() } : {}),
        },
      },
    });
    return res.json({ store: serialize(store) });
  }),
);

// Payment availability for the admin UI.
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    res.json({
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      manual: true,
      cod: true,
    });
  }),
);

export default router;
