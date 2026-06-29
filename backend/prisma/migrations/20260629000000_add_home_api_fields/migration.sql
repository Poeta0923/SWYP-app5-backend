-- Add Person interaction timestamp for home important-person ordering.
ALTER TABLE "people" ADD COLUMN "interacted_at" TIMESTAMP(3);

UPDATE "people"
SET "interacted_at" = "updated_at";

ALTER TABLE "people"
ALTER COLUMN "interacted_at" SET NOT NULL,
ALTER COLUMN "interacted_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Add voice record duration in seconds. The voice file itself remains stored as MediaFile.
ALTER TABLE "records" ADD COLUMN "voice_duration_seconds" INTEGER;

CREATE INDEX "people_user_id_is_important_interacted_at_idx" ON "people"("user_id", "is_important", "interacted_at");

CREATE INDEX "schedules_user_id_schedule_time_idx" ON "schedules"("user_id", "schedule_time");

CREATE INDEX "records_user_id_created_at_idx" ON "records"("user_id", "created_at");
