import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { signLicense } from '../backend/src/lib/license.js';
import { normalizeDomain } from '../backend/src/lib/slug.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const [rawKey, inline] = argv[i].slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) {
      args[rawKey] = inline;
    } else if (next && !next.startsWith('--')) {
      args[rawKey] = next;
      i += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const domain = normalizeDomain(args.domain || process.argv[2] || '');
const tier = args.tier || 'agency';
const updatesDays = Number(args.updates || args.updatesDays || 0);
const api = args.api;
const adminToken = args.token || process.env.LICENSE_ADMIN_TOKEN || '';

if (!domain) {
  console.error(`Usage: node scripts/generate-license.js --domain example.com [--tier agency] [--updates 365] [--api http://localhost:4000]`);
  process.exit(1);
}

let privateKey = process.env.LICENSE_PRIVATE_KEY || '';
if (!privateKey) {
  const keyPath = path.resolve(process.cwd(), args.key || 'keys/license-private.pem');
  if (fs.existsSync(keyPath)) privateKey = fs.readFileSync(keyPath, 'utf8');
}

if (!privateKey) {
  console.error('No private key found. Run "npm run keys" first, or set LICENSE_PRIVATE_KEY.');
  process.exit(1);
}

const payload = {
  id: `lic_${crypto.randomBytes(6).toString('hex')}`,
  domain,
  tier,
  issued_at: new Date().toISOString(),
  ...(updatesDays ? { updates_until: new Date(Date.now() + updatesDays * 86400000).toISOString() } : {}),
};

const licenseKey = signLicense(payload, privateKey);
const output = { license_key: licenseKey, payload };

if (api) {
  try {
    const response = await fetch(`${api.replace(/\/$/, '')}/api/license/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'X-License-Admin-Token': adminToken } : {}) },
      body: JSON.stringify({ domain, tier, ...(updatesDays ? { updatesDays } : {}) }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      console.log('Registered with the license server.');
      console.log('LICENSE_KEY:', data.license_key);
      process.exit(0);
    }
    console.warn(`License server rejected registration (${response.status}): ${data?.error || 'unknown error'}. Showing a locally signed key.`);
  } catch (error) {
    console.warn(`Could not reach ${api}: ${error.message}. Showing a locally signed key.`);
  }
}

console.log('CommerceCore license');
console.log('  Domain :', payload.domain);
console.log('  Tier   :', payload.tier);
console.log('  Perpetual:', true);
if (payload.updates_until) console.log('  Updates until:', payload.updates_until);
console.log('\nLICENSE_KEY:', licenseKey);
