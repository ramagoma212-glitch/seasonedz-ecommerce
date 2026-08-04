-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('COURIER_LOCKER', 'COURIER_DOOR', 'COLLECTION');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "deliveryStreetAddress" DROP NOT NULL,
ALTER COLUMN "deliverySuburb" DROP NOT NULL,
ALTER COLUMN "deliveryCity" DROP NOT NULL,
ALTER COLUMN "deliveryProvince" DROP NOT NULL,
ALTER COLUMN "deliveryPostalCode" DROP NOT NULL,
ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'COURIER_DOOR',
ADD COLUMN     "collectionCity" TEXT;
