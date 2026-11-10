import prisma from '../db.js';
import { badRequest } from '../lib/http.js';

/** Validate request body with a zod schema. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(badRequest('Validation failed', result.error.flatten()));
    }
    req.body = result.data;
    return next();
  };
}

/** Validate request query with a zod schema; parsed values land on req.validatedQuery. */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(badRequest('Invalid query', result.error.flatten()));
    }
    req.validatedQuery = result.data;
    return next();
  };
}

export function audit(req, action, meta) {
  return prisma.auditLog
    .create({
      data: {
        storeId: req.storeId,
        userId: req.user?.id || null,
        action,
        meta: meta || undefined,
      },
    })
    .catch(() => {});
}
