-- CreateEnum
CREATE TYPE "OutreachLeadStatus" AS ENUM ('PROSPECT', 'CONTACTED', 'INTERESTED', 'CATALOGUE_SENT', 'QUOTE_REQUESTED', 'NEGOTIATING', 'CUSTOMER', 'REPEAT_CUSTOMER');

-- AlterTable
ALTER TABLE "OutreachContact" ADD COLUMN     "buyerEmail" TEXT,
ADD COLUMN     "contactRole" TEXT,
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "leadStatus" "OutreachLeadStatus" NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutreachContact_leadStatus_idx" ON "OutreachContact"("leadStatus");

-- CreateIndex
CREATE INDEX "OutreachContact_nextFollowUpAt_idx" ON "OutreachContact"("nextFollowUpAt");
