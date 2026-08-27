-- CreateEnum
CREATE TYPE "AffiliateApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateApplicantType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "AffiliateIdentityDocumentType" AS ENUM ('SA_ID', 'PASSPORT');

-- CreateEnum
CREATE TYPE "AffiliateProofOfResidenceType" AS ENUM ('BANK_STATEMENT', 'MUNICIPAL_ACCOUNT_OR_LETTER', 'PROOF_OF_RESIDENCE');

-- CreateEnum
CREATE TYPE "AffiliateDocumentMatchResult" AS ENUM ('MATCH', 'MISMATCH', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AffiliateApplicationEventType" AS ENUM ('CREATED', 'FIELDS_UPDATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REPLACED', 'CLASSIFICATION_COMPLETED', 'SUBMITTED', 'ACTION_REQUIRED', 'RESUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateApplicationEventActor" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AffiliateDocumentSlot" AS ENUM ('IDENTITY', 'PROOF_OF_RESIDENCE');

-- CreateTable
CREATE TABLE "AffiliateApplication" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "affiliateId" TEXT,
    "status" "AffiliateApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "firstName" TEXT,
    "middleName" TEXT,
    "surname" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "identityType" "AffiliateIdentityDocumentType",
    "idNumber" TEXT,
    "passportNumber" TEXT,
    "contactEmail" TEXT,
    "mobileNumber" TEXT,
    "whatsappNumber" TEXT,
    "preferredContactMethod" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "applicantType" "AffiliateApplicantType" NOT NULL DEFAULT 'INDIVIDUAL',
    "businessName" TEXT,
    "businessRegistrationNumber" TEXT,
    "businessWebsite" TEXT,
    "promotionPlan" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "otherPlatform" TEXT,
    "audienceSize" TEXT,
    "motivation" TEXT,
    "infoAccurateConfirmedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "actionRequiredReason" TEXT,
    "actionRequiredArea" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "slot" "AffiliateDocumentSlot" NOT NULL,
    "identityDocumentType" "AffiliateIdentityDocumentType",
    "proofOfResidenceType" "AffiliateProofOfResidenceType",
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "classification" "AffiliateDocumentMatchResult",
    "classificationReason" TEXT,
    "nameMatchResult" "AffiliateDocumentMatchResult",
    "addressMatchResult" "AffiliateDocumentMatchResult",
    "idNumberMatchResult" "AffiliateDocumentMatchResult",
    "documentDateExtracted" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "eventType" "AffiliateApplicationEventType" NOT NULL,
    "actorType" "AffiliateApplicationEventActor" NOT NULL,
    "actorAdminUserId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_customerId_key" ON "AffiliateApplication"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_affiliateId_key" ON "AffiliateApplication"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateApplication_status_idx" ON "AffiliateApplication"("status");

-- CreateIndex
CREATE INDEX "AffiliateApplicationDocument_applicationId_slot_isCurrent_idx" ON "AffiliateApplicationDocument"("applicationId", "slot", "isCurrent");

-- CreateIndex
CREATE INDEX "AffiliateApplicationEvent_applicationId_createdAt_idx" ON "AffiliateApplicationEvent"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplicationDocument" ADD CONSTRAINT "AffiliateApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AffiliateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplicationEvent" ADD CONSTRAINT "AffiliateApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AffiliateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplicationEvent" ADD CONSTRAINT "AffiliateApplicationEvent_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
