-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "AffiliateProduct" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "slug" TEXT NOT NULL,
    "trackingSlug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "merchantName" TEXT NOT NULL,
    "affiliateNetwork" TEXT,
    "affiliateUrl" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "priceLastCheckedAt" TIMESTAMP(3),
    "discountText" TEXT,
    "rating" DECIMAL(3,2),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateProductId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign" TEXT,
    "source" TEXT,
    "placement" TEXT,
    "refererHost" TEXT,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateProductId" TEXT,
    "productTitleSnapshot" TEXT NOT NULL,
    "affiliateNetwork" TEXT,
    "externalReference" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "saleAmount" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(5,2),
    "commissionEarned" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProduct_slug_key" ON "AffiliateProduct"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProduct_trackingSlug_key" ON "AffiliateProduct"("trackingSlug");

-- CreateIndex
CREATE INDEX "AffiliateProduct_isActive_idx" ON "AffiliateProduct"("isActive");

-- CreateIndex
CREATE INDEX "AffiliateProduct_isFeatured_idx" ON "AffiliateProduct"("isFeatured");

-- CreateIndex
CREATE INDEX "AffiliateProduct_merchantName_idx" ON "AffiliateProduct"("merchantName");

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateProductId_clickedAt_idx" ON "AffiliateClick"("affiliateProductId", "clickedAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_campaign_idx" ON "AffiliateClick"("campaign");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateProductId_idx" ON "AffiliateCommission"("affiliateProductId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");

-- CreateIndex
CREATE INDEX "AffiliateCommission_saleDate_idx" ON "AffiliateCommission"("saleDate");

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateProductId_fkey" FOREIGN KEY ("affiliateProductId") REFERENCES "AffiliateProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateProductId_fkey" FOREIGN KEY ("affiliateProductId") REFERENCES "AffiliateProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
