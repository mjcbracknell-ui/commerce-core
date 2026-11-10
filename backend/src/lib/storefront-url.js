import config from '../config.js';
import { normalizeDomain } from './slug.js';

/** Normalize a host or URL into a bare store domain (no scheme, port or www). */
export const normalizeStoreDomain = (value) => normalizeDomain(value || '');

/** Every store gets a subdomain under the platform domain. */
export function storeDomainForSlug(slug) {
  return `${slug}.${config.platformDomain}`;
}

/** Public storefront URL for a store domain, localhost-aware for development. */
export function storefrontUrl(domain) {
  const value = normalizeStoreDomain(domain);
  if (!value) return config.frontendUrl;
  if (value === 'localhost' || value.endsWith('.localhost')) {
    return `http://${value}:${config.storefrontPort}`;
  }
  return `https://${value}`;
}