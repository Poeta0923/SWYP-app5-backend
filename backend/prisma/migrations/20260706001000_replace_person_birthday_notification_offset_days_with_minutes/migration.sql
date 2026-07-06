ALTER TABLE "people" RENAME COLUMN "birthday_notification_offset_days" TO "birthday_notification_offset_minutes";

UPDATE "people"
SET "birthday_notification_offset_minutes" = "birthday_notification_offset_minutes" * 1440;
