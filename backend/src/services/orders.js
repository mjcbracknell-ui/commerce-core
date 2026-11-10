import prisma from '../db.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { computeTotals, discountIsActive, round2, storeSettings } from '../lib/pricing.js';
import { dispatchEventLater } from '../lib/webhooks.js';
import { sendOrderConfirmation } from '../lib/mailer.js';
import { serializeOrder } from '../lib/serializers.js';

/**
 * Resolve cart lines against live product data and price the cart server-side.
 * Accepts [{ variantId, quantity }] (or [{ id, quantity }]).
 */
export async function resolveCart(store, { items = [], discountCode, giftCardCode } = {}) {
  const quantities = new Map();
  for (const item of items) {
    const variantId = item.variantId || item.id;
    const quantity = Number.parseInt(item.quantity, 10);
    if (!variantId || !Number.isFinite(quantity) || quantity <= 0) {
      throw badRequest('Each cart item needs a variantId and a positive quantity');
    }
    quantities.set(variantId, (quantities.get(variantId) || 0) + quantity);
  }
  if (!quantities.size) throw badRequest('Cart is empty');
  if (quantities.size > 100) throw badRequest('Too many distinct items in cart');

  const variants = await prisma.variant.findMany({
    where: {
      id: { in: [...quantities.keys()] },
      product: { storeId: store.id, status: 'active' },
    },
    include: { product: true },
  });
  if (variants.length !== quantities.size) throw badRequest('Some cart items are no longer available');

  const lines = variants.map((variant) => {
    const quantity = quantities.get(variant.id);
    if (variant.inventory < quantity) {
      throw conflict(`${variant.product.title} only has ${Math.max(variant.inventory, 0)} left in stock`);
    }
    return {
      variantId: variant.id,
      productId: variant.productId,
      title: variant.product.title,
      variantTitle: variant.title,
      handle: variant.product.handle,
      sku: variant.sku,
      image: variant.image || variant.product.featuredImage,
      price: round2(Number(variant.price)),
      quantity,
      lineTotal: round2(Number(variant.price) * quantity),
    };
  });

  lines.sort((a, b) => a.title.localeCompare(b.title));
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));

  let discount = null;
  if (discountCode) {
    const code = String(discountCode).trim().toUpperCase();
    discount = await prisma.discount.findUnique({ where: { storeId_code: { storeId: store.id, code } } });
    if (!discount || !discountIsActive(discount)) throw badRequest('Discount code is invalid or expired');
    if (discount.minSubtotal != null && subtotal < Number(discount.minSubtotal)) {
      throw badRequest(`Discount requires a subtotal of at least ${Number(discount.minSubtotal).toFixed(2)}`);
    }
  }

  let giftCard = null;
  if (giftCardCode) {
    const code = String(giftCardCode).trim().toUpperCase();
    giftCard = await prisma.giftCard.findUnique({ where: { storeId_code: { storeId: store.id, code } } });
    if (!giftCard || !giftCard.active || Number(giftCard.balance) <= 0) {
      throw badRequest('Gift card is invalid or has no balance');
    }
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) throw badRequest('Gift card has expired');
  }

  const totals = computeTotals({
    lines,
    discount,
    giftCard,
    settings: storeSettings(store),
  });

  return { lines, discount, giftCard, totals };
}

async function nextOrderNumber(tx, storeId) {
  const count = await tx.order.count({ where: { storeId } });
  return String(1001 + count);
}

/**
 * Create an order: re-price, decrement stock, apply discount/gift card, notify.
 */
export async function placeOrder({
  store,
  items,
  email,
  shippingAddress = null,
  billingAddress = null,
  discountCode = null,
  giftCardCode = null,
  paymentMethod = 'manual',
  notes = null,
  financialStatus = 'pending',
}) {
  const emailNormalized = String(email || '').trim().toLowerCase();
  if (!emailNormalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNormalized)) {
    throw badRequest('A valid email is required');
  }

  const cart = await resolveCart(store, { items, discountCode, giftCardCode });
  const settings = storeSettings(store);
  if (financialStatus === 'auto') {
    financialStatus = cart.totals.total === 0 ? 'paid' : 'pending';
  }

  let order;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      order = await prisma.$transaction(async (tx) => {
        for (const line of cart.lines) {
          const updated = await tx.variant.updateMany({
            where: { id: line.variantId, inventory: { gte: line.quantity } },
            data: { inventory: { decrement: line.quantity } },
          });
          if (updated.count === 0) throw conflict(`${line.title} is out of stock`);
        }

        const firstName = shippingAddress?.first_name || shippingAddress?.firstName || null;
        const lastName = shippingAddress?.last_name || shippingAddress?.lastName || null;
        const customer = await tx.customer.upsert({
          where: { storeId_email: { storeId: store.id, email: emailNormalized } },
          update: {
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(shippingAddress?.phone ? { phone: shippingAddress.phone } : {}),
          },
          create: {
            storeId: store.id,
            email: emailNormalized,
            firstName,
            lastName,
            phone: shippingAddress?.phone || null,
          },
        });

        const number = await nextOrderNumber(tx, store.id);
        const created = await tx.order.create({
          data: {
            storeId: store.id,
            number,
            customerId: customer.id,
            email: emailNormalized,
            currency: store.currency || settings.currency,
            financialStatus,
            subtotal: cart.totals.subtotal,
            discountTotal: cart.totals.discountTotal,
            shippingTotal: cart.totals.shippingTotal,
            taxTotal: cart.totals.taxTotal,
            total: cart.totals.total,
            lineItems: cart.lines,
            shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            discountCode: cart.discount?.code || null,
            giftCardCode: cart.giftCard?.code || null,
            paymentMethod,
            notes,
            paidAt: financialStatus === 'paid' ? new Date() : null,
          },
          include: { customer: true },
        });

        if (cart.discount) {
          await tx.discount.update({
            where: { id: cart.discount.id },
            data: { usageCount: { increment: 1 } },
          });
        }
        if (cart.giftCard && cart.totals.giftCardApplied > 0) {
          const debited = await tx.giftCard.updateMany({
            where: { id: cart.giftCard.id, balance: { gte: cart.totals.giftCardApplied } },
            data: { balance: { decrement: cart.totals.giftCardApplied } },
          });
          if (debited.count === 0) throw badRequest('Gift card balance changed, try again');
        }

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ordersCount: { increment: 1 },
            totalSpent: { increment: created.total },
          },
        });

        return created;
      });
      break;
    } catch (error) {
      const numberTaken = error?.code === 'P2002' && String(error.meta?.target || '').includes('number');
      if (!numberTaken || attempt === 4) throw error;
    }
  }

  dispatchEventLater(store.id, 'orders/create', serializeOrder(order));
  if (order.financialStatus === 'paid') dispatchEventLater(store.id, 'orders/paid', serializeOrder(order));
  sendOrderConfirmation(order, store).catch((error) => console.error('[mail]', error.message));

  return { order, cart };
}

export async function markOrderPaid(orderId, { paymentIntentId } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
  if (!order) throw notFound('Order not found');
  if (order.financialStatus === 'paid') return order;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      financialStatus: 'paid',
      paidAt: new Date(),
      ...(paymentIntentId ? { paymentIntentId } : {}),
    },
    include: { store: true },
  });
  dispatchEventLater(updated.storeId, 'orders/paid', serializeOrder(updated));
  sendOrderConfirmation(updated, updated.store).catch(() => {});
  return updated;
}
