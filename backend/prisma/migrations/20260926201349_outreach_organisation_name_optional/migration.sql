-- AlterTable
ALTER TABLE "OutreachCampaignRecipient" ALTER COLUMN "organisationNameSnapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OutreachContact" ALTER COLUMN "organisationName" DROP NOT NULL;
