-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantGtinSnapshot" TEXT,
ADD COLUMN     "variantIsbnSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "gtin" TEXT,
ADD COLUMN     "isbn" TEXT,
ADD COLUMN     "languageCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_isbn_key" ON "ProductVariant"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_gtin_key" ON "ProductVariant"("gtin");

