ALTER TABLE "records" ADD COLUMN "book_mark" BOOLEAN NOT NULL DEFAULT false;

UPDATE "records"
SET "book_mark" = false
WHERE "book_mark" IS DISTINCT FROM false;
