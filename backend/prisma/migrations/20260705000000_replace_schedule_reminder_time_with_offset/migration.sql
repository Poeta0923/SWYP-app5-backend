ALTER TABLE "schedules" ADD COLUMN "reminder_offset_days" INTEGER;

UPDATE "schedules"
SET "reminder_offset_days" = GREATEST(
  0,
  ("schedule_time"::date - "reminder_time"::date)
);

ALTER TABLE "schedules" ALTER COLUMN "reminder_offset_days" SET DEFAULT 0;
ALTER TABLE "schedules" ALTER COLUMN "reminder_offset_days" SET NOT NULL;
ALTER TABLE "schedules" DROP COLUMN "reminder_time";
