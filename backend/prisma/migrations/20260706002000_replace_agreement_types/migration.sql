-- Existing agreement documents and user consent history are tied to the old
-- agreement type set. Clear them before replacing the enum values.
DELETE FROM "user_agreement_events";
DELETE FROM "user_agreements";
DELETE FROM "agreement_documents";

ALTER TABLE "agreement_documents"
  ALTER COLUMN "type" TYPE TEXT
  USING "type"::text;

DROP TYPE "AgreementType";

CREATE TYPE "AgreementType" AS ENUM (
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'RECORDING_DATA_AND_AI_PROCESSING_CONSENT',
  'THIRD_PARTY_INFORMATION_PROVISION_CONSENT',
  'MARKETING_COMMUNICATION_CONSENT'
);

ALTER TABLE "agreement_documents"
  ALTER COLUMN "type" TYPE "AgreementType"
  USING "type"::"AgreementType";
