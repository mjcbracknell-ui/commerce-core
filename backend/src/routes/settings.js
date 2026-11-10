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

const shippingRateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rate: z.coerce.number().min(0).max(1000000),
  minSubtotal: z.coerce.number().min(0).nullable().optional(),
  maxSubtotal: z.coerce.number().min(0).nullable().optional(),
  freeOver: z.coerce.number().min(0).nullable().optional(),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const shippingZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countries: z.array(z.string().trim().min(1).max(120)).max(250).default([]),
  regions: z.array(z.string().trim().min(1).max(120)).max(250).default([]),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  rates: z.array(shippingRateSchema).min(1).max(20),
});

const taxRegionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).nullable().optional(),
  rate: z.coerce.number().min(0).max(100),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const serializeZone = (zone) => ({
  id: zone.id,
  name: zone.name,
  countries: zone.countries || [],
  regions: zone.regions || [],
  position: zone.position,
  active: zone.active,
  rates: (zone.rates || []).map((rate) => ({
    id: rate.id,
    name: rate.name,
    rate: Number(rate.rate),
    min_subtotal: rate.minSubtotal == null ? null : Number(rate.minSubtotal),
    max_subtotal: rate.maxSubtotal == null ? null : Number(rate.maxSubtotal),
    free_over: rate.freeOver == null ? null : Number(rate.freeOver),
    position: rate.position,
    active: rate.active,
  })),
});

const serializeTaxRegion = (region) => ({
  id: region.id,
  name: region.name,
  country: region.country,
  region: region.region,
  rate: Number(region.rate),
  position: region.position,
  active: region.active,
});

async function loadZones(storeId) {
  return prisma.shippingZone.findMany({
    where: { storeId },
    include: { rates: { orderBy: { position: 'asc' } } },
    orderBy: { position: 'asc' },
  });
}

async function loadTaxRegions(storeId) {
  return prisma.taxRegion.findMany({
    where: { storeId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}

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

router.get(
  '/shipping-zones',
  asyncHandler(async (req, res) => {
    const zones = await loadZones(req.storeId);
    return res.json({ zones: zones.map(serializeZone) });
  }),
);

router.put(
  '/shipping-zones',
  requireRole('owner', 'admin'),
  validateBody(z.object({ zones: z.array(shippingZoneSchema).max(20) })),
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      await tx.shippingZone.deleteMany({ where: { storeId: req.storeId } });
      for (const zone of req.body.zones) {
        await tx.shippingZone.create({
          data: {
            storeId: req.storeId,
            name: zone.name,
            countries: zone.countries,
            regions: zone.regions,
            position: zone.position,
            active: zone.active,
            rates: {
              create: zone.rates.map((rate, index) => ({
                name: rate.name,
                rate: rate.rate,
                minSubtotal: rate.minSubtotal ?? null,
                maxSubtotal: rate.maxSubtotal ?? null,
                freeOver: rate.freeOver ?? null,
                position: rate.position ?? index,
                active: rate.active,
              })),
            },
          },
        });
      }
    });
    const zones = await loadZones(req.storeId);
    return res.json({ zones: zones.map(serializeZone) });
  }),
);

router.get(
  '/tax-regions',
  asyncHandler(async (req, res) => {
    const regions = await loadTaxRegions(req.storeId);
    return res.json({ regions: regions.map(serializeTaxRegion) });
  }),
);

router.put(
  '/tax-regions',
  requireRole('owner', 'admin'),
  validateBody(z.object({ regions: z.array(taxRegionSchema).max(250) })),
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      await tx.taxRegion.deleteMany({ where: { storeId: req.storeId } });
      if (req.body.regions.length) {
        await tx.taxRegion.createMany({
          data: req.body.regions.map((region) => ({
            storeId: req.storeId,
            name: region.name,
            country: region.country,
            region: region.region || null,
            rate: region.rate,
            position: region.position,
            active: region.active,
          })),
        });
      }
    });
    const regions = await loadTaxRegions(req.storeId);
    return res.json({ regions: regions.map(serializeTaxRegion) });
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
