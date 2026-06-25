-- CreateEnum
CREATE TYPE "MediaFileType" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaFileUsage" AS ENUM ('BUSINESS_CARD_FRONT', 'BUSINESS_CARD_BACK', 'RECORD_VOICE');

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "MediaFileType" NOT NULL,
    "usage" "MediaFileUsage" NOT NULL,
    "bucket" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "business_cards" DROP COLUMN "image",
ADD COLUMN "front_image_file_id" TEXT,
ADD COLUMN "back_image_file_id" TEXT;

-- AlterTable
ALTER TABLE "records" DROP COLUMN "voice_file",
ADD COLUMN "voice_file_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "media_files_s3_key_key" ON "media_files"("s3_key");

-- CreateIndex
CREATE INDEX "media_files_user_id_idx" ON "media_files"("user_id");

-- CreateIndex
CREATE INDEX "media_files_user_id_usage_idx" ON "media_files"("user_id", "usage");

-- CreateIndex
CREATE UNIQUE INDEX "business_cards_front_image_file_id_key" ON "business_cards"("front_image_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_cards_back_image_file_id_key" ON "business_cards"("back_image_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "records_voice_file_id_key" ON "records"("voice_file_id");

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_front_image_file_id_fkey" FOREIGN KEY ("front_image_file_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_back_image_file_id_fkey" FOREIGN KEY ("back_image_file_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_voice_file_id_fkey" FOREIGN KEY ("voice_file_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
