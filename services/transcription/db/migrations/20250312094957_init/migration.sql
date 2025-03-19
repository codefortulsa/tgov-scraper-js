-- CreateTable
CREATE TABLE "Transcription" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT,
    "model" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "processingTime" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "audioFileId" TEXT NOT NULL,
    "meetingRecordId" TEXT,

    CONSTRAINT "Transcription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptionSegment" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "transcriptionId" TEXT NOT NULL,

    CONSTRAINT "TranscriptionSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptionJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "language" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "audioFileId" TEXT NOT NULL,
    "meetingRecordId" TEXT,
    "transcriptionId" TEXT,

    CONSTRAINT "TranscriptionJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TranscriptionSegment" ADD CONSTRAINT "TranscriptionSegment_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "Transcription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
