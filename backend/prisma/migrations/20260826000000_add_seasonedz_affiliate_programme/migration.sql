-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderAffiliateCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REVERSED');

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "commissionRateOverride" DECIMAL(5,2),
    "discountRateOverride" DECIMAL(5,2),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProgrammeSettings" (
    "id" TEXT NOT NULL,
    "defaultCommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 7.00,
    "defaultReferralDiscountRate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "commissionValidationDays" INTEGER NOT NULL DEFAULT 30,
    "minimumPayoutAmount" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "payoutDayOfMonth" INTEGER NOT NULL DEFAULT 15,
    "isProgrammeActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProgrammeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAffiliateCommission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "affiliateNameSnapshot" TEXT NOT NULL,
    "affiliateReferralCodeSnapshot" TEXT NOT NULL,
    "qualifyingProductSubtotal" DECIMAL(10,2) NOT NULL,
    "discountRateApplied" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "netQualifyingAmount" DECIMAL(10,2) NOT NULL,
    "commissionRateApplied" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" "OrderAffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderAffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_customerId_key" ON "Affiliate"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_email_key" ON "Affiliate"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_referralCode_key" ON "Affiliate"("referralCode");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAffiliateCommission_orderId_key" ON "OrderAffiliateCommission"("orderId");

-- CreateIndex
CREATE INDEX "OrderAffiliateCommission_affiliateId_status_idx" ON "OrderAffiliateCommission"("affiliateId", "status");

-- CreateIndex
CREATE INDEX "OrderAffiliateCommission_status_idx" ON "OrderAffiliateCommission"("status");

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateProgrammeSettings" ADD CONSTRAINT "AffiliateProgrammeSettings_updatedByAdminUserId_fkey" FOREIGN KEY ("updatedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateCommission" ADD CONSTRAINT "OrderAffiliateCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAffiliateCommission" ADD CONSTRAINT "OrderAffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

