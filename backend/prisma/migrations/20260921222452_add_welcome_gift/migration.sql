-- CreateEnum
CREATE TYPE "WelcomeGiftDeliveryStatus" AS ENUM ('CLAIMED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationTokenHash" TEXT;

-- CreateTable
CREATE TABLE "WelcomeGiftAsset" (
    "id" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "storageBucket" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeGiftAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeGiftDelivery" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "WelcomeGiftDeliveryStatus" NOT NULL DEFAULT 'CLAIMED',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeGiftDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeGiftAsset_assetKey_key" ON "WelcomeGiftAsset"("assetKey");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeGiftDelivery_customerId_key" ON "WelcomeGiftDelivery"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeGiftDelivery_tokenHash_key" ON "WelcomeGiftDelivery"("tokenHash");

-- CreateIndex
CREATE INDEX "WelcomeGiftDelivery_expiresAt_idx" ON "WelcomeGiftDelivery"("expiresAt");

-- AddForeignKey
ALTER TABLE "WelcomeGiftDelivery" ADD CONSTRAINT "WelcomeGiftDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

