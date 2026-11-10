import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import prisma from '../db.js';
import { unauthorized } from './http.js';

export const customerAccessCookie = 'cc_customer_access';
export const customerRefreshCookie = 'cc_customer_refresh';

const CUSTOMER_SECRET = `${config.jwtSecret}:customer`;
const CUSTOMER_AUDIENCE = 'commerce-core-customer';
const ACCESS_TTL = '30m';
const ACCESS_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function signCustomerAccessToken(customer, sessionId = null) {
  return jwt.sign(
    {
      sub: customer.id,
      storeId: customer.storeId,
      email: customer.email,
      type: 'customer',
      ...(sessionId ? { sid: sessionId } : {}),
    },
    CUSTOMER_SECRET,
    { expiresIn: ACCESS_TTL, audience: CUSTOMER_AUDIENCE },
  );
}

export function customerCookieOptions(maxAgeMs = ACCESS_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: maxAgeMs,
    path: '/',
  };
}

export function setCustomerCookies(res, { token, refreshToken }) {
  res.cookie(customerAccessCookie, token, customerCookieOptions(ACCESS_TTL_MS));
  res.cookie(customerRefreshCookie, refreshToken, customerCookieOptions(REFRESH_TTL_MS));
}

export function clearCustomerCookies(res) {
  res.clearCookie(customerAccessCookie, customerCookieOptions(0));
  res.clearCookie(customerRefreshCookie, customerCookieOptions(0));
}

export async function issueCustomerSession(customer, userAgent) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const session = await prisma.customerSession.create({
    data: {
      customerId: customer.id,
      tokenHash: hashRefreshToken(refreshToken),
      userAgent: userAgent || null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  const token = signCustomerAccessToken(customer, session.id);
  return { token, refreshToken, sessionId: session.id };
}

export async function rotateCustomerSession(refreshToken, userAgent) {
  if (!refreshToken) return null;
  const record = await prisma.customerSession.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { customer: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;

  const issued = await issueCustomerSession(record.customer, userAgent);
  await prisma.customerSession.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return { ...issued, customer: record.customer };
}

export async function revokeCustomerSession(refreshToken) {
  if (!refreshToken) return;
  await prisma.customerSession.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllCustomerSessions(customerId) {
  return prisma.customerSession.updateMany({
    where: { customerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeOtherCustomerSessions(customerId, sessionId) {
  return prisma.customerSession.updateMany({
    where: {
      customerId,
      revokedAt: null,
      ...(sessionId ? { id: { not: sessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(`${code}:${CUSTOMER_SECRET}`).digest('hex');
}

export function createVerificationCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return {
    code,
    hash: hashVerificationCode(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

export function verificationCodeMatches(code, hash) {
  if (!code || !hash) return false;
  const supplied = Buffer.from(hashVerificationCode(code));
  const expected = Buffer.from(hash);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function extractCustomerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[customerAccessCookie] || null;
}

export async function authenticateCustomer(req, res, next) {
  try {
    const token = extractCustomerToken(req);
    if (!token) throw unauthorized('Sign in to access this account');

    let decoded;
    try {
      decoded = jwt.verify(token, CUSTOMER_SECRET, { audience: CUSTOMER_AUDIENCE });
    } catch {
      throw unauthorized('Your session expired. Please sign in again.');
    }
    if (decoded.type !== 'customer') throw unauthorized('Invalid customer session');

    const customer = await prisma.customer.findFirst({
      where: { id: decoded.sub, storeId: req.storeId },
    });
    if (!customer || !customer.emailVerifiedAt) {
      throw unauthorized('Your session is no longer valid. Please sign in again.');
    }

    req.customer = customer;
    req.customerSessionId = decoded.sid || null;
    return next();
  } catch (error) {
    return next(error);
  }
}
