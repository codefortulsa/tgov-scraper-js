/*
  Warnings:

  - The values [MEDIA_AUDIO_TRANSCRIBE,TRANSCRIPTION_FORMAT,TRANSCRIPTION_DIARIZE] on the enum `TaskType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TaskType_new" AS ENUM ('DOCUMENT_DOWNLOAD', 'DOCUMENT_CONVERT', 'DOCUMENT_EXTRACT', 'DOCUMENT_PARSE', 'AGENDA_DOWNLOAD', 'MEDIA_VIDEO_DOWNLOAD', 'MEDIA_VIDEO_PROCESS', 'MEDIA_AUDIO_EXTRACT', 'AUDIO_TRANSCRIBE', 'SPEAKER_DIARIZE', 'TRANSCRIPT_FORMAT');
ALTER TABLE "ProcessingTask" ALTER COLUMN "taskType" TYPE "TaskType_new" USING ("taskType"::text::"TaskType_new");
ALTER TYPE "TaskType" RENAME TO "TaskType_old";
ALTER TYPE "TaskType_new" RENAME TO "TaskType";
DROP TYPE "TaskType_old";
COMMIT;
