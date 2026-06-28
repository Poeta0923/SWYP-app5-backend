DELETE FROM "people" WHERE "phone_number" IS NULL;

ALTER TABLE "people" ALTER COLUMN "phone_number" SET NOT NULL;
