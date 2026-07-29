-- CreateTable
CREATE TABLE "record_transcript_segments" (
    "user_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker_tag" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "record_transcript_segments_pkey" PRIMARY KEY ("record_id","seq")
);

-- CreateIndex
CREATE INDEX "record_transcript_segments_user_id_idx" ON "record_transcript_segments"("user_id");

-- AddForeignKey
ALTER TABLE "record_transcript_segments" ADD CONSTRAINT "record_transcript_segments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_transcript_segments" ADD CONSTRAINT "record_transcript_segments_record_id_user_id_fkey" FOREIGN KEY ("record_id", "user_id") REFERENCES "records"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
