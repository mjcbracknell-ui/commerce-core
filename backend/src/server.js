import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import prisma from './db.js';
import { asyncHandler } from './lib/http.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import { authenticate, attachStore } from './middleware/auth.js';
import { loadBundledTheme, renderTheme } from './lib/theme.js';
import { serializeProduct } from './lib/serializers.js';
import { storeSettings } from './lib/pricing.js';
import { stripeWebhookHandler } from './routes/stripe-webhook.js';
import { normalizeStoreDomain } from './lib/storefront-url.js';
import { scheduleProcessedStripeEventCleanup } from './services/stripe-events.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import collectionRoutes from './routes/collections.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import discountRoutes from './routes/discounts.js';
import giftCardRoutes from './routes/gift-cards.js';
import themeRoutes from './routes/themes.js';
import adminWebhookRoutes from './routes/webhooks.js';
import apiKeyRoutes from './routes/api-keys.js';
import appRoutes from './routes/apps.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';
import storefrontRoutes from './routes/storefront.js';
import customerAccountRoutes from './routes/customer-account.js';
import licenseRoutes from './routes/license.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = new Set(config.corsOrigins);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      if (!config.isProd && /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: false, // themes and email templates rely on inline styles
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cookieParser());

// Stripe needs the untouched raw body, so it is mounted before the JSON parser.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts, slow down' },
});
app.use(globalLimiter);

if (!config.isProd) {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
    });
    next();
  });
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    product: 'Commerce Core',
    version: '1.0.0',
    license: 'perpetual',
    uptime: Math.round(process.uptime()),
  });
});

app.use('/api/auth', authLimiter, authRoutes);

const admin = express.Router();
admin.use(authenticate, attachStore);
admin.use('/products', productRoutes);
admin.use('/collections', collectionRoutes);
admin.use('/orders', orderRoutes);
admin.use('/customers', customerRoutes);
admin.use('/discounts', discountRoutes);
admin.use('/gift-cards', giftCardRoutes);
admin.use('/themes', themeRoutes);
admin.use('/webhooks', adminWebhookRoutes);
admin.use('/api-keys', apiKeyRoutes);
admin.use('/apps', appRoutes);
admin.use('/analytics', analyticsRoutes);
admin.use('/settings', settingsRoutes);
app.use('/api/admin', admin);

app.use('/api/storefront/account', customerAccountRoutes);
app.use('/api/storefront', checkoutLimiter, storefrontRoutes);
app.use('/api/license', licenseRoutes);

/** Render the active Liquid theme (the backend can serve the store directly). */
async function renderStorefront(req, res) {
  const requestedDomain = normalizeStoreDomain(req.headers['x-store-domain'] || req.hostname || '');
  const store = requestedDomain
    ? await prisma.store.findFirst({ where: { domain: { equals: requestedDomain, mode: 'insensitive' } } })
    : await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!store) {
    return res
      .status(404)
      .type('html')
      .send('<!doctype html><h1>Store not found</h1><p>No storefront is configured for this domain.</p>');
  }

  const theme = await prisma.theme.findFirst({ where: { storeId: store.id, isActive: true } });
  const files = theme?.files && Object.keys(theme.files).length ? theme.files : loadBundledTheme('dawn-clone')?.files;
  const products = await prisma.product.findMany({
    where: { storeId: store.id, status: 'active' },
    include: { variants: { orderBy: { position: 'asc' } } },
    take: 12,
    orderBy: { createdAt: 'desc' },
  });
  const collections = await prisma.collection.findMany({ where: { storeId: store.id }, take: 8 });

  const html = await renderTheme({
    files,
    template: 'index',
    data: {
      shop: { name: store.name, domain: store.domain, currency: store.currency, settings: storeSettings(store) },
      products: products.map((product) => serializeProduct(product)),
      collections: collections.map((collection) => ({ title: collection.title, handle: collection.handle })),
      cart: { item_count: 0 },
    },
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.type('html').send(html);
}

app.get('/', asyncHandler(renderStorefront));
app.get('/theme', asyncHandler(renderStorefront));

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Commerce Core backend listening on :${config.port} (${config.env})`);
  console.log(
    `License: ${config.license.publicKey ? 'RSA verification enabled' : config.license.allowDemo ? 'demo key only' : 'not configured'}`,
  );
});
const retentionTimer = scheduleProcessedStripeEventCleanup();

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down`);
  clearInterval(retentionTimer);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
