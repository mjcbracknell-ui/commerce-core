import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, notFound, unauthorized } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { resolvePublicStore } from '../middleware/auth.js';
import {
  serializeAddress,
  serializeCustomerAccount,
  serializeOrder,
} from '../lib/serializers.js';
import { sendCustomerVerification } from '../lib/mailer.js';
import {
  authenticateCustomer,
  clearCustomerCookies,
  createVerificationCode,
  customerRefreshCookie,
  issueCustomerSession,
  revokeCustomerSession,
  rotateCustomerSession,
  setCustomerCookies,
  verificationCodeMatches,
} from '../lib/customer-auth.js';

const router = express.Router();
router.use(resolvePublicStore);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account attempts, try again later' },
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const devCode = (code) => (!config.isProd && !config.smtp.host ? { verification_code: code } : {});
const customerInclude = {
  addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
};

const orderInclude = {
  customer: true,
  fulfillments: { orderBy: { createdAt: 'asc' } },
};

async function accountOrders(storeId, customer) {
  return prisma.order.findMany({
    where: { storeId, OR: [{ customerId: customer.id }, { email: customer.email }] },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const existing = await prisma.customer.findUnique({
      where: { storeId_email: { storeId: req.storeId, email } },
    });
    if (existing?.emailVerifiedAt && existing.passwordHash) {
      throw badRequest('An account with this email already exists. Sign in instead.');
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const { code, hash, expiresAt } = createVerificationCode();
    const customer = await prisma.customer.upsert({
      where: { storeId_email: { storeId: req.storeId, email } },
      update: {
        passwordHash,
        ...(req.body.firstName !== undefined ? { firstName: req.body.firstName || null } : {}),
        ...(req.body.lastName !== undefined ? { lastName: req.body.lastName || null } : {}),
        ...(req.body.phone !== undefined ? { phone: req.body.phone || null } : {}),
        emailVerifiedAt: null,
        verificationCodeHash: hash,
        verificationExpiresAt: expiresAt,
      },
      create: {
        storeId: req.storeId,
        email,
        passwordHash,
        firstName: req.body.firstName || null,
        lastName: req.body.lastName || null,
        phone: req.body.phone || null,
        verificationCodeHash: hash,
        verificationExpiresAt: expiresAt,
      },
    });

    await sendCustomerVerification({ email, code, store: req.store }).catch(() => {});
    return res.status(201).json({
      verification_required: true,
      email: customer.email,
      ...devCode(code),
    });
  }),
);

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

router.post(
  '/verify',
  authLimiter,
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const customer = await prisma.customer.findUnique({
      where: { storeId_email: { storeId: req.storeId, email } },
    });
    if (!customer) throw badRequest('Invalid verification code');
    if (customer.emailVerifiedAt) throw badRequest('This email is already verified. Sign in instead.');
    if (
      !customer.verificationCodeHash ||
      !customer.verificationExpiresAt ||
      customer.verificationExpiresAt < new Date()
    ) {
      throw badRequest('Verification code expired. Request a new code.');
    }
    if (!verificationCodeMatches(req.body.code, customer.verificationCodeHash)) {
      throw badRequest('Invalid verification code');
    }

    const verified = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        emailVerifiedAt: new Date(),
        verificationCodeHash: null,
        verificationExpiresAt: null,
        lastLoginAt: new Date(),
      },
    });
    const session = await issueCustomerSession(verified, req.headers['user-agent']);
    setCustomerCookies(res, session);
    return res.json({
      customer: serializeCustomerAccount(verified),
      token: session.token,
      refresh_token: session.refreshToken,
    });
  }),
);

const resendSchema = z.object({ email: z.string().email() });

router.post(
  '/resend-verification',
  authLimiter,
  validateBody(resendSchema),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const customer = await prisma.customer.findUnique({
      where: { storeId_email: { storeId: req.storeId, email } },
    });
    if (!customer || customer.emailVerifiedAt) {
      throw badRequest('No pending account found for this email.');
    }
    const { code, hash, expiresAt } = createVerificationCode();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { verificationCodeHash: hash, verificationExpiresAt: expiresAt },
    });
    await sendCustomerVerification({ email, code, store: req.store }).catch(() => {});
    return res.json({ verification_required: true, ...devCode(code) });
  }),
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const customer = await prisma.customer.findUnique({
      where: { storeId_email: { storeId: req.storeId, email } },
    });
    const matches = customer?.passwordHash
      ? await bcrypt.compare(req.body.password, customer.passwordHash)
      : false;
    if (!customer || !matches) throw unauthorized('Invalid email or password');
    if (!customer.emailVerifiedAt) {
      return res.status(403).json({
        error: 'Verify your email before signing in.',
        verification_required: true,
        email: customer.email,
      });
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });
    const session = await issueCustomerSession(updated, req.headers['user-agent']);
    setCustomerCookies(res, session);
    return res.json({
      customer: serializeCustomerAccount(updated),
      token: session.token,
      refresh_token: session.refreshToken,
    });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[customerRefreshCookie] || req.body?.refresh_token;
    const rotated = await rotateCustomerSession(refreshToken, req.headers['user-agent']);
    if (!rotated) {
      clearCustomerCookies(res);
      throw unauthorized('Session expired. Please sign in again.');
    }
    setCustomerCookies(res, rotated);
    return res.json({
      customer: serializeCustomerAccount(rotated.customer),
      token: rotated.token,
      refresh_token: rotated.refreshToken,
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeCustomerSession(req.cookies?.[customerRefreshCookie] || req.body?.refresh_token);
    clearCustomerCookies(res);
    return res.json({ ok: true });
  }),
);

router.use(authenticateCustomer);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer.id },
      include: customerInclude,
    });
    if (!customer) throw notFound('Customer not found');
    const orders = await accountOrders(req.storeId, customer);
    return res.json({
      customer: serializeCustomerAccount(customer),
      addresses: (customer.addresses || []).map(serializeAddress),
      orders: orders.map((order) => serializeOrder(order, { includeCustomer: false })),
    });
  }),
);

router.patch(
  '/',
  validateBody(
    z.object({
      firstName: z.string().trim().max(120).nullable().optional(),
      lastName: z.string().trim().max(120).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.update({
      where: { id: req.customer.id },
      data: {
        ...(req.body.firstName !== undefined ? { firstName: req.body.firstName } : {}),
        ...(req.body.lastName !== undefined ? { lastName: req.body.lastName } : {}),
        ...(req.body.phone !== undefined ? { phone: req.body.phone } : {}),
      },
      include: customerInclude,
    });
    return res.json({ customer: serializeCustomerAccount(customer) });
  }),
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const orders = await accountOrders(req.storeId, req.customer);
    return res.json({ orders: orders.map((order) => serializeOrder(order, { includeCustomer: false })) });
  }),
);

router.get(
  '/orders/:number',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: {
        storeId: req.storeId,
        number: req.params.number,
        OR: [{ customerId: req.customer.id }, { email: req.customer.email }],
      },
      include: orderInclude,
    });
    if (!order) throw notFound('Order not found');
    return res.json({ order: serializeOrder(order, { includeCustomer: false }) });
  }),
);

const addressSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  address1: z.string().trim().min(1).max(200),
  address2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().min(1).max(40),
  country: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  isDefault: z.boolean().optional(),
});

router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: req.customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return res.json({ addresses: addresses.map(serializeAddress) });
  }),
);

router.post(
  '/addresses',
  validateBody(addressSchema),
  asyncHandler(async (req, res) => {
    const count = await prisma.customerAddress.count({ where: { customerId: req.customer.id } });
    if (count >= 20) throw badRequest('You can save up to 20 addresses');
    const isDefault = req.body.isDefault ?? count === 0;
    const address = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: req.customer.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.create({
        data: {
          customerId: req.customer.id,
          label: req.body.label || null,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          address1: req.body.address1,
          address2: req.body.address2 || null,
          city: req.body.city,
          region: req.body.region || null,
          postalCode: req.body.postalCode,
          country: req.body.country,
          phone: req.body.phone || null,
          isDefault,
        },
      });
    });
    return res.status(201).json({ address: serializeAddress(address) });
  }),
);

router.patch(
  '/addresses/:id',
  validateBody(addressSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.customerAddress.findFirst({
      where: { id: req.params.id, customerId: req.customer.id },
    });
    if (!existing) throw notFound('Address not found');

    const address = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: req.customer.id, isDefault: true, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({
        where: { id: existing.id },
        data: {
          ...(req.body.label !== undefined ? { label: req.body.label || null } : {}),
          ...(req.body.firstName !== undefined ? { firstName: req.body.firstName } : {}),
          ...(req.body.lastName !== undefined ? { lastName: req.body.lastName } : {}),
          ...(req.body.address1 !== undefined ? { address1: req.body.address1 } : {}),
          ...(req.body.address2 !== undefined ? { address2: req.body.address2 || null } : {}),
          ...(req.body.city !== undefined ? { city: req.body.city } : {}),
          ...(req.body.region !== undefined ? { region: req.body.region || null } : {}),
          ...(req.body.postalCode !== undefined ? { postalCode: req.body.postalCode } : {}),
          ...(req.body.country !== undefined ? { country: req.body.country } : {}),
          ...(req.body.phone !== undefined ? { phone: req.body.phone || null } : {}),
          ...(req.body.isDefault !== undefined ? { isDefault: req.body.isDefault } : {}),
        },
      });
    });
    return res.json({ address: serializeAddress(address) });
  }),
);

router.delete(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.customerAddress.findFirst({
      where: { id: req.params.id, customerId: req.customer.id },
    });
    if (!existing) throw notFound('Address not found');

    await prisma.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId: req.customer.id },
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
    return res.json({ ok: true });
  }),
);

export default router;
