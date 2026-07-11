-- DropForeignKey
ALTER TABLE "voice_stt_jobs" DROP CONSTRAINT "voice_stt_jobs_record_id_user_id_fkey";

-- AddForeignKey
ALTER TABLE "voice_stt_jobs" ADD CONSTRAINT "voice_stt_jobs_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
