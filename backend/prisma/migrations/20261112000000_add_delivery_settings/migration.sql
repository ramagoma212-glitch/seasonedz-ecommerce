-- CreateTable
CREATE TABLE "DeliverySettings" (
    "id" TEXT NOT NULL,
    "courierLockerFee" DECIMAL(10,2) NOT NULL DEFAULT 60.00,
    "courierDoorFee" DECIMAL(10,2) NOT NULL DEFAULT 90.00,
    "freeDeliveryThreshold" DECIMAL(10,2) NOT NULL DEFAULT 350.00,
    "updatedByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DeliverySettings" ADD CONSTRAINT "DeliverySettings_updatedByAdminUserId_fkey" FOREIGN KEY ("updatedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
