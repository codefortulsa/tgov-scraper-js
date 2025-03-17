-- DropForeignKey
ALTER TABLE "ProcessingTask" DROP CONSTRAINT "ProcessingTask_batchId_fkey";

-- AlterTable
ALTER TABLE "ProcessingTask" ALTER COLUMN "batchId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ProcessingTask" ADD CONSTRAINT "ProcessingTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProcessingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
