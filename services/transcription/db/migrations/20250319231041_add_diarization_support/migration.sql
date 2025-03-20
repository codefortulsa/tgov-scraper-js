-- AlterTable
ALTER TABLE "Transcription" ADD COLUMN     "diarized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TranscriptionJob" ADD COLUMN     "diarizationModel" TEXT,
ADD COLUMN     "enableDiarization" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TranscriptionSegment" ADD COLUMN     "speakerId" TEXT;

-- CreateTable
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "transcriptionId" TEXT NOT NULL,

    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TranscriptionSegment" ADD CONSTRAINT "TranscriptionSegment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "Transcription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
