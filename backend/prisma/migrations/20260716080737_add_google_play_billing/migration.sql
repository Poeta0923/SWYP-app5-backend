-- CreateEnum
CREATE TYPE "GoogleSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELED', 'GRACE_PERIOD', 'ON_HOLD', 'PAUSED', 'EXPIRED', 'REVOKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RtdnEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "GoogleTransactionStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVOKED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "google_play_products" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "plan_code" "UserPlan" NOT NULL,
    "package_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_play_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_play_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "purchase_token" TEXT NOT NULL,
    "status" "GoogleSubscriptionStatus" NOT NULL,
    "linked_purchase_token" TEXT,
    "started_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "auto_renew_enabled" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "test_purchase" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_play_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_play_rtdn_events" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "package_name" TEXT,
    "purchase_token" TEXT,
    "notification_type" INTEGER,
    "event_time" TIMESTAMP(3),
    "status" "RtdnEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_play_rtdn_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_play_transactions" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "GoogleTransactionStatus" NOT NULL,
    "purchased_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "amount_micros" BIGINT,
    "currency_code" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_play_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_play_products_product_id_key" ON "google_play_products"("product_id");

-- CreateIndex
CREATE INDEX "google_play_products_plan_code_idx" ON "google_play_products"("plan_code");

-- CreateIndex
CREATE UNIQUE INDEX "google_play_subscriptions_purchase_token_key" ON "google_play_subscriptions"("purchase_token");

-- CreateIndex
CREATE INDEX "google_play_subscriptions_user_id_status_idx" ON "google_play_subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "google_play_subscriptions_status_expires_at_idx" ON "google_play_subscriptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "google_play_subscriptions_linked_purchase_token_idx" ON "google_play_subscriptions"("linked_purchase_token");

-- CreateIndex
CREATE UNIQUE INDEX "google_play_rtdn_events_message_id_key" ON "google_play_rtdn_events"("message_id");

-- CreateIndex
CREATE INDEX "google_play_rtdn_events_purchase_token_idx" ON "google_play_rtdn_events"("purchase_token");

-- CreateIndex
CREATE INDEX "google_play_rtdn_events_status_created_at_idx" ON "google_play_rtdn_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_play_transactions_order_id_key" ON "google_play_transactions"("order_id");

-- CreateIndex
CREATE INDEX "google_play_transactions_subscription_id_purchased_at_idx" ON "google_play_transactions"("subscription_id", "purchased_at");

-- AddForeignKey
ALTER TABLE "google_play_products" ADD CONSTRAINT "google_play_products_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_play_subscriptions" ADD CONSTRAINT "google_play_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_play_subscriptions" ADD CONSTRAINT "google_play_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "google_play_products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_play_transactions" ADD CONSTRAINT "google_play_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "google_play_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 구글 플레이 인앱 상품 카탈로그 시드. Basic은 무료라 상품 없음.
-- product_id는 Play Console 구독 상품 ID와 동일해야 검증/RTDN이 매칭된다.
INSERT INTO "google_play_products" ("id", "product_id", "plan_code", "package_name", "updated_at") VALUES
    (gen_random_uuid()::text, 'pro_monthly',     'Pro',     'app.linker.relation', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'premium_monthly', 'Premium', 'app.linker.relation', CURRENT_TIMESTAMP)
ON CONFLICT ("product_id") DO NOTHING;
