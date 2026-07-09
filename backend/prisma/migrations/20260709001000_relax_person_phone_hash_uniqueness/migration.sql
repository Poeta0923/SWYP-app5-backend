DROP INDEX IF EXISTS "people_user_id_phone_number_hash_key";

CREATE INDEX IF NOT EXISTS "people_user_id_phone_number_hash_idx" ON "people"("user_id", "phone_number_hash");
