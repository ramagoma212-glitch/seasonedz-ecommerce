-- AlterTable
ALTER TABLE "Shipping" ADD COLUMN     "courierBookingAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "courierBookingError" TEXT;
