import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, HttpError } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { signLicense, verifyLicense } from '../lib/license.js';
import { normalizeDomain } from '../lib/slug.js';

const router = express.Router();

function requireLicenseAdmin(req, res, next) {
  if (!config.license.adminToken) {
    return res.status(503).json({ error: 'LICENSE_ADMIN_TOKEN is not configured' });
  }
  const token = req.headers['x-license-admin-token'];
  if (token !== config.license.adminToken) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

const verifyBody = z.object({
  license_key: z.string().min(1),
  domain: z.string().min(1),
});

router.post(
  '/verify',
  validateBody(verifyBody),
  asyncHandler(async (req, res) => {
    const { license_key, domain } = req.body;
    const normalized = normalizeDomain(domain);

    // Demo key: explicitly for local development only.
    if (config.license.allowDemo && license_key === config.license.demoKey) {
      return res.json({
        valid: true,
        tier: 'agency',
        perpetual: true,
        domain: normalized,
        updates_until: null,
        demo: true,
      });
    }

    if (!config.license.publicKey) {
      return res.status(503).json({ valid: false, error: 'LICENSE_PUBLIC_KEY is not configured' });
    }

    const result = verifyLicense(license_key, config.license.publicKey, normalized);
    if (!result.valid) {
      const status = result.reason === 'domain_mismatch' ? 401 : 400;
      return res.status(status).json({ valid: false, reason: result.reason, error: 'License is not valid for this domain' });
    }

    const record = await prisma.license.findUnique({ where: { key: license_key.trim() } });
    if (record?.revoked) {
      return res.status(403).json({ valid: false, reason: 'revoked' });
    }

    if (record) {
      prisma.license.update({ where: { key: record.key }, data: { lastCheckAt: new Date() } }).catch(() => {});
    }

    return res.json({
      valid: true,
      tier: result.payload.tier,
      perpetual: result.payload.perpetual,
      domain: normalized,
      updates_until: result.payload.updatesUntil,
      issued_at: result.payload.issued_at || null,
    });
  }),
);

router.post(
  '/activate',
  validateBody(verifyBody.extend({ store_id: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { license_key, domain, store_id } = req.body;
    const normalized = normalizeDomain(domain);

    if (!config.license.publicKey) {
      return res.status(503).json({ valid: false, error: 'LICENSE_PUBLIC_KEY is not configured' });
    }
    const result = verifyLicense(license_key, config.license.publicKey, normalized);
    if (!result.valid) {
      return res.status(result.reason === 'domain_mismatch' ? 401 : 400).json({ valid: false, reason: result.reason });
    }

    const license = await prisma.license.upsert({
      where: { key: license_key.trim() },
      update: { domain: normalized, activatedAt: new Date(), lastCheckAt: new Date(), ...(store_id ? { storeId: store_id } : {}) },
      create: {
        key: license_key.trim(),
        domain: normalized,
        tier: result.payload.tier || 'single',
        issuedAt: result.payload.issued_at ? new Date(result.payload.issued_at) : new Date(),
        updatesUntil: result.payload.updatesUntil ? new Date(result.payload.updatesUntil) : null,
        activatedAt: new Date(),
        ...(store_id ? { storeId: store_id } : {}),
      },
    });

    if (license.revoked) return res.status(403).json({ valid: false, reason: 'revoked' });
    return res.json({ valid: true, activated: true, tier: license.tier, domain: license.domain });
  }),
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const key = String(req.query.license_key || '');
    const domain = normalizeDomain(String(req.query.domain || ''));
    if (!key) throw badRequest('license_key is required');
    const record = await prisma.license.findUnique({ where: { key } });
    if (!record) return res.json({ valid: true, revoked: false, known: false, domain });
    return res.json({
      valid: !record.revoked,
      revoked: record.revoked,
      known: true,
      tier: record.tier,
      domain: record.domain,
      updates_until: record.updatesUntil,
    });
  }),
);

router.post(
  '/generate',
  requireLicenseAdmin,
  validateBody(
    z.object({
      domain: z.string().min(1),
      tier: z.enum(['single', 'unlimited', 'agency']).default('single'),
      updatesDays: z.coerce.number().int().min(0).max(3650).optional(),
      expiresAt: z.coerce.date().optional(),
      licenseId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!config.license.privateKey) {
      throw new HttpError(503, 'LICENSE_PRIVATE_KEY is not configured');
    }
    const domain = normalizeDomain(req.body.domain);
    const now = new Date();
    const payload = {
      id: req.body.licenseId || cryptoRandomId(),
      domain,
      tier: req.body.tier,
      issued_at: now.toISOString(),
      ...(req.body.updatesDays ? { updates_until: new Date(now.getTime() + req.body.updatesDays * 86400000).toISOString() } : {}),
      ...(req.body.expiresAt ? { expires_at: req.body.expiresAt.toISOString() } : {}),
    };
    const license_key = signLicense(payload, config.license.privateKey);

    await prisma.license.upsert({
      where: { key: license_key },
      update: {},
      create: {
        key: license_key,
        domain,
        tier: payload.tier,
        updatesUntil: payload.updates_until ? new Date(payload.updates_until) : null,
      },
    });

    return res.json({ license_key, payload });
  }),
);

router.post(
  '/revoke',
  requireLicenseAdmin,
  validateBody(z.object({ license_key: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const record = await prisma.license.findUnique({ where: { key: req.body.license_key } });
    if (!record) return res.status(404).json({ error: 'License not found' });
    await prisma.license.update({ where: { key: record.key }, data: { revoked: true } });
    return res.json({ ok: true, revoked: true });
  }),
);

const cryptoRandomId = () => {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export default router;
