-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('TEXT', 'VOICE');

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "birth_date" DATE,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "phone_number" TEXT,
    "job" TEXT,
    "company" TEXT,
    "relationship" TEXT,
    "personality" TEXT,
    "birthday_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extra_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '제목 없음',
    "content" TEXT,
    "schedule_time" TIMESTAMP(3),
    "reminder_time" TIMESTAMP(3),
    "notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "RecordType" NOT NULL DEFAULT 'TEXT',
    "title" TEXT NOT NULL DEFAULT '제목 없음',
    "content" TEXT,
    "voice_file" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_people" (
    "user_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,

    CONSTRAINT "schedule_people_pkey" PRIMARY KEY ("schedule_id","person_id")
);

-- CreateTable
CREATE TABLE "record_people" (
    "user_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,

    CONSTRAINT "record_people_pkey" PRIMARY KEY ("record_id","person_id")
);

-- CreateTable
CREATE TABLE "record_keywords" (
    "user_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "record_keywords_pkey" PRIMARY KEY ("record_id","name")
);

-- CreateIndex
CREATE INDEX "people_user_id_idx" ON "people"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_id_user_id_key" ON "people"("id", "user_id");

-- CreateIndex
CREATE INDEX "business_cards_user_id_idx" ON "business_cards"("user_id");

-- CreateIndex
CREATE INDEX "business_cards_person_id_idx" ON "business_cards"("person_id");

-- CreateIndex
CREATE INDEX "extra_contacts_user_id_idx" ON "extra_contacts"("user_id");

-- CreateIndex
CREATE INDEX "extra_contacts_person_id_idx" ON "extra_contacts"("person_id");

-- CreateIndex
CREATE INDEX "schedules_user_id_idx" ON "schedules"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_id_user_id_key" ON "schedules"("id", "user_id");

-- CreateIndex
CREATE INDEX "records_user_id_idx" ON "records"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "records_id_user_id_key" ON "records"("id", "user_id");

-- CreateIndex
CREATE INDEX "schedule_people_user_id_idx" ON "schedule_people"("user_id");

-- CreateIndex
CREATE INDEX "schedule_people_person_id_idx" ON "schedule_people"("person_id");

-- CreateIndex
CREATE INDEX "record_people_user_id_idx" ON "record_people"("user_id");

-- CreateIndex
CREATE INDEX "record_people_person_id_idx" ON "record_people"("person_id");

-- CreateIndex
CREATE INDEX "record_keywords_user_id_idx" ON "record_keywords"("user_id");

-- CreateIndex
CREATE INDEX "record_keywords_user_id_name_idx" ON "record_keywords"("user_id", "name");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_person_id_user_id_fkey" FOREIGN KEY ("person_id", "user_id") REFERENCES "people"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_contacts" ADD CONSTRAINT "extra_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_contacts" ADD CONSTRAINT "extra_contacts_person_id_user_id_fkey" FOREIGN KEY ("person_id", "user_id") REFERENCES "people"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_people" ADD CONSTRAINT "schedule_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_people" ADD CONSTRAINT "schedule_people_schedule_id_user_id_fkey" FOREIGN KEY ("schedule_id", "user_id") REFERENCES "schedules"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_people" ADD CONSTRAINT "schedule_people_person_id_user_id_fkey" FOREIGN KEY ("person_id", "user_id") REFERENCES "people"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_person_id_user_id_fkey" FOREIGN KEY ("person_id", "user_id") REFERENCES "people"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_keywords" ADD CONSTRAINT "record_keywords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_keywords" ADD CONSTRAINT "record_keywords_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
