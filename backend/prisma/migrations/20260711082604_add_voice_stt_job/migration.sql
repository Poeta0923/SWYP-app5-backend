-- CreateEnum
CREATE TYPE "VoiceSttJobStatus" AS ENUM ('STT_PROCESSING', 'SUMMARY_PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "voice_stt_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "VoiceSttJobStatus" NOT NULL DEFAULT 'STT_PROCESSING',
    "voice_file_id" TEXT NOT NULL,
    "record_id" TEXT,
    "record_memo" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_stt_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_stt_jobs_voice_file_id_key" ON "voice_stt_jobs"("voice_file_id");

-- CreateIndex
CREATE INDEX "voice_stt_jobs_user_id_idx" ON "voice_stt_jobs"("user_id");

-- CreateIndex
CREATE INDEX "voice_stt_jobs_status_idx" ON "voice_stt_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "voice_stt_jobs_record_id_user_id_key" ON "voice_stt_jobs"("record_id", "user_id");

-- AddForeignKey
ALTER TABLE "voice_stt_jobs" ADD CONSTRAINT "voice_stt_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_stt_jobs" ADD CONSTRAINT "voice_stt_jobs_voice_file_id_fkey" FOREIGN KEY ("voice_file_id") REFERENCES "media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_stt_jobs" ADD CONSTRAINT "voice_stt_jobs_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE SET NULL ON UPDATE CASCADE;
