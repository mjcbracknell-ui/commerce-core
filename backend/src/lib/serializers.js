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

export function serializeOrder(order, { includeCustomer = true } = {}) {
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
    total: moneyValue(order.total),
    line_items: order.lineItems || [],
    shipping_address: order.shippingAddress,
    discount_code: order.discountCode,
    gift_card_code: order.giftCardCode,
    payment_method: order.paymentMethod,
    tracking_number: order.trackingNumber,
    notes: order.notes,
    paid_at: order.paidAt,
    fulfilled_at: order.fulfilledAt,
    canceled_at: order.canceledAt,
    created_at: order.createdAt,
  };
}
