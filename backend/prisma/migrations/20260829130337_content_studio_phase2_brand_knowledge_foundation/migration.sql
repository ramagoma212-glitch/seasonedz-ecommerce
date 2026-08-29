-- CreateEnum
CREATE TYPE "BrandKnowledgeCategory" AS ENUM ('BRAND_FACT', 'BRAND_VOICE', 'WRITING_RULE', 'VISUAL_RULE', 'PRODUCT_POSITIONING', 'AUDIENCE_INSIGHT', 'APPROVED_CLAIM', 'PROHIBITED_CLAIM', 'TERMINOLOGY', 'CALL_TO_ACTION', 'PLATFORM_RULE', 'SEASONAL_GUIDANCE', 'CAMPAIGN_HISTORY');

-- CreateEnum
CREATE TYPE "BrandKnowledgeSourceType" AS ENUM ('OWNER_APPROVED', 'WEBSITE', 'PRODUCT_DATABASE', 'POLICY', 'HISTORICAL_CAMPAIGN', 'INTERNAL_GUIDANCE');

-- CreateTable
CREATE TABLE "BrandKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "category" "BrandKnowledgeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "BrandKnowledgeSourceType" NOT NULL,
    "sourceReference" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "relatedProductId" TEXT,
    "pillarId" TEXT,
    "audienceId" TEXT,
    "createdByAdminId" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPillar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "painPoints" TEXT,
    "motivations" TEXT,
    "preferredContent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_category_isActive_idx" ON "BrandKnowledgeEntry"("category", "isActive");

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_isActive_idx" ON "BrandKnowledgeEntry"("isActive");

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_relatedProductId_idx" ON "BrandKnowledgeEntry"("relatedProductId");

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_pillarId_idx" ON "BrandKnowledgeEntry"("pillarId");

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_audienceId_idx" ON "BrandKnowledgeEntry"("audienceId");

-- CreateIndex
CREATE INDEX "BrandKnowledgeEntry_tags_idx" ON "BrandKnowledgeEntry" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPillar_name_key" ON "ContentPillar"("name");

-- CreateIndex
CREATE INDEX "ContentPillar_isActive_idx" ON "ContentPillar"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Audience_name_key" ON "Audience"("name");

-- CreateIndex
CREATE INDEX "Audience_isActive_idx" ON "Audience"("isActive");

-- AddForeignKey
ALTER TABLE "BrandKnowledgeEntry" ADD CONSTRAINT "BrandKnowledgeEntry_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKnowledgeEntry" ADD CONSTRAINT "BrandKnowledgeEntry_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKnowledgeEntry" ADD CONSTRAINT "BrandKnowledgeEntry_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKnowledgeEntry" ADD CONSTRAINT "BrandKnowledgeEntry_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKnowledgeEntry" ADD CONSTRAINT "BrandKnowledgeEntry_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
