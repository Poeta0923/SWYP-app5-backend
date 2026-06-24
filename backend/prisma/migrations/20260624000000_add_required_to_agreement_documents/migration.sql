-- AlterTable
ALTER TABLE "agreement_documents" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing required agreement documents.
UPDATE "agreement_documents"
SET "required" = true
WHERE "type" IN ('TERMS'::"AgreementType", 'PRIVACY_REQUIRED'::"AgreementType");
