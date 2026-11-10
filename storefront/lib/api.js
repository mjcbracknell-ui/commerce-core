import { getStoreDomain } from './tenant';

const API_BASE = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');

export { API_BASE };

function tenantHeaders(extra = {}) {
  const domain = getStoreDomain();
  return {
    Accept: 'application/json',
    ...(domain ? { 'x-store-domain': domain } : {}),
    ...extra,
  };
}

export async function apiGet(path, fallback = null) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: tenantHeaders(),
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

export const getStore = () => apiGet('/api/storefront/settings', null);
export const getProducts = (query = '') => apiGet(`/api/storefront/products${query}`, { products: [], count: 0 });
export const getProduct = (handle) => apiGet(`/api/storefront/products/${encodeURIComponent(handle)}`, null);
export const getCollections = () => apiGet('/api/storefront/collections', { collections: [] });
export const getCollection = (handle) => apiGet(`/api/storefront/collections/${encodeURIComponent(handle)}`, null);
export const searchProducts = (query) => apiGet(`/api/storefront/search?q=${encodeURIComponent(query)}`, { results: [] });
export const getOrder = (number, email) =>
  apiGet(`/api/storefront/orders/${encodeURIComponent(number)}?email=${encodeURIComponent(email)}`, null);
