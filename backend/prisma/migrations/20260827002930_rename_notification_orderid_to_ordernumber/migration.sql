/*
  Warnings:

  - You are about to drop the column `orderId` on the `Notification` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Notification_orderId_idx";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "orderId",
ADD COLUMN     "orderNumber" TEXT;

-- CreateIndex
CREATE INDEX "Notification_orderNumber_idx" ON "Notification"("orderNumber");
