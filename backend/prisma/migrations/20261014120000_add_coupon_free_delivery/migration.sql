-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "freeDelivery" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CouponRedemption" ADD COLUMN     "freeDeliverySnapshot" BOOLEAN NOT NULL DEFAULT false;

