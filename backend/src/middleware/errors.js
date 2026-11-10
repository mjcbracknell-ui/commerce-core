import { ZodError } from 'zod';
import pkg from '@prisma/client';
import { HttpError } from '../lib/http.js';

const { Prisma } = pkg;

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : error.meta?.target;
      return res.status(409).json({ error: `Already exists${target ? `: ${target}` : ''}` });
    }
    if (error.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Related record does not exist' });
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error('[error]', error);
  return res.status(500).json({ error: 'Internal server error' });
}
