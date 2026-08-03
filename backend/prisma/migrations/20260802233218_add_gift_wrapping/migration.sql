-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftWrapTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "giftMessage" TEXT,
ADD COLUMN     "giftWrapFeePerUnit" DECIMAL(10,2),
ADD COLUMN     "isGiftWrapped" BOOLEAN NOT NULL DEFAULT false;
