import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, signLicense, verifyLicense } from '../src/lib/license.js';

const { publicKey, privateKey } = generateKeyPair(2048);
const payload = { id: 'lic_1', domain: 'example.com', tier: 'agency', issued_at: new Date().toISOString() };

test('signs and verifies a license for the matching domain', () => {
  const key = signLicense(payload, privateKey);
  assert.equal(key.split('.').length, 2);
  const result = verifyLicense(key, publicKey, 'example.com');
  assert.equal(result.valid, true);
  assert.equal(result.payload.tier, 'agency');
  assert.equal(result.payload.perpetual, true);
});

test('accepts www and rejects other domains', () => {
  const key = signLicense(payload, privateKey);
  assert.equal(verifyLicense(key, publicKey, 'www.example.com').valid, true);
  const result = verifyLicense(key, publicKey, 'evil.com');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'domain_mismatch');
});

test('supports wildcard domains', () => {
  const key = signLicense({ ...payload, domain: '*.example.com' }, privateKey);
  assert.equal(verifyLicense(key, publicKey, 'shop.example.com').valid, true);
  assert.equal(verifyLicense(key, publicKey, 'example.org').valid, false);
});

test('rejects tampered payloads and wrong keys', () => {
  const key = signLicense(payload, privateKey);
  const [body, signature] = key.split('.');
  const tamperedBody = Buffer.from(
    JSON.stringify({ ...payload, tier: 'unlimited', domain: 'evil.com' }),
  ).toString('base64url');
  assert.equal(verifyLicense(`${tamperedBody}.${signature}`, publicKey, 'evil.com').valid, false);

  const other = generateKeyPair(2048);
  assert.equal(verifyLicense(key, other.publicKey, 'example.com').valid, false);
});

test('rejects expired licenses', () => {
  const key = signLicense({ ...payload, expires_at: '2020-01-01T00:00:00Z' }, privateKey);
  const result = verifyLicense(key, publicKey, 'example.com');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'expired');
});

test('rejects malformed keys and missing public key', () => {
  assert.equal(verifyLicense('not-a-key', publicKey, 'example.com').reason, 'malformed_key');
  const key = signLicense(payload, privateKey);
  assert.equal(verifyLicense(key, '', 'example.com').reason, 'public_key_missing');
});
