import { PrismaClient } from "@prisma/client";

// PrismaClient singleton.
// Next.js dev mode hot-reloads modules on every change; without a global cache a
// new client (and a new connection pool) is created per reload until the process
// is exhausted. Cache on globalThis so dev reloads reuse one client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
