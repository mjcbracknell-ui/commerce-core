export const moneyValue = (value) => Number(value ?? 0);

export function serializeVariant(variant) {
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    price: moneyValue(variant.price),
    compare_at_price: variant.compareAtPrice == null ? null : moneyValue(variant.compareAtPrice),
    inventory: variant.inventory,
    available: variant.inventory > 0,
    option1: variant.option1,
    option2: variant.option2,
    option3: variant.option3,
    position: variant.position,
    image: variant.image,
  };
}

export function serializeProduct(product, { admin = false } = {}) {
  const variants = (product.variants || []).map(serializeVariant);
  const prices = variants.map((v) => v.price);
  const images = Array.isArray(product.images) ? product.images : [];
  const base = {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description_html: product.descriptionHtml || '',
    vendor: product.vendor,
    product_type: product.productType,
    status: product.status,
    tags: product.tags || [],
    images,
    featured_image: product.featuredImage || images[0]?.src || null,
    price: prices.length ? Math.min(...prices) : 0,
    compare_at_price: variants.find((v) => v.compare_at_price)?.compare_at_price ?? null,
    variants,
    available: variants.some((v) => v.available),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
  if (!admin) return base;
  return {
    ...base,
    store_id: product.storeId,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
    published_at: product.publishedAt,
    metafields: product.metafields,
    collection_ids: (product.collectionProducts || []).map((cp) => cp.collectionId),
  };
}

export function serializeCustomer(customer) {
  return {
    id: customer.id,
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
    phone: customer.phone,
    tags: customer.tags || [],
    total_spent: moneyValue(customer.totalSpent),
    orders_count: customer.ordersCount,
    created_at: customer.createdAt,
  };
}

export function serializeFulfillment(fulfillment) {
  return {
    id: fulfillment.id,
    status: fulfillment.status,
    carrier: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    line_items: fulfillment.lineItems || [],
    created_at: fulfillment.createdAt,
  };
}

export function serializeReturn(returnRecord) {
  return {
    id: returnRecord.id,
    status: returnRecord.status,
    resolution: returnRecord.resolution,
    reason: returnRecord.reason,
    note: returnRecord.note,
    line_items: returnRecord.lineItems || [],
    exchange_items: returnRecord.exchangeItems || [],
    restock: returnRecord.restock,
    refund_amount: moneyValue(returnRecord.refundAmount),
    requested_by: returnRecord.requestedBy,
    received_at: returnRecord.receivedAt,
    refunded_at: returnRecord.refundedAt,
    exchange_fulfilled_at: returnRecord.exchangeFulfilledAt,
    exchange_carrier: returnRecord.exchangeCarrier,
    exchange_tracking_number: returnRecord.exchangeTrackingNumber,
    exchange_tracking_url: returnRecord.exchangeTrackingUrl,
    created_at: returnRecord.createdAt,
  };
}

function returnableItems(order, returns) {
  const shipped = new Map();
  for (const fulfillment of order.fulfillments || []) {
    for (const item of fulfillment.lineItems || []) {
      const variantId = item.variantId || item.variant_id;
      if (!variantId) continue;
      shipped.set(variantId, (shipped.get(variantId) || 0) + Number(item.quantity || 0));
    }
  }

  const returned = new Map();
  for (const returnRecord of returns) {
    if (returnRecord.status === 'rejected') continue;
    for (const item of returnRecord.lineItems || []) {
      const variantId = item.variantId || item.variant_id;
      if (!variantId) continue;
      returned.set(variantId, (returned.get(variantId) || 0) + Number(item.quantity || 0));
    }
  }

  const seen = new Set();
  return (order.lineItems || [])
    .map((item) => {
      const variantId = item.variantId || item.variant_id;
      if (!variantId || seen.has(variantId)) return null;
      seen.add(variantId);
      const quantity = Math.max(0, (shipped.get(variantId) || 0) - (returned.get(variantId) || 0));
      return quantity > 0
        ? {
            variantId,
            title: item.title,
            variantTitle: item.variantTitle,
            sku: item.sku,
            price: moneyValue(item.price),
            quantity,
          }
        : null;
    })
    .filter(Boolean);
}

export function serializeAddress(address) {
  return {
    id: address.id,
    label: address.label,
    first_name: address.firstName,
    last_name: address.lastName,
    name: [address.firstName, address.lastName].filter(Boolean).join(' '),
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
    phone: address.phone,
    is_default: address.isDefault,
    created_at: address.createdAt,
  };
}

export function serializeCustomerAccount(customer) {
  return {
    id: customer.id,
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
    phone: customer.phone,
    email_verified: Boolean(customer.emailVerifiedAt),
    orders_count: customer.ordersCount,
    total_spent: moneyValue(customer.totalSpent),
    created_at: customer.createdAt,
    addresses: (customer.addresses || []).map(serializeAddress),
  };
}

export function serializeOrder(order, { includeCustomer = true } = {}) {
  const fulfillments = (order.fulfillments || []).map(serializeFulfillment);
  const latestFulfillment = fulfillments[fulfillments.length - 1];
  const returns = (order.returns || []).map(serializeReturn);
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    customer_id: order.customerId,
    customer: includeCustomer && order.customer ? serializeCustomer(order.customer) : undefined,
    financial_status: order.financialStatus,
    fulfillment_status: order.fulfillmentStatus,
    currency: order.currency,
    subtotal: moneyValue(order.subtotal),
    discount_total: moneyValue(order.discountTotal),
    shipping_total: moneyValue(order.shippingTotal),
    tax_total: moneyValue(order.taxTotal),
    refunded_total: moneyValue(order.refundedTotal),
    total: moneyValue(order.total),
    line_items: order.lineItems || [],
    shipping_address: order.shippingAddress,
    discount_code: order.discountCode,
    gift_card_code: order.giftCardCode,
    payment_method: order.paymentMethod,
    tracking_number: order.trackingNumber,
    tracking_url: latestFulfillment?.tracking_url || null,
    fulfillments,
    returns,
    returnable_items: returnableItems(order, order.returns || []),
    notes: order.notes,
    paid_at: order.paidAt,
    fulfilled_at: order.fulfilledAt,
    canceled_at: order.canceledAt,
    created_at: order.createdAt,
  };
}
