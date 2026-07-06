ALTER TABLE "schedules" RENAME COLUMN "reminder_offset_days" TO "reminder_offset_minutes";

UPDATE "schedules"
SET "reminder_offset_minutes" = "reminder_offset_minutes" * 1440;
