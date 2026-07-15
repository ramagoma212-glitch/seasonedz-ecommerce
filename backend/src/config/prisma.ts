// Single shared Prisma Client instance for the whole backend. Importing
// this file instead of creating `new PrismaClient()` in multiple places
// avoids opening more database connections than necessary.

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
