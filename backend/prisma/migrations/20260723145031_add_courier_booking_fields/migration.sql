-- AlterTable
ALTER TABLE "Shipping" ADD COLUMN     "courierBookedAt" TIMESTAMP(3),
ADD COLUMN     "courierCost" DECIMAL(10,2),
ADD COLUMN     "courierProvider" TEXT,
ADD COLUMN     "courierServiceCode" TEXT,
ADD COLUMN     "courierServiceName" TEXT,
ADD COLUMN     "courierShipmentId" TEXT;
