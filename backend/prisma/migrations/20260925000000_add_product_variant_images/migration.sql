-- Milestone 197: dedicated per-variant product images.
-- Additive only: adds one nullable column, its index, and its FK.
-- No existing row is modified; every existing ProductImage row keeps
-- variantId = NULL (its current, unchanged meaning as a shared
-- product-level image).

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "variantId" TEXT;

-- CreateIndex
CREATE INDEX "ProductImage_variantId_idx" ON "ProductImage"("variantId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
