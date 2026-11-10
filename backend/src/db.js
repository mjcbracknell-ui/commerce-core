import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__commercecorePrisma ||
  new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__commercecorePrisma = prisma;

export default prisma;
