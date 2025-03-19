/**
 * Batch Processing Manager
 *
 * Provides a unified interface for managing and coordinating different types of task processors.
 * Handles task scheduling, coordination between dependent tasks, and processor lifecycle.
 */
import { db } from "../db";
import { BatchType, JobStatus } from "../db/models/db";
import { batchStatusChanged } from "../topics";
import { processNextDocumentTasks } from "./documents";
import { processNextMediaTasks } from "./media";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";

/**
 * Interface representing a task processor
 */
interface TaskProcessor {
  type: BatchType;
  processFunction: (limit: number) => Promise<{ processed: number }>;
  maxConcurrentTasks?: number;
  defaultPriority?: number;
}

type BatchSummary = {
  id: string;
  name?: string;
  batchType: BatchType;
  status: JobStatus;
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    queued: number;
    processing: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Registry of available task processors
 */
const processors: Record<BatchType, TaskProcessor> = {
  [BatchType.MEDIA]: {
    type: BatchType.MEDIA,
    processFunction: (limit) => processNextMediaTasks({ limit }),
    maxConcurrentTasks: 5,
    defaultPriority: 10,
  },
  [BatchType.DOCUMENT]: {
    type: BatchType.DOCUMENT,
    processFunction: (limit) => processNextDocumentTasks({ limit }),
    maxConcurrentTasks: 10,
    defaultPriority: 5,
  },
  [BatchType.TRANSCRIPTION]: {
    type: BatchType.TRANSCRIPTION,
    // Placeholder - will be implemented later
    processFunction: async () => ({ processed: 0 }),
    maxConcurrentTasks: 3,
    defaultPriority: 8,
  },
};

/**
 * Process tasks across all registered processors
 */
export const processAllTaskTypes = api(
  {
    method: "POST",
    path: "/batch/process-all",
    expose: true,
  },
  async (params: {
    /**
     * Processor types to run (defaults to all)
     */
    types?: BatchType[];

    /**
     * Maximum tasks per processor
     */
    tasksPerProcessor?: number;
  }): Promise<{
    results: Record<string, { processed: number }>;
  }> => {
    const {
      types = Object.keys(processors) as BatchType[],
      tasksPerProcessor = 5,
    } = params;

    log.info(`Processing tasks for processor types: ${types.join(", ")}`);

    const results: Record<string, { processed: number }> = {};

    // Process each registered processor
    for (const type of types) {
      if (!processors[type]) {
        log.warn(`Unknown processor type: ${type}`);
        continue;
      }

      const processor = processors[type];
      const limit = Math.min(
        tasksPerProcessor,
        processor.maxConcurrentTasks || 5,
      );

      try {
        log.info(`Processing ${limit} tasks of type ${type}`);
        const result = await processor.processFunction(limit);
        results[type] = result;

        if (result.processed > 0) {
          log.info(`Processed ${result.processed} tasks of type ${type}`);
        }
      } catch (error) {
        log.error(`Error processing tasks of type ${type}`, {
          error: error instanceof Error ? error.message : String(error),
          BatchType: type,
        });

        results[type] = { processed: 0 };
      }
    }

    return { results };
  },
);

/**
 * Process all task types without parameters - wrapper for cron job
 * // TODO: TEST THIS
 */
export const processAllTaskTypesCronTarget = api(
  {
    method: "POST",
    path: "/batch/tasks/process-all/cron",
    expose: false,
  },
  async () => {
    // Call with default parameters
    return processAllTaskTypes({ tasksPerProcessor: 5 });
  },
);

/**
 * Get status of all active batches across processor types
 */
export const getAllBatchStatus = api(
  {
    method: "GET",
    path: "/batch/status",
    expose: true,
  },
  async (params: {
    /**
     * Limit of batches to return per type
     */
    limit?: number;

    /**
     * Filter by status
     */
    status?: JobStatus;
  }): Promise<{
    activeBatches: Record<string, Array<BatchSummary>>;
  }> => {
    const { limit = 10, status } = params;
    // Get all active batches
    const batches = await db.processingBatch.findMany({
      where: {
        status: status || {
          notIn: [JobStatus.COMPLETED, JobStatus.FAILED],
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit * 3, // Fetch more and will group by type with limit per type
    });

    // Group batches by type
    const batchesByType: Record<string, Array<BatchSummary>> = {};

    for (const batch of batches) {
      if (!batchesByType[batch.batchType]) {
        batchesByType[batch.batchType] = [];
      }

      if (batchesByType[batch.batchType].length < limit) {
        batchesByType[batch.batchType].push({
          id: batch.id,
          name: batch.name || undefined,
          batchType: batch.batchType,
          status: batch.status,
          taskSummary: {
            total: batch.totalTasks,
            completed: batch.completedTasks,
            failed: batch.failedTasks,
            queued: batch.queuedTasks,
            processing: batch.processingTasks,
          },
          createdAt: batch.createdAt,
          updatedAt: batch.updatedAt,
        });
      }
    }

    return { activeBatches: batchesByType };
  },
);

/**
 * Update status for a batch and publish event when status changes
 */
export const updateBatchStatus = api(
  {
    method: "POST",
    path: "/batch/:batchId/status",
    expose: false, // Internal API
  },
  async (params: {
    batchId: string;
    status: JobStatus;
  }): Promise<{
    success: boolean;
    previousStatus?: JobStatus;
  }> => {
    const { batchId, status } = params;

    try {
      // Get the current batch first
      const batch = await db.processingBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw APIError.notFound(`Batch with ID ${batchId} not found`);
      }

      // Only update if the status is different
      if (batch.status === status) {
        return {
          success: true,
          previousStatus: batch.status,
        };
      }

      // Update the batch status
      const updatedBatch = await db.processingBatch.update({
        where: { id: batchId },
        data: { status },
      });

      // Publish status changed event
      await batchStatusChanged.publish({
        batchId,
        status: status,
        taskSummary: {
          total: updatedBatch.totalTasks,
          completed: updatedBatch.completedTasks,
          failed: updatedBatch.failedTasks,
          queued: updatedBatch.queuedTasks,
          processing: updatedBatch.processingTasks,
        },
        timestamp: new Date(),
        sourceService: "batch",
      });

      log.info(
        `Updated batch ${batchId} status from ${batch.status} to ${status}`,
      );

      return {
        success: true,
        previousStatus: batch.status,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to update batch ${batchId} status`, {
        batchId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to update batch status");
    }
  },
);

/**
 * Retry failed tasks in a batch
 */
export const retryFailedTasks = api(
  {
    method: "POST",
    path: "/batch/:batchId/retry",
    expose: true,
  },
  async (params: {
    batchId: string;
    limit?: number;
  }): Promise<{
    retriedCount: number;
  }> => {
    const { batchId, limit = 10 } = params;

    try {
      // Find the batch first
      const batch = await db.processingBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw APIError.notFound(`Batch with ID ${batchId} not found`);
      }

      // Find failed tasks that haven't exceeded max retries
      const failedTasks = await db.processingTask.findMany({
        where: {
          batchId,
          status: JobStatus.FAILED,
          retryCount: { lt: db.processingTask.fields.maxRetries },
        },
        take: limit,
      });

      if (failedTasks.length === 0) {
        return { retriedCount: 0 };
      }

      // Reset tasks to queued status
      let retriedCount = 0;
      for (const task of failedTasks) {
        await db.processingTask.update({
          where: { id: task.id },
          data: {
            status: JobStatus.QUEUED,
            retryCount: { increment: 1 },
            error: null,
          },
        });
        retriedCount++;
      }

      // Update batch counts
      await db.processingBatch.update({
        where: { id: batchId },
        data: {
          queuedTasks: { increment: retriedCount },
          failedTasks: { decrement: retriedCount },
          status:
            (
              batch.status === JobStatus.FAILED ||
              batch.status === JobStatus.COMPLETED_WITH_ERRORS
            ) ?
              JobStatus.PROCESSING
            : batch.status,
        },
      });

      log.info(`Retried ${retriedCount} failed tasks in batch ${batchId}`);

      return { retriedCount };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to retry tasks in batch ${batchId}`, {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to retry tasks");
    }
  },
);

/**
 * Cancel a batch and all its pending tasks
 */
export const cancelBatch = api(
  {
    method: "POST",
    path: "/batch/:batchId/cancel",
    expose: true,
  },
  async (params: {
    batchId: string;
  }): Promise<{
    success: boolean;
    canceledTasks: number;
  }> => {
    const { batchId } = params;

    try {
      // Find the batch first
      const batch = await db.processingBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw APIError.notFound(`Batch with ID ${batchId} not found`);
      }

      // Only allow canceling batches that are not completed or failed
      if (
        batch.status === JobStatus.COMPLETED ||
        batch.status === JobStatus.FAILED
      ) {
        throw APIError.invalidArgument(
          `Cannot cancel batch with status ${batch.status}`,
        );
      }

      // Find tasks that can be canceled (queued or processing)
      const pendingTasks = await db.processingTask.findMany({
        where: {
          batchId,
          status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] },
        },
      });

      // Cancel all pending tasks
      for (const task of pendingTasks) {
        await db.processingTask.update({
          where: { id: task.id },
          data: {
            status: JobStatus.FAILED,
            error: "Canceled by user",
            completedAt: new Date(),
          },
        });
      }

      // Update batch status
      await db.processingBatch.update({
        where: { id: batchId },
        data: {
          status: JobStatus.FAILED,
          queuedTasks: 0,
          processingTasks: 0,
          failedTasks: batch.failedTasks + pendingTasks.length,
        },
      });

      // Publish status changed event
      await batchStatusChanged.publish({
        batchId,
        status: JobStatus.FAILED,
        taskSummary: {
          total: batch.totalTasks,
          completed: batch.completedTasks,
          failed: batch.failedTasks + pendingTasks.length,
          queued: 0,
          processing: 0,
        },
        timestamp: new Date(),
        sourceService: "batch",
      });

      log.info(
        `Canceled batch ${batchId} with ${pendingTasks.length} pending tasks`,
      );

      return {
        success: true,
        canceledTasks: pendingTasks.length,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to cancel batch ${batchId}`, {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to cancel batch");
    }
  },
);

/**
 * Scheduled job to process tasks across all processor types
 */
export const processAllTasksCron = new CronJob("process-all-tasks", {
  title: "Process tasks across all processors",
  schedule: "*/2 * * * *", // Every 2 minutes
  endpoint: processAllTaskTypesCronTarget,
});
