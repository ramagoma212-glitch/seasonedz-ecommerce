-- CreateEnum
CREATE TYPE "OutreachEmailAttemptStatus" AS ENUM ('RESERVED', 'ACCEPTED', 'FAILED', 'UNCERTAIN', 'CONFIRMED_SENT', 'CONFIRMED_NOT_SENT');

-- AlterEnum
ALTER TYPE "OutreachActivityType" ADD VALUE 'FOLLOW_UP_EMAIL_SENT';

-- AlterTable
ALTER TABLE "OutreachContact" ADD COLUMN     "emailSendLockAttemptId" TEXT;

-- CreateTable
CREATE TABLE "OutreachEmailAttempt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateKey" TEXT,
    "status" "OutreachEmailAttemptStatus" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "failureReason" TEXT,
    "reconciliationNote" TEXT,
    "createdByAdminUserId" TEXT,
    "createdByAdminNameSnapshot" TEXT,
    "createdByAdminEmailSnapshot" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEmailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachEmailAttempt_idempotencyKey_key" ON "OutreachEmailAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachEmailAttempt_contactId_createdAt_idx" ON "OutreachEmailAttempt"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachEmailAttempt_status_idx" ON "OutreachEmailAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachContact_emailSendLockAttemptId_key" ON "OutreachContact"("emailSendLockAttemptId");

-- AddForeignKey
ALTER TABLE "OutreachEmailAttempt" ADD CONSTRAINT "OutreachEmailAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

