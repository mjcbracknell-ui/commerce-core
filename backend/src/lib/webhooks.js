import crypto from 'node:crypto';
import config from '../config.js';
import prisma from '../db.js';

export const WEBHOOK_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/fulfilled',
  'orders/refunded',
  'orders/cancelled',
  'products/create',
  'products/update',
  'products/delete',
  'customers/create',
  'customers/update',
  'carts/update',
  '*',
];

export function signPayload(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

async function deliver(webhook, topic, payload) {
  const body = JSON.stringify({ topic, payload, sent_at: new Date().toISOString() });
  const headers = {
    'Content-Type': 'application/json',
    'X-CommerceCore-Topic': topic,
    'X-CommerceCore-Hmac-SHA256': signPayload(webhook.secret, body),
    'X-CommerceCore-Delivery': crypto.randomUUID(),
  };

  let lastError = null;
  let status = null;
  let durationMs = 0;
  const attempts = config.webhookRetries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.webhookTimeoutMs);
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      durationMs = Date.now() - started;
      status = response.status;
      if (response.ok) break;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      durationMs = Date.now() - started;
      lastError = error.name === 'AbortError' ? 'timeout' : error.message;
      status = null;
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
  }

  try {
    await prisma.webhook.update({
      where: { id: webhook.id },
      data: { lastStatus: status, lastDeliveredAt: new Date() },
    });
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        topic,
        payload,
        status,
        durationMs,
        error: lastError,
        attempts,
      },
    });
  } catch (error) {
    console.error('[webhook] could not record delivery:', error.message);
  }

  return { webhookId: webhook.id, status, error: lastError };
}

/** Fire-and-forget outgoing webhook dispatch. */
export async function dispatchEvent(storeId, topic, payload) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { storeId, active: true, OR: [{ topic }, { topic: '*' }] },
    });
    if (!webhooks.length) return [];
    return await Promise.all(webhooks.map((hook) => deliver(hook, topic, payload)));
  } catch (error) {
    console.error('[webhook] dispatch failed:', error.message);
    return [];
  }
}

export function dispatchEventLater(storeId, topic, payload) {
  setImmediate(() => {
    dispatchEvent(storeId, topic, payload).catch((error) =>
      console.error('[webhook] async dispatch failed:', error.message),
    );
  });
}

export async function sendTestDelivery(webhook) {
  return deliver(webhook, 'webhooks/test', { message: 'Commerce Core test webhook', webhookId: webhook.id });
}
