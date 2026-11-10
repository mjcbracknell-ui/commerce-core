import express from 'express';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, unauthorized, notFound } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, signAccessToken } from '../middleware/auth.js';
import {
  accessCookie,
  refreshCookie,
  cookieOptions,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from '../lib/tokens.js';
import { slugify } from '../lib/slug.js';
import { storeDomainForSlug, storefrontUrl } from '../lib/storefront-url.js';

const router = express.Router();
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = config.refreshTokenDays * 24 * 60 * 60 * 1000;

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  twoFAEnabled: user.twoFAEnabled,
  created_at: user.createdAt,
});

const storeSummary = (store, role) => ({
  id: store.id,
  name: store.name,
  domain: store.domain,
  currency: store.currency,
  role,
  storefront_url: storefrontUrl(store.domain),
});

/** Pick a free subdomain for a new store, appending -2, -3, ... on collision. */
async function nextStoreDomain(name) {
  const slug = slugify(name, 'store');
  const stores = await prisma.store.findMany({ select: { domain: true } });
  const taken = new Set(stores.map((store) => store.domain));
  let candidate = slug;
  let n = 2;
  while (taken.has(storeDomainForSlug(candidate))) {
    candidate = `${slug}-${n}`;
    n += 1;
  }
  return { slug: candidate, domain: storeDomainForSlug(candidate) };
}

async function setSession(res, user, req) {
  const token = signAccessToken(user);
  const { token: refreshToken } = await issueRefreshToken(prisma, user.id, req.headers['user-agent']);
  res.cookie(accessCookie, token, cookieOptions(ACCESS_TTL_MS));
  res.cookie(refreshCookie, refreshToken, cookieOptions(REFRESH_TTL_MS));
  return { token, refreshToken };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await bcrypt.compare(req.body.password, user.password) : false;
    if (!user || !ok) throw unauthorized('Invalid email or password');

    if (user.twoFAEnabled) {
      if (!req.body.totp) return res.status(401).json({ error: 'Two-factor code required', twoFactorRequired: true });
      const valid = speakeasy.totp.verify({
        secret: user.twoFASecret || '',
        encoding: 'base32',
        token: req.body.totp,
        window: 1,
      });
      if (!valid) return res.status(401).json({ error: 'Invalid two-factor code', twoFactorRequired: true });
    }

    const { token, refreshToken } = await setSession(res, user, req);
    return res.json({ token, refresh_token: refreshToken, user: publicUser(user) });
  }),
);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(120).optional(),
  storeName: z.string().trim().min(1).max(120),
  currency: z.string().length(3).default('USD'),
});

router.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw badRequest('An account with this email already exists');

    const password = await bcrypt.hash(req.body.password, 12);
    const { domain } = await nextStoreDomain(req.body.storeName);

    const { user, store } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, password, name: req.body.name || null, role: 'owner' },
      });
      const createdStore = await tx.store.create({
        data: {
          name: req.body.storeName,
          domain,
          currency: req.body.currency.toUpperCase(),
          settings: {
            currency: req.body.currency.toUpperCase(),
            taxRate: 0,
            shippingFlatRate: 0,
            freeShippingThreshold: 100,
            supportEmail: email,
          },
          users: { create: { userId: createdUser.id, role: 'owner' } },
        },
      });
      return { user: createdUser, store: createdStore };
    });

    const { token, refreshToken } = await setSession(res, user, req);
    return res.status(201).json({
      token,
      refresh_token: refreshToken,
      user: publicUser(user),
      store: storeSummary(store, 'owner'),
    });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[refreshCookie] || req.body?.refresh_token;
    const record = await consumeRefreshToken(prisma, token);
    if (!record) {
      res.clearCookie(accessCookie, cookieOptions(0));
      res.clearCookie(refreshCookie, cookieOptions(0));
      throw unauthorized('Refresh token is invalid or expired');
    }
    const { token: accessToken, refreshToken } = await setSession(res, record.user, req);
    return res.json({ token: accessToken, refresh_token: refreshToken, user: publicUser(record.user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(prisma, req.cookies?.[refreshCookie] || req.body?.refresh_token);
    res.clearCookie(accessCookie, cookieOptions(0));
    res.clearCookie(refreshCookie, cookieOptions(0));
    return res.json({ ok: true });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { stores: { include: { store: true } } },
    });
    if (!user) throw notFound('User not found');
    return res.json({
      user: publicUser(user),
      stores: user.stores.map((membership) => storeSummary(membership.store, membership.role)),
    });
  }),
);

router.post(
  '/2fa/setup',
  authenticate,
  asyncHandler(async (req, res) => {
    const secret = speakeasy.generateSecret({ name: `Commerce Core (${req.user.email})`, issuer: 'Commerce Core' });
    await prisma.user.update({ where: { id: req.user.id }, data: { twoFASecret: secret.base32 } });
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    return res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url, qr });
  }),
);

router.post(
  '/2fa/enable',
  authenticate,
  validateBody(z.object({ code: z.string().min(6).max(6) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.twoFASecret) throw badRequest('Start 2FA setup first');
    const valid = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token: req.body.code,
      window: 1,
    });
    if (!valid) throw badRequest('Invalid code');
    await prisma.user.update({ where: { id: user.id }, data: { twoFAEnabled: true } });
    return res.json({ ok: true, twoFAEnabled: true });
  }),
);

router.post(
  '/2fa/disable',
  authenticate,
  validateBody(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) throw unauthorized('Wrong password');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFAEnabled: false, twoFASecret: null },
    });
    return res.json({ ok: true, twoFAEnabled: false });
  }),
);

router.post(
  '/change-password',
  authenticate,
  validateBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.password))) {
      throw unauthorized('Current password is wrong');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(req.body.newPassword, 12) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.json({ ok: true });
  }),
);

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().length(3).default('USD'),
});

/** Add another storefront under the signed-in account. */
router.post(
  '/stores',
  authenticate,
  validateBody(createStoreSchema),
  asyncHandler(async (req, res) => {
    const currency = req.body.currency.toUpperCase();
    const { domain } = await nextStoreDomain(req.body.name);
    const store = await prisma.store.create({
      data: {
        name: req.body.name,
        domain,
        currency,
        settings: {
          currency,
          taxRate: 0,
          shippingFlatRate: 0,
          freeShippingThreshold: 100,
          supportEmail: req.user.email,
        },
        users: { create: { userId: req.user.id, role: 'owner' } },
      },
    });
    return res.status(201).json({ store: storeSummary(store, 'owner') });
  }),
);

export default router;
