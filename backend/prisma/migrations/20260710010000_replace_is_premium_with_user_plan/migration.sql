-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('Basic', 'Pro', 'Premium');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'Basic';

-- Backfill existing boolean premium state into the new plan enum.
UPDATE "users"
SET "plan" = CASE
    WHEN "isPremium" THEN 'Premium'::"UserPlan"
    ELSE 'Basic'::"UserPlan"
END;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "isPremium";
