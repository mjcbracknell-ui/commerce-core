import jwt from 'jsonwebtoken';
import config from '../config.js';
import prisma from '../db.js';
import { accessCookie } from '../lib/tokens.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name || null },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl },
  );
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[accessCookie] || null;
}

export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'token_invalid' });
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, role: true, twoFAEnabled: true },
    });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function attachStore(req, res, next) {
  try {
    const requestedStoreId = req.headers['x-store-id'] || null;
    const membership = await prisma.storeUser.findFirst({
      where: { userId: req.user.id, ...(requestedStoreId ? { storeId: requestedStoreId } : {}) },
      include: { store: true },
      orderBy: { store: { createdAt: 'asc' } },
    });
    if (!membership) return res.status(403).json({ error: 'No store access' });
    req.store = membership.store;
    req.storeId = membership.storeId;
    req.storeRole = membership.role;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.storeRole || !roles.includes(req.storeRole)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    return next();
  };
}

/** Resolve the public storefront store from API key, domain header/host, or the first store. */
export async function resolvePublicStore(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    let store = null;

    if (apiKey) {
      const key = await prisma.apiKey.findUnique({ where: { key: String(apiKey) }, include: { store: true } });
      if (!key || key.revokedAt) return res.status(401).json({ error: 'Invalid API key' });
      store = key.store;
      prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }

    if (!store) {
      const storeId = req.headers['x-store-id'];
      if (storeId) store = await prisma.store.findUnique({ where: { id: String(storeId) } });
    }

    if (!store) {
      const rawDomain = String(req.headers['x-store-domain'] || req.hostname || '').toLowerCase();
      const domain = rawDomain.replace(/^www\./, '').replace(/:\d+$/, '');
      if (domain) {
        store = await prisma.store.findFirst({ where: { domain: { equals: domain, mode: 'insensitive' } } });
      }
    }

    if (!store) store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!store) return res.status(404).json({ error: 'No store configured. Run the seed script.' });

    req.store = store;
    req.storeId = store.id;
    return next();
  } catch (error) {
    return next(error);
  }
}
