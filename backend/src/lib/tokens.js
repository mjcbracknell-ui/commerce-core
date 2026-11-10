import crypto from 'node:crypto';
import config from '../config.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createRefreshTokenValue() {
  return crypto.randomBytes(48).toString('base64url');
}

export async function issueRefreshToken(prisma, userId, userAgent) {
  const token = createRefreshTokenValue();
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), userAgent: userAgent || null, expiresAt },
  });
  return { token, expiresAt };
}

export async function consumeRefreshToken(prisma, token) {
  if (!token) return null;
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return record;
}

export async function revokeRefreshToken(prisma, token) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const accessCookie = 'cc_access';
export const refreshCookie = 'cc_refresh';

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    domain: config.cookieDomain,
    maxAge: maxAgeMs,
    path: '/',
  };
}
