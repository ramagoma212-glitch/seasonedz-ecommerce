-- AlterTable
ALTER TABLE "Shipping" ADD COLUMN     "lastCourierStatus" TEXT,
ADD COLUMN     "lastCourierStatusAt" TIMESTAMP(3);
