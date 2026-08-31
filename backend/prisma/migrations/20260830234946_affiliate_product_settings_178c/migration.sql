-- Milestone 178, Part C: per-product commission configuration for
-- Seasonedz's OWN affiliate/referral programme, plus the immutable
-- per-order-line commission snapshot behind it. Purely additive —
-- two new tables, one new enum, and foreign keys pointing at existing
-- tables (Product, Order, OrderItem, Affiliate). Nothing existing is
-- dropped, altered, or renamed. Hand-authored and manually reviewed
-- (never generated against a live database's shadow-database mode —
-- see this milestone's own incident report) from a `prisma migrate
-- diff` preview run earlier against a schema-only comparison.

-- CreateEnum
CREATE TYPE "AffiliateProductCommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "AffiliateProductSetting" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "commissionType" "AffiliateProductCommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionPercent" DECIMAL(5,2),
    "fixedCommissionAmount" DECIMAL(10,2),
    "isAffiliateAvailable" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maximumCommission" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProductSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAffiliateProductCommission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "productId" TEXT,
    "commissionType" "AffiliateProductCommissionType" NOT NULL,
    "commissionPercent" DECIMAL(5,2),
    "fixedCommissionAmount" DECIMAL(10,2),
    "eligibleProductSubtotal" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "maximumCommission" DECIMAL(10,2),
    "calculatedCommission" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAffiliateProductCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProductSetting_productId_key" ON "AffiliateProductSetting"("productId");

-- CreateIndex
CREATE INDEX "AffiliateProductSetting_isAffiliateAvailable_idx" ON "AffiliateProductSetting"("isAffiliateAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAffiliateProductCommission_orderItemId_key" ON "OrderAffiliateProductCommission"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderAffiliateProductCommission_orderId_idx" ON "OrderAffiliateProductCommission"("orderId");

-- CreateIndex
CREATE INDEX "OrderAffiliateProductCommission_affiliateId_idx" ON "OrderAffiliateProductCommission"("affiliateId");

-- CreateIndex
CREATE INDEX "OrderAffiliateProductCommission_productId_idx" ON "OrderAffiliateProductCommission"("productId");

-- AddForeignKey
ALTER TABLE "AffiliateProductSetting" ADD CONSTRAINT "AffiliateProductSetting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateProductCommission" ADD CONSTRAINT "OrderAffiliateProductCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateProductCommission" ADD CONSTRAINT "OrderAffiliateProductCommission_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateProductCommission" ADD CONSTRAINT "OrderAffiliateProductCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateProductCommission" ADD CONSTRAINT "OrderAffiliateProductCommission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
