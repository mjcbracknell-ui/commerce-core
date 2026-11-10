import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, notFound, parseIntParam } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { slugify, uniqueHandle } from '../lib/slug.js';
import { serializeProduct } from '../lib/serializers.js';
import { parseCsvObjects, parseCsv, productsToShopifyCsv, shopifyCsvToProducts } from '../lib/csv.js';
import { indexProducts, removeProduct } from '../lib/search.js';
import { dispatchEventLater } from '../lib/webhooks.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes } });

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().max(160).default('Default Title'),
  sku: z.string().trim().max(120).nullable().optional(),
  price: z.coerce.number().min(0).max(1_000_000),
  compareAtPrice: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  inventory: z.coerce.number().int().min(-1_000_000).max(10_000_000).default(0),
  option1: z.string().nullable().optional(),
  option2: z.string().nullable().optional(),
  option3: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

const imageSchema = z.union([
  z.string(),
  z.object({ src: z.string(), alt: z.string().optional() }),
]);

const productSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().max(120).optional(),
  descriptionHtml: z.string().max(500_000).nullable().optional(),
  vendor: z.string().trim().max(160).nullable().optional(),
  productType: z.string().trim().max(160).nullable().optional(),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  tags: z.array(z.string().trim()).max(250).default([]),
  images: z.array(imageSchema).max(50).default([]),
  featuredImage: z.string().nullable().optional(),
  seoTitle: z.string().max(255).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  variants: z.array(variantSchema).min(1, 'At least one variant is required').max(100),
});

const normalizeImages = (images = []) => images.map((image) => (typeof image === 'string' ? { src: image } : image));

function variantData(variant, position) {
  return {
    title: variant.title,
    sku: variant.sku || null,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    inventory: variant.inventory ?? 0,
    option1: variant.option1 ?? null,
    option2: variant.option2 ?? null,
    option3: variant.option3 ?? null,
    image: variant.image ?? null,
    position,
  };
}

async function availableHandle(storeId, base, excludeId) {
  const existing = await prisma.product.findMany({
    where: { storeId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { handle: true },
  });
  return uniqueHandle(slugify(base, 'product'), existing.map((p) => p.handle));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseIntParam(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parseIntParam(req.query.limit, 50, { min: 1, max: 250 });
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const collectionId = String(req.query.collectionId || '').trim();

    const where = {
      storeId: req.storeId,
      ...(status ? { status } : {}),
      ...(collectionId ? { collectionProducts: { some: { collectionId } } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { vendor: { contains: search, mode: 'insensitive' } },
              { productType: { contains: search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [products, count] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { variants: { orderBy: { position: 'asc' } }, collectionProducts: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return res.json({
      products: products.map((p) => serializeProduct(p, { admin: true })),
      count,
      page,
      limit,
      pages: Math.ceil(count / limit) || 1,
    });
  }),
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const handle = data.handle
      ? await availableHandle(req.storeId, data.handle)
      : await availableHandle(req.storeId, data.title);
    const images = normalizeImages(data.images);

    const product = await prisma.product.create({
      data: {
        storeId: req.storeId,
        title: data.title,
        handle,
        descriptionHtml: data.descriptionHtml ?? null,
        vendor: data.vendor ?? null,
        productType: data.productType ?? null,
        status: data.status,
        tags: data.tags,
        images,
        featuredImage: data.featuredImage ?? images[0]?.src ?? null,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        publishedAt: data.status === 'active' ? new Date() : null,
        variants: { create: data.variants.map(variantData) },
      },
      include: { variants: { orderBy: { position: 'asc' } } },
    });

    indexProducts([product]).catch(() => {});
    dispatchEventLater(req.storeId, 'products/create', serializeProduct(product));
    return res.status(201).json({ product: serializeProduct(product, { admin: true }) });
  }),
);

router.post(
  '/import-shopify',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.products) ? payload.products : [payload.product || payload];
    const imported = [];

    for (const item of items) {
      if (!item?.title) continue;
      const variants = (item.variants?.length ? item.variants : [{ price: item.price || 0 }]).map((v, index) => ({
        title: v.title || 'Default Title',
        sku: v.sku || null,
        price: Number(v.price ?? 0),
        compareAtPrice: v.compare_at_price ? Number(v.compare_at_price) : null,
        inventory: Number(v.inventory_quantity ?? v.inventory ?? 0),
        option1: v.option1 ?? null,
        option2: v.option2 ?? null,
        option3: v.option3 ?? null,
        image: v.image?.src || v.image || null,
        position: index,
      }));
      const images = (item.images || []).map((img) => (typeof img === 'string' ? { src: img } : { src: img.src, alt: img.alt }));

      const handle = await availableHandle(req.storeId, item.handle || item.title);
      const product = await prisma.product.upsert({
        where: { storeId_handle: { storeId: req.storeId, handle: item.handle || handle } },
        update: {
          title: item.title,
          descriptionHtml: item.body_html ?? item.descriptionHtml ?? null,
          vendor: item.vendor ?? null,
          productType: item.product_type ?? item.productType ?? null,
          tags: Array.isArray(item.tags) ? item.tags : String(item.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
          images,
          featuredImage: images[0]?.src ?? null,
          variants: { deleteMany: {}, create: variants },
        },
        create: {
          storeId: req.storeId,
          title: item.title,
          handle: item.handle || handle,
          descriptionHtml: item.body_html ?? item.descriptionHtml ?? null,
          vendor: item.vendor ?? null,
          productType: item.product_type ?? item.productType ?? null,
          status: item.status || 'active',
          tags: Array.isArray(item.tags) ? item.tags : String(item.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
          images,
          featuredImage: images[0]?.src ?? null,
          publishedAt: new Date(),
          variants: { create: variants },
        },
        include: { variants: true },
      });
      imported.push(serializeProduct(product, { admin: true }));
    }

    indexProducts(imported).catch(() => {});
    return res.json({ imported: imported.length, products: imported });
  }),
);

router.post(
  '/import-csv',
  requireRole('owner', 'admin'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    let text = req.file ? req.file.buffer.toString('utf8') : req.body?.csv;
    if (!text && req.body?.file) text = String(req.body.file);
    if (!text) throw badRequest('Upload a CSV file in the "file" field or send { csv }');
    if (!parseCsv(text).length) throw badRequest('CSV is empty');

    const parsed = shopifyCsvToProducts(text);
    const imported = [];
    for (const item of parsed) {
      const handle = await availableHandle(req.storeId, item.handle || item.title);
      const product = await prisma.product.upsert({
        where: { storeId_handle: { storeId: req.storeId, handle: item.handle || handle } },
        update: {
          title: item.title,
          descriptionHtml: item.descriptionHtml,
          vendor: item.vendor,
          productType: item.productType,
          tags: item.tags,
          featuredImage: item.featuredImage,
          variants: { deleteMany: {}, create: item.variants.map(variantData) },
        },
        create: {
          storeId: req.storeId,
          title: item.title,
          handle: item.handle || handle,
          descriptionHtml: item.descriptionHtml,
          vendor: item.vendor,
          productType: item.productType,
          status: item.status,
          tags: item.tags,
          images: item.images,
          featuredImage: item.featuredImage,
          publishedAt: new Date(),
          variants: { create: item.variants.map(variantData) },
        },
        include: { variants: true },
      });
      imported.push(serializeProduct(product, { admin: true }));
    }
    indexProducts(imported).catch(() => {});
    return res.json({ imported: imported.length, products: imported });
  }),
);

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId },
      include: { variants: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    return res.send(productsToShopifyCsv(products.map((p) => serializeProduct(p, { admin: true }))));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { variants: { orderBy: { position: 'asc' } }, collectionProducts: true },
    });
    if (!product) throw notFound('Product not found');
    return res.json({ product: serializeProduct(product, { admin: true }) });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(productSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { variants: true },
    });
    if (!existing) throw notFound('Product not found');

    const data = req.body;
    const handle = data.handle ? await availableHandle(req.storeId, data.handle, existing.id) : undefined;
    const images = data.images ? normalizeImages(data.images) : undefined;

    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(handle ? { handle } : {}),
          ...(data.descriptionHtml !== undefined ? { descriptionHtml: data.descriptionHtml } : {}),
          ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
          ...(data.productType !== undefined ? { productType: data.productType } : {}),
          ...(data.status !== undefined
            ? { status: data.status, publishedAt: data.status === 'active' ? existing.publishedAt || new Date() : existing.publishedAt }
            : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          ...(images ? { images, featuredImage: data.featuredImage ?? images[0]?.src ?? null } : {}),
          ...(data.featuredImage !== undefined && !images ? { featuredImage: data.featuredImage } : {}),
          ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
          ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
        },
      });

      if (data.variants) {
        const keptIds = [];
        for (const [index, variant] of data.variants.entries()) {
          if (variant.id) {
            const belongs = existing.variants.some((v) => v.id === variant.id);
            if (belongs) {
              const updated = await tx.variant.update({
                where: { id: variant.id },
                data: variantData(variant, index),
              });
              keptIds.push(updated.id);
              continue;
            }
          }
          const created = await tx.variant.create({
            data: { ...variantData(variant, index), productId: existing.id },
          });
          keptIds.push(created.id);
        }
        await tx.variant.deleteMany({
          where: { productId: existing.id, id: { notIn: keptIds } },
        });
      }

      return tx.product.findUnique({
        where: { id: existing.id },
        include: { variants: { orderBy: { position: 'asc' } }, collectionProducts: true },
      });
    });

    indexProducts([product]).catch(() => {});
    dispatchEventLater(req.storeId, 'products/update', serializeProduct(product));
    return res.json({ product: serializeProduct(product, { admin: true }) });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { variants: true },
    });
    if (!existing) throw notFound('Product not found');
    await prisma.product.delete({ where: { id: existing.id } });
    removeProduct(existing.id).catch(() => {});
    dispatchEventLater(req.storeId, 'products/delete', { id: existing.id, handle: existing.handle, title: existing.title });
    return res.json({ ok: true, deleted: existing.id });
  }),
);

export default router;
