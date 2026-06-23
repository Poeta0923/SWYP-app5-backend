-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('TERMS', 'PRIVACY_REQUIRED', 'MARKETING_EMAIL', 'MARKETING_SMS');

-- CreateEnum
CREATE TYPE "AgreementAction" AS ENUM ('AGREED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "agreement_documents" (
    "id" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_agreements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "agreed_at" TIMESTAMP(3) NOT NULL,
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_agreement_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agreement_id" TEXT,
    "document_id" TEXT NOT NULL,
    "action" "AgreementAction" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "user_agreement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_memos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "start_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "record_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agreement_documents_type_effective_at_idx" ON "agreement_documents"("type", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_documents_type_version_key" ON "agreement_documents"("type", "version");

-- CreateIndex
CREATE INDEX "user_agreements_document_id_withdrawn_at_idx" ON "user_agreements"("document_id", "withdrawn_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_agreements_user_id_document_id_key" ON "user_agreements"("user_id", "document_id");

-- CreateIndex
CREATE INDEX "user_agreement_events_user_id_occurred_at_idx" ON "user_agreement_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "user_agreement_events_document_id_action_occurred_at_idx" ON "user_agreement_events"("document_id", "action", "occurred_at");

-- CreateIndex
CREATE INDEX "user_agreement_events_agreement_id_idx" ON "user_agreement_events"("agreement_id");

-- CreateIndex
CREATE INDEX "record_memos_user_id_idx" ON "record_memos"("user_id");

-- CreateIndex
CREATE INDEX "record_memos_record_id_idx" ON "record_memos"("record_id");

-- AddForeignKey
ALTER TABLE "user_agreements" ADD CONSTRAINT "user_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agreements" ADD CONSTRAINT "user_agreements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "agreement_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agreement_events" ADD CONSTRAINT "user_agreement_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agreement_events" ADD CONSTRAINT "user_agreement_events_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "user_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agreement_events" ADD CONSTRAINT "user_agreement_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "agreement_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_memos" ADD CONSTRAINT "record_memos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_memos" ADD CONSTRAINT "record_memos_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
