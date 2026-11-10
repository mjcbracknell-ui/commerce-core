import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Root .env (docker-compose / local dev) then backend/.env which wins.
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config({ path: path.resolve(here, '../.env'), override: true });

const bool = (v, def = false) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const num = (v, def) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? def : Number(v));

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://cc:cc@localhost:5432/commercecore',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenDays: num(process.env.REFRESH_TOKEN_DAYS, 7),
  corsOrigins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  secureCookies: bool(process.env.SECURE_COOKIES, isProd),

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 1025),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'CommerceCore <no-reply@commercecore.local>',
  },

  meili: {
    host: process.env.MEILI_HOST || '',
    key: process.env.MEILI_KEY || '',
    index: process.env.MEILI_INDEX || 'products',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    bucket: process.env.S3_BUCKET || 'commercecore',
    access: process.env.S3_ACCESS || '',
    secret: process.env.S3_SECRET || '',
  },

  license: {
    privateKey: (process.env.LICENSE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    publicKey: (process.env.LICENSE_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    adminToken: process.env.LICENSE_ADMIN_TOKEN || '',
    allowDemo: bool(process.env.ALLOW_DEMO_LICENSE, !isProd),
    demoKey: process.env.DEMO_LICENSE_KEY || 'DEMO-PERPETUAL-1234',
  },

  uploads: {
    maxBytes: num(process.env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
  },

  webhookTimeoutMs: num(process.env.WEBHOOK_TIMEOUT_MS, 5000),
  webhookRetries: num(process.env.WEBHOOK_RETRIES, 2),
  runMigrations: bool(process.env.RUN_MIGRATIONS, false),
};

export default config;
