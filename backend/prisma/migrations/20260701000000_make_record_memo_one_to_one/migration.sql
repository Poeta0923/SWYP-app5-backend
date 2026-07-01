-- Drop the unused timeline offset field from record memos.
ALTER TABLE "record_memos" DROP COLUMN "start_seconds";

-- Enforce one optional memo per record.
CREATE UNIQUE INDEX "record_memos_record_id_user_id_key" ON "record_memos"("record_id", "user_id");
