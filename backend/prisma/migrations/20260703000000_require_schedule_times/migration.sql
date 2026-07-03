UPDATE "schedules"
SET "schedule_time" = "created_at"
WHERE "schedule_time" IS NULL;

UPDATE "schedules"
SET "reminder_time" = "schedule_time"
WHERE "reminder_time" IS NULL;

ALTER TABLE "schedules" ALTER COLUMN "schedule_time" SET NOT NULL;

ALTER TABLE "schedules" ALTER COLUMN "reminder_time" SET NOT NULL;
