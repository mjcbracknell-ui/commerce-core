import { headers } from 'next/headers';

/** Strip scheme, port, path and www from a host value. */
export const normalizeStoreDomain = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');

/**
 * The store this request belongs to. In production this is the request host
 * (merchant.com or merchant.platform.com); STORE_DOMAIN pins a local preview.
 */
export function getStoreDomain() {
  const configured = process.env.STORE_DOMAIN;
  if (configured) return normalizeStoreDomain(configured);

  const requestHeaders = headers();
  const domain = normalizeStoreDomain(requestHeaders.get('x-store-domain') || requestHeaders.get('host') || '');
  return ['127.0.0.1', '[::1]', '::1'].includes(domain) ? 'localhost' : domain;
}