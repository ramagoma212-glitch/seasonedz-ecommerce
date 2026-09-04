-- CreateEnum
CREATE TYPE "PreorderDiscountRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "containsPreorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latestPreorderReleaseAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isPreorderAtPurchase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorderDiscountAmountApplied" DECIMAL(10,2),
ADD COLUMN     "preorderDiscountRateApplied" DECIMAL(5,2),
ADD COLUMN     "preorderReleaseAtSnapshot" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isPreorderDiscountEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPreorderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorderEndAt" TIMESTAMP(3),
ADD COLUMN     "preorderReleaseAt" TIMESTAMP(3),
ADD COLUMN     "preorderStartAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PreorderProgrammeSettings" (
    "id" TEXT NOT NULL,
    "firstRegisteredPreorderDiscountEnabled" BOOLEAN NOT NULL DEFAULT true,
    "firstRegisteredPreorderDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "updatedByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreorderProgrammeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreorderDiscountRedemption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PreorderDiscountRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "discountPercentSnapshot" DECIMAL(5,2) NOT NULL,
    "discountAmountSnapshot" DECIMAL(10,2) NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreorderDiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreorderDiscountRedemption_orderId_key" ON "PreorderDiscountRedemption"("orderId");

-- CreateIndex
CREATE INDEX "PreorderDiscountRedemption_customerId_idx" ON "PreorderDiscountRedemption"("customerId");

-- CreateIndex
CREATE INDEX "PreorderDiscountRedemption_status_idx" ON "PreorderDiscountRedemption"("status");

-- Hand-added, Milestone 181, Part F: a partial unique index enforcing
-- "at most one ACTIVE (RESERVED or CONSUMED) redemption per customer"
-- at the database level. Prisma's schema DSL cannot express a partial
-- unique index, so this line is added by hand after `prisma migrate
-- dev` generated the rest of this file — see the PreorderDiscountRedemption
-- model's own comment in schema.prisma. This is the real concurrency
-- guarantee: reservePreorderDiscount() relies on the resulting unique-
-- constraint violation (Postgres error 23505 / Prisma code P2002) to
-- safely reject a second simultaneous checkout attempt for the same
-- customer, rather than a race-prone application-level check-then-insert.
CREATE UNIQUE INDEX "PreorderDiscountRedemption_customerId_active_key"
  ON "PreorderDiscountRedemption" ("customerId")
  WHERE "status" IN ('RESERVED', 'CONSUMED');

-- CreateIndex
CREATE INDEX "Order_containsPreorder_idx" ON "Order"("containsPreorder");

-- CreateIndex
CREATE INDEX "Product_isPreorderEnabled_idx" ON "Product"("isPreorderEnabled");

-- AddForeignKey
ALTER TABLE "PreorderProgrammeSettings" ADD CONSTRAINT "PreorderProgrammeSettings_updatedByAdminUserId_fkey" FOREIGN KEY ("updatedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreorderDiscountRedemption" ADD CONSTRAINT "PreorderDiscountRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreorderDiscountRedemption" ADD CONSTRAINT "PreorderDiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
