// Single shared Prisma Client instance for the whole backend. Importing
// this file instead of creating `new PrismaClient()` in multiple places
// avoids opening more database connections than necessary.
//
// Version 7, Milestone 174C: this is also the one choke point every
// test file already imports, which makes it the right place to install
// the test-database safety guard — see testDbGuard.ts's own header
// comment for the full reasoning (this project has no separate test
// database, so DATABASE_URL is the real production database in every
// environment, test included).

import { PrismaClient } from "@prisma/client";
import { isRunningTestFiles, assertSafeTestEnvironment, installProductionWriteGuard } from "./testDbGuard.js";

export const prisma = new PrismaClient();

if (isRunningTestFiles()) {
  assertSafeTestEnvironment();
  installProductionWriteGuard(prisma);
}
