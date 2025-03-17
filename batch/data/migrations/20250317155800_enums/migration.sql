/*
  Warnings:

  - The `eventTypes` column on the `WebhookSubscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `batchType` on the `ProcessingBatch` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `ProcessingBatch` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `taskType` on the `ProcessingTask` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `ProcessingTask` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('MEDIA', 'DOCUMENT', 'TRANSCRIPTION');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('TRANSCRIBE', 'EXTRACT_TEXT', 'EXTRACT_METADATA');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('BATCH_CREATED', 'TASK_COMPLETED', 'BATCH_STATUS_CHANGED');

-- AlterTable
ALTER TABLE "ProcessingBatch" DROP COLUMN "batchType",
ADD COLUMN     "batchType" "BatchType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "BatchStatus" NOT NULL;

-- AlterTable
ALTER TABLE "ProcessingTask" DROP COLUMN "taskType",
ADD COLUMN     "taskType" "TaskType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TaskStatus" NOT NULL;

-- AlterTable
ALTER TABLE "WebhookSubscription" DROP COLUMN "eventTypes",
ADD COLUMN     "eventTypes" "EventType"[];

-- CreateIndex
CREATE INDEX "ProcessingBatch_status_priority_createdAt_idx" ON "ProcessingBatch"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingTask_batchId_status_idx" ON "ProcessingTask"("batchId", "status");

-- CreateIndex
CREATE INDEX "ProcessingTask_status_priority_createdAt_idx" ON "ProcessingTask"("status", "priority", "createdAt");
