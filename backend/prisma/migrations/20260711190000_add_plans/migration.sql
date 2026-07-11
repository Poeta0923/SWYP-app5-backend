-- CreateTable
CREATE TABLE "plans" (
    "code" "UserPlan" NOT NULL,
    "max_people" INTEGER,
    "storage_limit_mb" INTEGER NOT NULL,
    "price_monthly" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- MVP 요금제 카탈로그 시드. max_people NULL = 무제한, storage_limit_mb는 MB 단위, price_monthly는 원 단위.
INSERT INTO "plans" ("code", "max_people", "storage_limit_mb", "price_monthly", "updated_at") VALUES
    ('Basic', 50, 300, 0, CURRENT_TIMESTAMP),
    ('Pro', NULL, 5120, 4900, CURRENT_TIMESTAMP),
    ('Premium', NULL, 30720, 9900, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
