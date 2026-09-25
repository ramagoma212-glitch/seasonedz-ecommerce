-- CreateTable
CREATE TABLE "GuestWelcomeGiftDelivery" (
    "id" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "status" "WelcomeGiftDeliveryStatus" NOT NULL DEFAULT 'CLAIMED',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestWelcomeGiftDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestWelcomeGiftDelivery_customerEmail_key" ON "GuestWelcomeGiftDelivery"("customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "GuestWelcomeGiftDelivery_tokenHash_key" ON "GuestWelcomeGiftDelivery"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestWelcomeGiftDelivery_expiresAt_idx" ON "GuestWelcomeGiftDelivery"("expiresAt");
