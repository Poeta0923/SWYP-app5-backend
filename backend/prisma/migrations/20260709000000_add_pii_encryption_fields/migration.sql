-- Store selected PII fields as application-level ciphertext while keeping API-facing names.
DROP INDEX IF EXISTS "users_email_key";

ALTER TABLE "users"
  ADD COLUMN "email_hash" TEXT;

ALTER TABLE "people"
  ADD COLUMN "phone_number_hash" TEXT,
  ADD COLUMN "birth_month" INTEGER,
  ADD COLUMN "birth_day" INTEGER,
  ALTER COLUMN "birth_date" TYPE TEXT USING "birth_date"::TEXT;

CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");
CREATE UNIQUE INDEX "people_user_id_phone_number_hash_key" ON "people"("user_id", "phone_number_hash");
