ALTER TABLE "records" ADD COLUMN "schedule_id" TEXT;

CREATE UNIQUE INDEX "records_schedule_id_key" ON "records"("schedule_id");

ALTER TABLE "records" ADD CONSTRAINT "records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
