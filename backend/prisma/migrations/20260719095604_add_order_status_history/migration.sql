-- CreateEnum
CREATE TYPE "OrderStatusHistorySource" AS ENUM ('ADMIN_DASHBOARD', 'SYSTEM', 'PAYFAST_ITN', 'MANUAL_DATABASE_LEGACY');

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumberSnapshot" TEXT NOT NULL,
    "changedByAdminUserId" TEXT,
    "changedByAdminEmailSnapshot" TEXT,
    "changedByAdminNameSnapshot" TEXT,
    "oldStatus" "OrderStatus" NOT NULL,
    "newStatus" "OrderStatus" NOT NULL,
    "note" TEXT,
    "source" "OrderStatusHistorySource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderNumberSnapshot_idx" ON "OrderStatusHistory"("orderNumberSnapshot");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_changedByAdminUserId_idx" ON "OrderStatusHistory"("changedByAdminUserId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_source_idx" ON "OrderStatusHistory"("source");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_createdAt_idx" ON "OrderStatusHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedByAdminUserId_fkey" FOREIGN KEY ("changedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
