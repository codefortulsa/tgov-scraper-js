-- CreateTable
CREATE TABLE "ProcessingBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "batchType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "queuedTasks" INTEGER NOT NULL DEFAULT 0,
    "processingTasks" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingTask" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "meetingRecordId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "dependentTaskId" TEXT NOT NULL,
    "dependencyTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "eventTypes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessingBatch_status_priority_createdAt_idx" ON "ProcessingBatch"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingTask_batchId_status_idx" ON "ProcessingTask"("batchId", "status");

-- CreateIndex
CREATE INDEX "ProcessingTask_status_priority_createdAt_idx" ON "ProcessingTask"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingTask_meetingRecordId_idx" ON "ProcessingTask"("meetingRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_dependentTaskId_dependencyTaskId_key" ON "TaskDependency"("dependentTaskId", "dependencyTaskId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_active_idx" ON "WebhookSubscription"("active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_successful_idx" ON "WebhookDelivery"("webhookId", "successful");

-- CreateIndex
CREATE INDEX "WebhookDelivery_successful_scheduledFor_idx" ON "WebhookDelivery"("successful", "scheduledFor");

-- AddForeignKey
ALTER TABLE "ProcessingTask" ADD CONSTRAINT "ProcessingTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProcessingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependentTaskId_fkey" FOREIGN KEY ("dependentTaskId") REFERENCES "ProcessingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependencyTaskId_fkey" FOREIGN KEY ("dependencyTaskId") REFERENCES "ProcessingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
