-- CreateEnum
CREATE TYPE "OutreachActivityType" AS ENUM ('NOTE', 'REPLY_RECEIVED', 'PHONE_CALL', 'WHATSAPP', 'EMAIL', 'CATALOGUE_SENT', 'QUOTE_REQUESTED', 'QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED', 'FOLLOW_UP', 'ORDER_CREATED', 'CUSTOMER_CONVERTED', 'LEAD_STATUS_CHANGED', 'QUOTE_SEND_FAILED', 'QUOTE_SEND_UNCERTAIN', 'QUOTE_SEND_RECONCILED');

-- CreateEnum
CREATE TYPE "OutreachActivityChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENDING', 'SEND_UNCERTAIN', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "OutreachContact" ADD COLUMN     "lastCatalogueSentAt" TIMESTAMP(3),
ADD COLUMN     "nextAction" TEXT;

-- CreateTable
CREATE TABLE "OutreachActivity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "OutreachActivityType" NOT NULL,
    "channel" "OutreachActivityChannel",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "fromLeadStatus" "OutreachLeadStatus",
    "toLeadStatus" "OutreachLeadStatus",
    "createdByAdminUserId" TEXT,
    "createdByAdminNameSnapshot" TEXT,
    "createdByAdminEmailSnapshot" TEXT,
    "orderId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bQuotation" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "organisationNameSnapshot" TEXT NOT NULL,
    "contactNameSnapshot" TEXT,
    "emailSnapshot" TEXT NOT NULL,
    "phoneSnapshot" TEXT,
    "billingAddress" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveryAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastSendAttemptAt" TIMESTAMP(3),
    "lastSendError" TEXT,
    "createdByAdminUserId" TEXT,
    "createdByAdminNameSnapshot" TEXT,
    "createdByAdminEmailSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bQuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationNumberCounter" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "OutreachActivity_contactId_occurredAt_idx" ON "OutreachActivity"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "OutreachActivity_type_idx" ON "OutreachActivity"("type");

-- CreateIndex
CREATE INDEX "OutreachActivity_quotationId_idx" ON "OutreachActivity"("quotationId");

-- CreateIndex
CREATE INDEX "OutreachActivity_orderId_idx" ON "OutreachActivity"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "B2bQuotation_quotationNumber_key" ON "B2bQuotation"("quotationNumber");

-- CreateIndex
CREATE INDEX "B2bQuotation_contactId_idx" ON "B2bQuotation"("contactId");

-- CreateIndex
CREATE INDEX "B2bQuotation_status_idx" ON "B2bQuotation"("status");

-- CreateIndex
CREATE INDEX "B2bQuotation_quotationDate_idx" ON "B2bQuotation"("quotationDate");

-- CreateIndex
CREATE UNIQUE INDEX "B2bQuotationLine_quotationId_position_key" ON "B2bQuotationLine"("quotationId", "position");

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "B2bQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bQuotation" ADD CONSTRAINT "B2bQuotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bQuotationLine" ADD CONSTRAINT "B2bQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "B2bQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

