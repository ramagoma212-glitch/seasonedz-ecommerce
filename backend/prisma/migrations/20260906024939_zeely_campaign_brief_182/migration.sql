-- CreateEnum
CREATE TYPE "CampaignGoal" AS ENUM ('AWARENESS', 'PREORDER', 'PRODUCT_LAUNCH', 'SALES', 'EDUCATION', 'ENGAGEMENT', 'CUSTOMER_FEEDBACK', 'FAITH_BASED_EDUCATION', 'SCHOOL_OUTREACH', 'CHURCH_OUTREACH', 'BULK_BUYING');

-- CreateEnum
CREATE TYPE "CampaignPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'WHATSAPP', 'X', 'LINKEDIN', 'REDDIT');

-- CreateEnum
CREATE TYPE "CampaignBriefStatus" AS ENUM ('DRAFT', 'READY_FOR_ZEELY', 'CREATED_IN_ZEELY', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CampaignBrief" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "audienceId" TEXT,
    "pillarId" TEXT,
    "platforms" "CampaignPlatform"[],
    "goal" "CampaignGoal" NOT NULL,
    "campaignType" TEXT,
    "contentQuantity" INTEGER,
    "campaignStartAt" TIMESTAMP(3),
    "campaignEndAt" TIMESTAMP(3),
    "callToAction" TEXT,
    "additionalInstructions" TEXT,
    "generatedBriefText" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CampaignBriefStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByAdminId" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContentRecord" (
    "id" TEXT NOT NULL,
    "campaignBriefId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "platform" "CampaignPlatform",
    "caption" TEXT,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignBrief_status_idx" ON "CampaignBrief"("status");

-- CreateIndex
CREATE INDEX "CampaignBrief_productId_idx" ON "CampaignBrief"("productId");

-- CreateIndex
CREATE INDEX "CampaignBrief_audienceId_idx" ON "CampaignBrief"("audienceId");

-- CreateIndex
CREATE INDEX "CampaignBrief_pillarId_idx" ON "CampaignBrief"("pillarId");

-- CreateIndex
CREATE INDEX "CampaignBrief_createdAt_idx" ON "CampaignBrief"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignContentRecord_campaignBriefId_idx" ON "CampaignContentRecord"("campaignBriefId");

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentRecord" ADD CONSTRAINT "CampaignContentRecord_campaignBriefId_fkey" FOREIGN KEY ("campaignBriefId") REFERENCES "CampaignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentRecord" ADD CONSTRAINT "CampaignContentRecord_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
