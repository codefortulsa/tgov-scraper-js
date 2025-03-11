/*
  Warnings:

  - You are about to drop the column `agendaUrl` on the `MeetingRecord` table. All the data in the column will be lost.
  - You are about to drop the column `videoUrl` on the `MeetingRecord` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MeetingRecord" DROP COLUMN "agendaUrl",
DROP COLUMN "videoUrl",
ADD COLUMN     "agendaId" TEXT,
ADD COLUMN     "audioId" TEXT,
ADD COLUMN     "videoId" TEXT;

-- CreateTable
CREATE TABLE "Blob" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "url" TEXT,
    "srcUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoProcessingBatch" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalTasks" INTEGER NOT NULL,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoProcessingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoProcessingTask" (
    "id" TEXT NOT NULL,
    "viewerUrl" TEXT,
    "downloadUrl" TEXT,
    "status" TEXT NOT NULL,
    "extractAudio" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT,
    "meetingRecordId" TEXT,
    "videoId" TEXT,
    "audioId" TEXT,

    CONSTRAINT "VideoProcessingTask_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProcessingTask" ADD CONSTRAINT "VideoProcessingTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "VideoProcessingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProcessingTask" ADD CONSTRAINT "VideoProcessingTask_meetingRecordId_fkey" FOREIGN KEY ("meetingRecordId") REFERENCES "MeetingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProcessingTask" ADD CONSTRAINT "VideoProcessingTask_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProcessingTask" ADD CONSTRAINT "VideoProcessingTask_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
