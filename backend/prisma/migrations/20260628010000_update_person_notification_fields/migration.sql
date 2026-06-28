ALTER TABLE "people"
DROP COLUMN "schedule_notification_enabled",
ADD COLUMN "birthday_notification_offset_days" INTEGER;
