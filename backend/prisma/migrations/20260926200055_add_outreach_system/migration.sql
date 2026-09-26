-- CreateEnum
CREATE TYPE "OutreachContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'INVALID', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'COMPLETED', 'PARTIALLY_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutreachRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED', 'INVALID');

-- CreateTable
CREATE TABLE "OutreachContact" (
    "id" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organisationType" TEXT,
    "province" TEXT,
    "city" TEXT,
    "website" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "OutreachContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "suppressedAt" TIMESTAMP(3),
    "suppressedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceFilter" JSONB,
    "createdByAdminId" TEXT,
    "recipientsBuiltAt" TIMESTAMP(3),
    "sendStartedAt" TIMESTAMP(3),
    "sendCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "organisationNameSnapshot" TEXT NOT NULL,
    "emailSnapshot" TEXT NOT NULL,
    "status" "OutreachRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachContact_email_key" ON "OutreachContact"("email");

-- CreateIndex
CREATE INDEX "OutreachContact_status_idx" ON "OutreachContact"("status");

-- CreateIndex
CREATE INDEX "OutreachContact_organisationType_idx" ON "OutreachContact"("organisationType");

-- CreateIndex
CREATE INDEX "OutreachContact_province_idx" ON "OutreachContact"("province");

-- CreateIndex
CREATE INDEX "OutreachContact_city_idx" ON "OutreachContact"("city");

-- CreateIndex
CREATE INDEX "OutreachContact_source_idx" ON "OutreachContact"("source");

-- CreateIndex
CREATE INDEX "OutreachContact_createdAt_idx" ON "OutreachContact"("createdAt");

-- CreateIndex
CREATE INDEX "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");

-- CreateIndex
CREATE INDEX "OutreachCampaign_createdAt_idx" ON "OutreachCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "OutreachCampaignRecipient_campaignId_status_idx" ON "OutreachCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaignRecipient_campaignId_contactId_key" ON "OutreachCampaignRecipient"("campaignId", "contactId");

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
