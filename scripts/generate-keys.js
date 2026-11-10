import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const keyDir = path.resolve(process.cwd(), 'keys');
fs.mkdirSync(keyDir, { recursive: true });

const privatePath = path.join(keyDir, 'license-private.pem');
const publicPath = path.join(keyDir, 'license-public.pem');

if (fs.existsSync(privatePath) && !process.argv.includes('--force')) {
  console.error(`Refusing to overwrite ${privatePath}. Re-run with --force to rotate keys.`);
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicPath, publicKey, { mode: 0o644 });

const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n');

console.log('RSA-2048 license keypair created.\n');
console.log(`Private key: ${privatePath}  (keep secret, used by generate-license)`);
console.log(`Public key:  ${publicPath}\n`);
console.log('Add these to .env (backend verifies with the public key):\n');
console.log(`LICENSE_PUBLIC_KEY=${oneLine(publicKey)}`);
console.log(`LICENSE_PRIVATE_KEY=${oneLine(privateKey)}`);
console.log('\nLicense admin token (protects the /api/license/generate endpoint):');
console.log(`LICENSE_ADMIN_TOKEN=${crypto.randomBytes(24).toString('hex')}`);
