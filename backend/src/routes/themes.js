import path from 'node:path';
import express from 'express';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loadBundledTheme, renderTheme, summarizeTheme, DEFAULT_THEME_FILES } from '../lib/theme.js';
import { serializeProduct } from '../lib/serializers.js';
import { storeSettings } from '../lib/pricing.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes } });

const THEME_EXTENSIONS = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.txt', '.md']);

const serialize = (theme) => ({
  id: theme.id,
  name: theme.name,
  is_active: theme.isActive,
  summary: summarizeTheme(theme.files || {}),
  created_at: theme.createdAt,
  updated_at: theme.updatedAt,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const themes = await prisma.theme.findMany({ where: { storeId: req.storeId }, orderBy: { createdAt: 'desc' } });
    const bundled = loadBundledTheme('dawn-clone');
    return res.json({
      themes: themes.map(serialize),
      bundled_available: Boolean(bundled),
      count: themes.length,
    });
  }),
);

router.post(
  '/upload',
  requireRole('owner', 'admin'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Upload a theme ZIP in the "file" field');

    let zip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      throw badRequest('File is not a valid ZIP archive');
    }

    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    if (entries.length > 2000) throw badRequest('Theme has too many files');

    const files = {};
    let totalBytes = 0;
    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, '/');
      if (name.startsWith('/') || name.includes('..') || /^[A-Za-z]:/.test(name)) continue;
      if (!THEME_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      const data = entry.getData();
      totalBytes += data.length;
      if (totalBytes > config.uploads.maxBytes) throw badRequest('Theme archive is too large');
      files[name] = data.toString('utf8');
    }

    if (!files['layout/theme.liquid']) throw badRequest('Theme must contain layout/theme.liquid');
    if (!files['templates/index.json']) files['templates/index.json'] = DEFAULT_THEME_FILES['templates/index.json'];

    const name = (req.body?.name || path.basename(req.file.originalname || 'theme.zip', '.zip') || 'Uploaded theme').slice(0, 120);
    const theme = await prisma.theme.create({
      data: { storeId: req.storeId, name, files, isActive: false },
    });
    return res.status(201).json({ theme: serialize(theme) });
  }),
);

router.post(
  '/install-bundled',
  requireRole('owner', 'admin'),
  validateBody(z.object({ name: z.string().default('dawn-clone') })),
  asyncHandler(async (req, res) => {
    const bundled = loadBundledTheme(req.body.name);
    if (!bundled) throw notFound('Bundled theme not found');
    const theme = await prisma.$transaction(async (tx) => {
      await tx.theme.updateMany({ where: { storeId: req.storeId }, data: { isActive: false } });
      return tx.theme.create({
        data: { storeId: req.storeId, name: `${bundled.name} (bundled)`, files: bundled.files, isActive: true },
      });
    });
    return res.status(201).json({ theme: serialize(theme) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const theme = await prisma.theme.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!theme) throw notFound('Theme not found');
    return res.json({ theme: serialize(theme), files: theme.files });
  }),
);

router.post(
  '/:id/activate',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const theme = await prisma.theme.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!theme) throw notFound('Theme not found');
    const active = await prisma.$transaction(async (tx) => {
      await tx.theme.updateMany({ where: { storeId: req.storeId }, data: { isActive: false } });
      return tx.theme.update({ where: { id: theme.id }, data: { isActive: true } });
    });
    return res.json({ theme: serialize(active) });
  }),
);

router.get(
  '/:id/preview',
  asyncHandler(async (req, res) => {
    const theme = await prisma.theme.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!theme) throw notFound('Theme not found');
    const products = await prisma.product.findMany({
      where: { storeId: req.storeId, status: 'active' },
      include: { variants: true },
      take: 12,
    });
    const collections = await prisma.collection.findMany({ where: { storeId: req.storeId }, take: 6 });
    const html = await renderTheme({
      files: theme.files,
      template: req.query.template || 'index',
      data: {
        shop: { name: req.store.name, domain: req.store.domain, currency: req.store.currency, settings: storeSettings(req.store) },
        products: products.map((product) => serializeProduct(product)),
        collections: collections.map((c) => ({ title: c.title, handle: c.handle })),
        cart: { item_count: 0 },
        preview: true,
      },
    });
    res.type('html').send(html);
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const theme = await prisma.theme.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!theme) throw notFound('Theme not found');
    if (theme.isActive) throw badRequest('Activate another theme before deleting the active one');
    await prisma.theme.delete({ where: { id: theme.id } });
    return res.json({ ok: true });
  }),
);

export default router;
