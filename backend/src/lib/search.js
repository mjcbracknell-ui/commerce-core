import { MeiliSearch } from 'meilisearch';
import config from '../config.js';

let client;
let indexReady = false;

function getClient() {
  if (!config.meili.host) return null;
  if (!client) client = new MeiliSearch({ host: config.meili.host, apiKey: config.meili.key || undefined });
  return client;
}

function toDocument(product) {
  return {
    id: product.id,
    storeId: product.storeId,
    title: product.title,
    handle: product.handle,
    description: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags || [],
    status: product.status,
    price: Number(product.variants?.[0]?.price || 0),
    image: product.featuredImage || '',
    updatedAt: product.updatedAt ? new Date(product.updatedAt).getTime() : Date.now(),
  };
}

async function ensureIndex() {
  const meili = getClient();
  if (!meili) return null;
  if (!indexReady) {
    try {
      await meili.createIndex(config.meili.index, { primaryKey: 'id' }).catch(() => {});
      const index = meili.index(config.meili.index);
      await index.updateSettings({
        searchableAttributes: ['title', 'description', 'vendor', 'productType', 'tags'],
        filterableAttributes: ['storeId', 'status'],
        sortableAttributes: ['price', 'updatedAt'],
      });
      indexReady = true;
    } catch (error) {
      console.warn('[search] Meilisearch unavailable, falling back to SQL:', error.message);
      return null;
    }
  }
  return meili.index(config.meili.index);
}

export async function indexProducts(products) {
  const index = await ensureIndex();
  if (!index || !products.length) return false;
  try {
    await index.addDocuments(products.map(toDocument));
    return true;
  } catch (error) {
    console.warn('[search] index failed:', error.message);
    return false;
  }
}

export async function removeProduct(productId) {
  const index = await ensureIndex();
  if (!index) return false;
  try {
    await index.deleteDocument(productId);
    return true;
  } catch {
    return false;
  }
}

/** Returns matching product ids, or null when Meilisearch is not usable. */
export async function searchProductIds({ storeId, query, limit = 50 }) {
  const index = await ensureIndex();
  if (!index) return null;
  try {
    const result = await index.search(query, {
      limit,
      filter: `storeId = "${storeId}" AND status = "active"`,
    });
    return result.hits.map((hit) => hit.id);
  } catch (error) {
    console.warn('[search] query failed, falling back to SQL:', error.message);
    return null;
  }
}
