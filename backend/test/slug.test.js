import test from 'node:test';
import assert from 'node:assert/strict';
import { domainMatches, normalizeDomain, slugify, uniqueHandle } from '../src/lib/slug.js';

test('slugify produces Shopify-style handles', () => {
  assert.equal(slugify('Classic T-Shirt (Blue)'), 'classic-t-shirt-blue');
  assert.equal(slugify('  Crème Brûlée  '), 'creme-brulee');
  assert.equal(slugify(''), 'item');
});

test('uniqueHandle appends a counter', () => {
  assert.equal(uniqueHandle('tee', []), 'tee');
  assert.equal(uniqueHandle('tee', ['tee']), 'tee-2');
  assert.equal(uniqueHandle('tee', ['tee', 'tee-2']), 'tee-3');
});

test('normalizes domains and matches wildcards', () => {
  assert.equal(normalizeDomain('https://www.Example.com:3000/path'), 'example.com');
  assert.equal(domainMatches('example.com', 'www.example.com'), true);
  assert.equal(domainMatches('*.example.com', 'shop.example.com'), true);
  assert.equal(domainMatches('*.example.com', 'example.org'), false);
  assert.equal(domainMatches('example.com', 'example.com'), true);
});
