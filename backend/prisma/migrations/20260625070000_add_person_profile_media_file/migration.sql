-- AlterEnum
ALTER TYPE "MediaFileUsage" ADD VALUE 'PERSON_PROFILE';

-- AlterTable
ALTER TABLE "people" DROP COLUMN "image",
ADD COLUMN "profile_image_file_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "people_profile_image_file_id_key" ON "people"("profile_image_file_id");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_profile_image_file_id_fkey" FOREIGN KEY ("profile_image_file_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
