CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "notification_job_id" TEXT,
  "schedule_id" TEXT,
  "person_id" TEXT,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_sent_at_idx" ON "notifications"("user_id", "sent_at");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX "notifications_notification_job_id_idx" ON "notifications"("notification_job_id");
CREATE INDEX "notifications_schedule_id_idx" ON "notifications"("schedule_id");
CREATE INDEX "notifications_person_id_idx" ON "notifications"("person_id");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_schedule_id_fkey"
  FOREIGN KEY ("schedule_id")
  REFERENCES "schedules"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_person_id_fkey"
  FOREIGN KEY ("person_id")
  REFERENCES "people"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
