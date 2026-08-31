-- AlterTable
ALTER TABLE "AdminUser" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AdminInvitation" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByAdminUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOtpChallenge" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "challengeTokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPasswordResetToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSecurityEvent" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "summary" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvitation_adminUserId_key" ON "AdminInvitation"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvitation_tokenHash_key" ON "AdminInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminInvitation_expiresAt_idx" ON "AdminInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminOtpChallenge_challengeTokenHash_key" ON "AdminOtpChallenge"("challengeTokenHash");

-- CreateIndex
CREATE INDEX "AdminOtpChallenge_adminUserId_idx" ON "AdminOtpChallenge"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminOtpChallenge_expiresAt_idx" ON "AdminOtpChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPasswordResetToken_tokenHash_key" ON "AdminPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminPasswordResetToken_adminUserId_idx" ON "AdminPasswordResetToken"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminPasswordResetToken_expiresAt_idx" ON "AdminPasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminSecurityEvent_adminUserId_idx" ON "AdminSecurityEvent"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminSecurityEvent_eventType_idx" ON "AdminSecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "AdminSecurityEvent_createdAt_idx" ON "AdminSecurityEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_invitedByAdminUserId_fkey" FOREIGN KEY ("invitedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOtpChallenge" ADD CONSTRAINT "AdminOtpChallenge_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPasswordResetToken" ADD CONSTRAINT "AdminPasswordResetToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSecurityEvent" ADD CONSTRAINT "AdminSecurityEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
