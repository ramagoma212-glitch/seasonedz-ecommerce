-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'DIGITAL');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "digitalAssetId" TEXT,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'PHYSICAL';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "digitalTermsNote" TEXT,
ADD COLUMN     "downloadEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'PHYSICAL';

-- CreateTable
CREATE TABLE "DigitalAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalDownloadLog" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "digitalAssetId" TEXT NOT NULL,
    "customerId" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestDownloadToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "GuestDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalAsset_productId_key" ON "DigitalAsset"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalDownloadLog_orderItemId_key" ON "DigitalDownloadLog"("orderItemId");

-- CreateIndex
CREATE INDEX "DigitalDownloadLog_digitalAssetId_idx" ON "DigitalDownloadLog"("digitalAssetId");

-- CreateIndex
CREATE INDEX "DigitalDownloadLog_customerId_idx" ON "DigitalDownloadLog"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestDownloadToken_tokenHash_key" ON "GuestDownloadToken"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestDownloadToken_orderId_idx" ON "GuestDownloadToken"("orderId");

-- CreateIndex
CREATE INDEX "GuestDownloadToken_expiresAt_idx" ON "GuestDownloadToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_digitalAssetId_idx" ON "OrderItem"("digitalAssetId");

-- CreateIndex
CREATE INDEX "Product_productType_idx" ON "Product"("productType");

-- AddForeignKey
ALTER TABLE "DigitalAsset" ADD CONSTRAINT "DigitalAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_digitalAssetId_fkey" FOREIGN KEY ("digitalAssetId") REFERENCES "DigitalAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalDownloadLog" ADD CONSTRAINT "DigitalDownloadLog_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalDownloadLog" ADD CONSTRAINT "DigitalDownloadLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDownloadToken" ADD CONSTRAINT "GuestDownloadToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
