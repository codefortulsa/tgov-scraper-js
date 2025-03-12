-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "url" TEXT,
    "srcUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingRecordId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "fileSize" INTEGER,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
