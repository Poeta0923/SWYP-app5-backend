UPDATE "people"
SET "birthday_notification_offset_days" = 1
WHERE "birthday_notification_offset_days" IS NULL;

ALTER TABLE "people"
ALTER COLUMN "birthday_notification_offset_days" SET DEFAULT 1,
ALTER COLUMN "birthday_notification_offset_days" SET NOT NULL;
