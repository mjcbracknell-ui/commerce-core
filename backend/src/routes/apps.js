import express from 'express';
import config from '../config.js';
import { asyncHandler } from '../lib/http.js';

const router = express.Router();

const catalog = () => [
  {
    slug: 'stripe',
    name: 'Stripe Payments',
    description: 'Accept cards with Stripe Checkout. Handles webhooks automatically.',
    category: 'payments',
    configured: Boolean(config.stripeSecretKey),
    docs: 'https://stripe.com/docs',
  },
  {
    slug: 'paypal',
    name: 'PayPal',
    description: 'Manual PayPal integration via order notes and manual payment capture.',
    category: 'payments',
    configured: Boolean(process.env.PAYPAL_CLIENT_ID),
    docs: 'https://developer.paypal.com',
  },
  {
    slug: 'meilisearch',
    name: 'Meilisearch',
    description: 'Instant product search with typo tolerance. SQL fallback is always available.',
    category: 'search',
    configured: Boolean(config.meili.host),
    docs: 'https://www.meilisearch.com/docs',
  },
  {
    slug: 'smtp',
    name: 'Transactional Email',
    description: 'Order confirmations, fulfillment and refund notifications over SMTP.',
    category: 'email',
    configured: Boolean(config.smtp.host),
    docs: 'https://nodemailer.com/smtp/',
  },
  {
    slug: 's3',
    name: 'Object Storage',
    description: 'MinIO / S3 bucket for theme and product media assets.',
    category: 'storage',
    configured: Boolean(config.s3.endpoint),
    docs: 'https://min.io/docs',
  },
  {
    slug: 'webhooks',
    name: 'Outgoing Webhooks',
    description: 'HMAC-signed order, product and customer events with delivery logs.',
    category: 'automation',
    configured: true,
    docs: '/docs/01-API-SPEC.md',
  },
];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ apps: catalog() });
  }),
);

export default router;
