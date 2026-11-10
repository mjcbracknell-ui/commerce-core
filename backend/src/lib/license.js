import crypto from 'node:crypto';
import { domainMatches, normalizeDomain } from './slug.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Sign a perpetual license payload with an RSA private key (SHA-256 / RS256).
 * Payload shape: { v, id, domain, tier, issued_at, updates_until }
 */
export function signLicense(payload, privateKeyPem) {
  if (!privateKeyPem) throw new Error('LICENSE_PRIVATE_KEY is not configured');
  const body = b64url(JSON.stringify({ v: 1, ...payload }));
  const signature = crypto.sign('sha256', Buffer.from(body), privateKeyPem).toString('base64url');
  return `${body}.${signature}`;
}

/**
 * Verify a license key against the public key and the requesting domain.
 * Returns { valid, reason?, payload? }. Revocation is checked by the caller (database).
 */
export function verifyLicense(licenseKey, publicKeyPem, requestDomain) {
  if (!licenseKey || typeof licenseKey !== 'string') return { valid: false, reason: 'missing_key' };
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed_key' };
  const [body, signature] = parts;

  if (!publicKeyPem) return { valid: false, reason: 'public_key_missing' };

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      'sha256',
      Buffer.from(body),
      publicKeyPem,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return { valid: false, reason: 'invalid_signature' };
  }
  if (!signatureOk) return { valid: false, reason: 'invalid_signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (!payload.domain) return { valid: false, reason: 'invalid_payload' };
  if (requestDomain && !domainMatches(payload.domain, requestDomain)) {
    return { valid: false, reason: 'domain_mismatch', payload };
  }

  const now = Date.now();
  if (payload.expires_at && new Date(payload.expires_at).getTime() < now) {
    return { valid: false, reason: 'expired', payload };
  }

  return {
    valid: true,
    payload: {
      ...payload,
      domain: normalizeDomain(payload.domain),
      perpetual: !payload.expires_at,
      updatesUntil: payload.updates_until || null,
    },
  };
}

export function generateKeyPair(bits = 2048) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}
