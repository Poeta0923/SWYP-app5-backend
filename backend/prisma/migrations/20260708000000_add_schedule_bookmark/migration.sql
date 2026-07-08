ALTER TABLE "schedules" ADD COLUMN "book_mark" BOOLEAN NOT NULL DEFAULT false;

UPDATE "schedules"
SET "book_mark" = false
WHERE "book_mark" IS DISTINCT FROM false;
