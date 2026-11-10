import Stripe from 'stripe';
import config from '../config.js';
import prisma from '../db.js';
import { markOrderPaid } from '../services/orders.js';

/**
 * Stripe webhook handler. Must be mounted with express.raw({ type: 'application/json' })
 * before the global JSON parser.
 */
export async function stripeWebhookHandler(req, res) {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    return res.status(503).json({ error: 'Stripe webhooks are not configured' });
  }

  const signature = req.headers['stripe-signature'];
  const stripe = new Stripe(config.stripeSecretKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
  } catch (error) {
    console.error('[stripe] signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order && order.financialStatus !== 'paid' && session.payment_status === 'paid') {
          await markOrderPaid(order.id, { paymentIntentId: session.payment_intent || session.id });
        }
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order && order.financialStatus !== 'paid') {
          await markOrderPaid(order.id, { paymentIntentId: intent.id });
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('[stripe] handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export default stripeWebhookHandler;
