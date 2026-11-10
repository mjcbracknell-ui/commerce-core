import express from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { asyncHandler, notFound, parseIntParam } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { serializeCustomer, serializeOrder } from '../lib/serializers.js';
import { dispatchEventLater } from '../lib/webhooks.js';

const router = express.Router();

const customerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string()).max(100).default([]),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseIntParam(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parseIntParam(req.query.limit, 50, { min: 1, max: 250 });
    const search = String(req.query.search || '').trim();

    const where = {
      storeId: req.storeId,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [customers, count] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return res.json({
      customers: customers.map(serializeCustomer),
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
  validateBody(customerSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const customer = await prisma.customer.create({
      data: {
        storeId: req.storeId,
        email: data.email.toLowerCase().trim(),
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        phone: data.phone ?? null,
        note: data.note ?? null,
        tags: data.tags,
      },
    });
    dispatchEventLater(req.storeId, 'customers/create', serializeCustomer(customer));
    return res.status(201).json({ customer: serializeCustomer(customer) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { orders: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
    if (!customer) throw notFound('Customer not found');
    return res.json({
      customer: serializeCustomer(customer),
      orders: customer.orders.map((order) => serializeOrder(order, { includeCustomer: false })),
    });
  }),
);

router.put(
  '/:id',
  requireRole('owner', 'admin'),
  validateBody(customerSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Customer not found');
    const data = req.body;
    const customer = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
      },
    });
    dispatchEventLater(req.storeId, 'customers/update', serializeCustomer(customer));
    return res.json({ customer: serializeCustomer(customer) });
  }),
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) throw notFound('Customer not found');
    await prisma.customer.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  }),
);

export default router;
