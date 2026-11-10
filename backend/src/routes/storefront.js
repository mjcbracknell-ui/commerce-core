import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { asyncHandler, badRequest, notFound, parseIntParam } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { resolvePublicStore } from '../middleware/auth.js';
import { serializeProduct, serializeOrder } from '../lib/serializers.js';
import { storeSettings, discountIsActive } from '../lib/pricing.js';
import { searchProductIds } from '../lib/search.js';
import { placeOrder, resolveCart } from '../services/orders.js';

const router = express.Router();
router.use(resolvePublicStore);

const productInclude = {
  variants: { orderBy: { position: 'asc' } },
  collectionProducts: { include: { collection: true } },
};

const pagination = (query) => ({
  page: parseIntParam(query.page, 1, { min: 1, max: 10000 }),
  limit: parseIntParam(query.limit, 24, { min: 1, max: 100 }),
});

const publicSettings = (store) => {
  const settings = storeSettings(store);
  return {
    tax_rate: Number(settings.taxRate) || 0,
    shipping_flat_rate: Number(settings.shippingFlatRate) || 0,
    free_shipping_threshold:
      settings.freeShippingThreshold == null ? null : Number(settings.freeShippingThreshold),
    support_email: settings.supportEmail || '',
  };
};

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({
      store: {
        name: req.store.name,
        domain: req.store.domain,
        currency: req.store.currency,
      },
      settings: publicSettings(req.store),
      payments: {
        stripe: Boolean(config.stripeSecretKey),
        manual: true,
        cod: true,
      },
    });
  }),
);

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { page, limit } = pagination(req.query);
    const search = String(req.query.search || req.query.q || '').trim();
    const collectionHandle = String(req.query.collection || '').trim();
    const sort = String(req.query.sort || 'featured');

    const where = {
      storeId: req.storeId,
      status: 'active',
      ...(req.query.handle ? { handle: String(req.query.handle) } : {}),
      ...(collectionHandle ? { collectionProducts: { some: { collection: { handle: collectionHandle } } } } : {}),
    };

    if (search) {
      const ids = await searchProductIds({ storeId: req.storeId, query: search, limit: 100 });
      if (ids) {
        where.id = { in: ids };
      } else {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { vendor: { contains: search, mode: 'insensitive' } },
          { productType: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } },
        ];
      }
    }

    const orderBy =
      sort === 'newest'
        ? { createdAt: 'desc' }
        : sort === 'title'
          ? { title: 'asc' }
          : { createdAt: 'desc' };

    if (sort === 'price_asc' || sort === 'price_desc') {
      const all = await prisma.product.findMany({ where, include: productInclude, take: 250 });
      const serialized = all.map((product) => serializeProduct(product));
      serialized.sort((a, b) => (sort === 'price_asc' ? a.price - b.price : b.price - a.price));
      return res.json({
        products: serialized.slice((page - 1) * limit, page * limit),
        count: serialized.length,
        page,
        limit,
        sort,
      });
    }

    const [products, count] = await Promise.all([
      prisma.product.findMany({ where, include: productInclude, orderBy, skip: (page - 1) * limit, take: limit }),
      prisma.product.count({ where }),
    ]);

    return res.json({
      products: products.map((product) => serializeProduct(product)),
      count,
      page,
      limit,
      pages: Math.ceil(count / limit) || 1,
      sort,
    });
  }),
);

router.get(
  '/products/:handle',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { storeId: req.storeId, handle: req.params.handle, status: 'active' },
      include: productInclude,
    });
    if (!product) throw notFound('Product not found');

    const collectionIds = product.collectionProducts.map((cp) => cp.collectionId);
    const related = collectionIds.length
      ? await prisma.product.findMany({
          where: {
            storeId: req.storeId,
            status: 'active',
            id: { not: product.id },
            collectionProducts: { some: { collectionId: { in: collectionIds } } },
          },
          include: productInclude,
          take: 4,
        })
      : [];

    return res.json({
      product: serializeProduct(product),
      collections: product.collectionProducts.map((cp) => ({ title: cp.collection.title, handle: cp.collection.handle })),
      related: related.map((item) => serializeProduct(item)),
    });
  }),
);

router.get(
  '/collections',
  asyncHandler(async (req, res) => {
    const collections = await prisma.collection.findMany({
      where: { storeId: req.storeId },
      include: { _count: { select: { products: true } } },
      orderBy: { title: 'asc' },
    });
    return res.json({
      collections: collections.map((collection) => ({
        title: collection.title,
        handle: collection.handle,
        description_html: collection.descriptionHtml || '',
        image: collection.image,
        products_count: collection._count.products,
      })),
    });
  }),
);

router.get(
  '/collections/:handle',
  asyncHandler(async (req, res) => {
    const collection = await prisma.collection.findFirst({
      where: { storeId: req.storeId, handle: req.params.handle },
      include: {
        products: {
          include: { product: { include: productInclude } },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!collection) throw notFound('Collection not found');
    return res.json({
      collection: {
        title: collection.title,
        handle: collection.handle,
        description_html: collection.descriptionHtml || '',
        image: collection.image,
      },
      products: collection.products
        .map((cp) => cp.product)
        .filter((product) => product.status === 'active')
        .map((product) => serializeProduct(product)),
    });
  }),
);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = parseIntParam(req.query.limit, 24, { min: 1, max: 100 });
    if (!query) return res.json({ results: [], query, count: 0 });

    const ids = await searchProductIds({ storeId: req.storeId, query, limit });
    let products = [];
    if (ids) {
      products = await prisma.product.findMany({
        where: { storeId: req.storeId, id: { in: ids } },
        include: productInclude,
      });
      const order = new Map(ids.map((id, index) => [id, index]));
      products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    } else {
      products = await prisma.product.findMany({
        where: {
          storeId: req.storeId,
          status: 'active',
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { descriptionHtml: { contains: query, mode: 'insensitive' } },
            { vendor: { contains: query, mode: 'insensitive' } },
            { productType: { contains: query, mode: 'insensitive' } },
            { tags: { has: query } },
          ],
        },
        include: productInclude,
        take: limit,
      });
    }

    return res.json({
      results: products.map((product) => serializeProduct(product)),
      query,
      count: products.length,
      engine: ids ? 'meilisearch' : 'sql',
    });
  }),
);

const cartSchema = z.object({
  items: z.array(z.object({ variantId: z.string(), quantity: z.coerce.number().int().positive() })).default([]),
  discountCode: z.string().nullable().optional(),
  giftCardCode: z.string().nullable().optional(),
});

router.post(
  '/cart',
  validateBody(cartSchema),
  asyncHandler(async (req, res) => {
    const cart = await resolveCartSafe(req.store, req.body);
    return res.json({ cart: serializeCart(cart, req.store) });
  }),
);

async function resolveCartSafe(store, body) {
  const cart = await resolveCart(store, {
    items: body.items,
    discountCode: body.discountCode,
    giftCardCode: body.giftCardCode,
  });
  return cart;
}

function serializeCart(cart, store) {
  return {
    items: cart.lines,
    item_count: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: cart.totals.subtotal,
    discount_total: cart.totals.discountTotal,
    shipping_total: cart.totals.shippingTotal,
    tax_total: cart.totals.taxTotal,
    gift_card_applied: cart.totals.giftCardApplied,
    total: cart.totals.total,
    free_shipping: cart.totals.freeShipping,
    currency: store.currency,
    discount_code: cart.discount?.code || null,
    gift_card_code: cart.giftCard?.code || null,
  };
}

router.post(
  '/discounts/validate',
  validateBody(
    z.object({
      code: z.string().min(1),
      items: z.array(z.object({ variantId: z.string(), quantity: z.coerce.number().int().positive() })).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const code = req.body.code.trim().toUpperCase();
    const discount = await prisma.discount.findUnique({
      where: { storeId_code: { storeId: req.storeId, code } },
    });
    if (!discount || !discountIsActive(discount)) {
      return res.status(404).json({ valid: false, error: 'Discount code is invalid or expired' });
    }
    if (req.body.items?.length) {
      const cart = await resolveCartSafe(req.store, { items: req.body.items, discountCode: code });
      return res.json({ valid: true, discount: { code: discount.code, type: discount.type, value: Number(discount.value) }, cart: serializeCart(cart, req.store) });
    }
    return res.json({
      valid: true,
      discount: {
        code: discount.code,
        type: discount.type,
        value: Number(discount.value),
        min_subtotal: discount.minSubtotal == null ? null : Number(discount.minSubtotal),
      },
    });
  }),
);

router.post(
  '/gift-cards/validate',
  validateBody(z.object({ code: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const code = req.body.code.trim().toUpperCase();
    const card = await prisma.giftCard.findUnique({ where: { storeId_code: { storeId: req.storeId, code } } });
    if (!card || !card.active || Number(card.balance) <= 0 || (card.expiresAt && card.expiresAt < new Date())) {
      return res.status(404).json({ valid: false, error: 'Gift card is invalid or has no balance' });
    }
    return res.json({ valid: true, gift_card: { code: card.code, balance: Number(card.balance), currency: card.currency } });
  }),
);

const checkoutSchema = z.object({
  email: z.string().email(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.coerce.number().int().positive() })).min(1),
  shippingAddress: z.record(z.any()).optional(),
  discountCode: z.string().nullable().optional(),
  giftCardCode: z.string().nullable().optional(),
  paymentMethod: z.enum(['manual', 'cod', 'card', 'stripe']).default('manual'),
  notes: z.string().max(2000).optional(),
});

router.post(
  '/checkout',
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const wantsStripe = req.body.paymentMethod === 'card' || req.body.paymentMethod === 'stripe';
    if (wantsStripe && !config.stripeSecretKey) {
      throw badRequest('Card payments are not configured for this store. Choose pay on delivery.');
    }

    const { order, cart } = await placeOrder({
      store: req.store,
      items: req.body.items,
      email: req.body.email,
      shippingAddress: req.body.shippingAddress || null,
      discountCode: req.body.discountCode || null,
      giftCardCode: req.body.giftCardCode || null,
      paymentMethod: wantsStripe ? 'stripe' : req.body.paymentMethod,
      notes: req.body.notes || null,
      financialStatus: 'auto',
    });

    let payment = { provider: wantsStripe ? 'stripe' : req.body.paymentMethod, status: order.financialStatus };

    if (wantsStripe && order.financialStatus !== 'paid') {
      const stripe = new Stripe(config.stripeSecretKey);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: order.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(order.currency).toLowerCase(),
              unit_amount: Math.round(Number(order.total) * 100),
              product_data: {
                name: `Order ${order.number}`,
                description: `${cart.lines.length} item(s) from ${req.store.name}`,
              },
            },
          },
        ],
        metadata: { orderId: order.id, storeId: req.storeId, orderNumber: order.number },
        success_url: `${config.frontendUrl}/orders/${order.number}?email=${encodeURIComponent(order.email || '')}&paid=1`,
        cancel_url: `${config.frontendUrl}/checkout?canceled=1`,
      });
      await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: session.id } });
      payment = { provider: 'stripe', status: 'requires_payment', url: session.url, session_id: session.id };
    }

    return res.status(201).json({ order: serializeOrder(order), payment });
  }),
);

router.get(
  '/orders/:number',
  asyncHandler(async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) throw badRequest('Email is required to look up an order');
    const order = await prisma.order.findFirst({
      where: { storeId: req.storeId, number: req.params.number, email },
      include: {
        customer: true,
        fulfillments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw notFound('Order not found');
    return res.json({ order: serializeOrder(order) });
  }),
);

export default router;
