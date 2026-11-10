import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { slugify, uniqueHandle } from '../lib/slug.js';

const router = express.Router();

const collectionSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().max(120).optional(),
  descriptionHtml: z.string().max(100_000).nullable().optional(),
  ruleType: z.enum(['manual', 'automated']).default('manual'),
  rules: z.any().optional(),
  image: z.string().nullable().optional(),
  productIds: z.array(z.string()).max(500).optional(),
});

const serialize = (collection) => ({
  id: collection.id,
  title: collection.title,
  handle: collection.handle,
  description_html: collection.descriptionHtml || '',
  rule_type: collection.ruleType,
  rules: collection.rules,
  image: collection.image,
  products_count: collection._count?.products ?? collection.products?.length ?? 0,
  created_at: collection.createdAt,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const collections = await prisma.collection.findMany({
      where: { storeId: req.storeId },
      include: { _count: { select: { products: true } } },
      orderBy: { title: 'asc' },
    });
    return res.json({ collections: collections.map(serialize), count: collections.length });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(collectionSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const existing = await prisma.collection.findMany({ where: { storeId: req.storeId }, select: { handle: true } });
    const handle = uniqueHandle(slugify(data.handle || data.title, 'collection'), existing.map((c) => c.handle));
    const productIds = [...new Set(data.productIds || [])];

    const collection = await prisma.collection.create({
      data: {
        storeId: req.storeId,
        title: data.title,
        handle,
        descriptionHtml: data.descriptionHtml ?? null,
        ruleType: data.ruleType,
        rules: data.rules ?? undefined,
        image: data.image ?? null,
        products: productIds.length
          ? { create: productIds.map((productId, position) => ({ productId, position })) }
          : undefined,
      },
      include: { _count: { select: { products: true } } },
    });
    return res.status(201).json({ collection: serialize(collection) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const collection = await prisma.collection.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { products: { include: { product: { include: { variants: true } } }, orderBy: { position: 'asc' } } },
    });
    if (!collection) throw notFound('Collection not found');
    return res.json({
      collection: {
        ...serialize(collection),
        product_ids: collection.products.map((p) => p.productId),
      },
    });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(collectionSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Collection not found');
    const data = req.body;

    const collection = await prisma.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.descriptionHtml !== undefined ? { descriptionHtml: data.descriptionHtml } : {}),
          ...(data.ruleType !== undefined ? { ruleType: data.ruleType } : {}),
          ...(data.rules !== undefined ? { rules: data.rules } : {}),
          ...(data.image !== undefined ? { image: data.image } : {}),
        },
      });

      if (data.productIds) {
        const uniqueIds = [...new Set(data.productIds)];
        await tx.collectionProduct.deleteMany({ where: { collectionId: existing.id } });
        if (uniqueIds.length) {
          await tx.collectionProduct.createMany({
            data: uniqueIds.map((productId, position) => ({ collectionId: existing.id, productId, position })),
            skipDuplicates: true,
          });
        }
      }

      return tx.collection.findUnique({
        where: { id: existing.id },
        include: { _count: { select: { products: true } } },
      });
    });

    return res.json({ collection: serialize(collection) });
  }),
);

router.post(
  '/:id/products',
  requireRole('owner', 'admin'),
  validateBody(z.object({ productIds: z.array(z.string()).min(1) })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Collection not found');
    const count = await prisma.collectionProduct.count({ where: { collectionId: existing.id } });
    await prisma.collectionProduct.createMany({
      data: req.body.productIds.map((productId, index) => ({
        collectionId: existing.id,
        productId,
        position: count + index,
      })),
      skipDuplicates: true,
    });
    return res.json({ ok: true });
  }),
);

router.delete(
  '/:id/products/:productId',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    await prisma.collectionProduct.deleteMany({
      where: { collectionId: req.params.id, productId: req.params.productId, collection: { storeId: req.storeId } },
    });
    return res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Collection not found');
    await prisma.collection.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  }),
);

export default router;
