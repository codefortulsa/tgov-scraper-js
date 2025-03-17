/**
 * Batch Processing Module
 *
 * Provides a unified system for batch task processing with:
 * - Task queuing and scheduling
 * - Asynchronous processing via pub/sub events
 * - Task dependency management
 * - Automatic retries and failure handling
 */
import { db } from "./data";
import { taskCompleted } from "./topics";

import {
  BatchStatus,
  BatchType,
  TaskStatus,
  TaskType,
} from "@prisma/client/batch/index.js";

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";

// Export processor implementations
export * from "./processors/media";
export * from "./processors/documents";
export * from "./processors/transcription";
export * from "./processors/manager";

/**
 * Create a new task for batch processing
 */
export const createTask = api(
  {
    method: "POST",
    path: "/batch/task",
    expose: true,
  },
  async (params: {
    /**
     * Batch ID to associate the task with
     */
    batchId?: string;

    /**
     * Type of task to create
     */
    taskType: TaskType;

    /**
     * Task input data (specific to task type)
     */
    input: PrismaJson.TaskInputJSON;

    /**
     * Optional task priority (higher numbers = higher priority)
     */
    priority?: number;

    /**
     * Optional meeting record ID for association
     */
    meetingRecordId?: string;

    /**
     * Optional dependencies (task IDs that must complete first)
     */
    dependsOn?: string[];
  }): Promise<{
    taskId: string;
  }> => {
    const {
      batchId,
      taskType,
      input,
      priority = 0,
      meetingRecordId,
      dependsOn = [],
    } = params;

    try {
      // If batchId is provided, verify it exists
      if (batchId) {
        const batch = await db.processingBatch.findUnique({
          where: { id: batchId },
        });

        if (!batch) {
          throw APIError.notFound(`Batch with ID ${batchId} not found`);
        }
      }

      // Create the task
      const task = await db.processingTask.create({
        data: {
          batchId,
          taskType,
          status: TaskStatus.QUEUED,
          priority,
          input,
          meetingRecordId,
          // Create dependencies if provided
          dependsOn:
            dependsOn.length > 0 ?
              {
                createMany: {
                  data: dependsOn.map((depId) => ({
                    dependencyTaskId: depId,
                  })),
                },
              }
            : undefined,
        },
      });

      // If task belongs to a batch, update batch counts
      if (batchId) {
        await db.processingBatch.update({
          where: { id: batchId },
          data: {
            totalTasks: { increment: 1 },
            queuedTasks: { increment: 1 },
          },
        });
      }

      log.info(`Created task ${task.id} of type ${taskType}`, {
        taskId: task.id,
        taskType,
        batchId,
        meetingRecordId,
      });

      return { taskId: task.id };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to create task of type ${taskType}`, {
        taskType,
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to create task");
    }
  },
);

/**
 * Create a new batch for processing
 */
export const createBatch = api(
  {
    method: "POST",
    path: "/batch",
    expose: true,
  },
  async (params: {
    /**
     * Type of batch (media, document, transcription, etc.)
     */
    batchType: BatchType;

    /**
     * Optional name for the batch
     */
    name?: string;

    /**
     * Optional priority (higher numbers = higher priority)
     */
    priority?: number;

    /**
     * Optional metadata for the batch
     */
    metadata?: PrismaJson.BatchMetadataJSON;
  }): Promise<{
    batchId: string;
  }> => {
    const { batchType, name, priority = 0, metadata } = params;

    try {
      const batch = await db.processingBatch.create({
        data: {
          batchType,
          name,
          status: BatchStatus.QUEUED,
          priority,
          metadata,
          totalTasks: 0,
          queuedTasks: 0,
          processingTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
        },
      });

      log.info(`Created batch ${batch.id} of type ${batchType}`, {
        batchId: batch.id,
        batchType,
        name,
      });

      return { batchId: batch.id };
    } catch (error) {
      log.error(`Failed to create batch of type ${batchType}`, {
        batchType,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to create batch");
    }
  },
);

/**
 * Get batch status and task information
 */
export const getBatchStatus = api(
  {
    method: "GET",
    path: "/batch/:batchId",
    expose: true,
  },
  async (params: {
    batchId: string;
    includeTasks?: boolean;
    taskStatus?: TaskStatus | TaskStatus[];
    taskLimit?: number;
  }): Promise<{
    batch: {
      id: string;
      name?: string;
      batchType: BatchType;
      status: string;
      priority: number;
      metadata?: PrismaJson.BatchMetadataJSON;
      createdAt: Date;
      updatedAt: Date;
      totalTasks: number;
      queuedTasks: number;
      processingTasks: number;
      completedTasks: number;
      failedTasks: number;
    };
    tasks?: Array<{
      id: string;
      taskType: TaskType;
      status: string;
      priority: number;
      input: PrismaJson.TaskInputJSON;
      output?: PrismaJson.TaskOutputJSON;
      error?: string;
      createdAt: Date;
      updatedAt: Date;
      completedAt?: Date;
      retryCount: number;
      meetingRecordId?: string;
    }>;
  }> => {
    const {
      batchId,
      includeTasks = false,
      taskStatus,
      taskLimit = 100,
    } = params;

    try {
      // Get the batch
      const batch = await db.processingBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw APIError.notFound(`Batch with ID ${batchId} not found`);
      }

      // If tasks are requested, fetch them
      let tasks;
      if (includeTasks) {
        const where = {
          batchId,
          // Filter by task status if provided
          ...(taskStatus && {
            status: Array.isArray(taskStatus) ? { in: taskStatus } : taskStatus,
          }),
        };

        tasks = await db.processingTask.findMany({
          where,
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take: taskLimit,
        });
      }

      return {
        batch: {
          id: batch.id,
          name: batch.name || undefined,
          batchType: batch.batchType,
          status: batch.status,
          priority: batch.priority,
          metadata: batch.metadata ?? undefined,
          createdAt: batch.createdAt,
          updatedAt: batch.updatedAt,
          totalTasks: batch.totalTasks,
          queuedTasks: batch.queuedTasks,
          processingTasks: batch.processingTasks,
          completedTasks: batch.completedTasks,
          failedTasks: batch.failedTasks,
        },
        tasks: tasks?.map((task) => ({
          id: task.id,
          taskType: task.taskType,
          status: task.status,
          priority: task.priority,
          input: task.input,
          output: task.output || undefined,
          error: task.error || undefined,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          completedAt: task.completedAt || undefined,
          retryCount: task.retryCount,
          meetingRecordId: task.meetingRecordId || undefined,
        })),
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to get batch ${batchId} status`, {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to get batch status");
    }
  },
);

/**
 * Utility function to update the status of a task and handle batch counters
 */
export async function updateTaskStatus(params: {
  taskId: string;
  status: TaskStatus;
  output?: PrismaJson.TaskOutputJSON;
  error?: string;
}): Promise<void> {
  const { taskId, status, output, error } = params;

  // Start a transaction for updating task and batch
  try {
    await db.$transaction(async (tx) => {
      // Get the current task
      const task = await tx.processingTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      const oldStatus = task.status;

      if (oldStatus === status) {
        log.debug(`Task ${taskId} already has status ${status}`, {
          taskId,
          status,
        });
        return;
      }

      // Update the task
      const updatedTask = await tx.processingTask.update({
        where: { id: taskId },
        data: {
          status,
          output: output !== undefined ? output : undefined,
          error: error !== undefined ? error : undefined,
          completedAt:
            status === TaskStatus.COMPLETED || TaskStatus.FAILED ?
              new Date()
            : undefined,
        },
      });

      // If the task belongs to a batch, update batch counters
      if (task.batchId) {
        const updateData: any = {};

        // Decrement counter for old status
        if (oldStatus === TaskStatus.QUEUED) {
          updateData.queuedTasks = { decrement: 1 };
        } else if (oldStatus === TaskStatus.PROCESSING) {
          updateData.processingTasks = { decrement: 1 };
        }

        // Increment counter for new status
        if (status === TaskStatus.QUEUED) {
          updateData.queuedTasks = { increment: 1 };
        } else if (status === TaskStatus.PROCESSING) {
          updateData.processingTasks = { increment: 1 };
        } else if (status === TaskStatus.COMPLETED) {
          updateData.completedTasks = { increment: 1 };
        } else if (TaskStatus.FAILED) {
          updateData.failedTasks = { increment: 1 };
        }

        // Update the batch
        await tx.processingBatch.update({
          where: { id: task.batchId },
          data: updateData,
        });

        // Check if the batch is now complete
        const batch = await tx.processingBatch.findUnique({
          where: { id: task.batchId },
          select: {
            totalTasks: true,
            completedTasks: true,
            failedTasks: true,
            queuedTasks: true,
            processingTasks: true,
            status: true,
          },
        });

        if (batch) {
          // Update batch status based on task completion
          if (
            batch.totalTasks > 0 &&
            batch.completedTasks + batch.failedTasks === batch.totalTasks
          ) {
            // All tasks are either completed or failed
            let batchStatus: BatchStatus;

            if (batch.failedTasks === 0) {
              batchStatus = BatchStatus.COMPLETED; // All tasks completed successfully
            } else if (batch.completedTasks === 0) {
              batchStatus = BatchStatus.FAILED; // All tasks failed
            } else {
              batchStatus = BatchStatus.COMPLETED_WITH_ERRORS; // Mixed results
            }

            // Only update if status has changed
            if (batch.status !== batchStatus) {
              await tx.processingBatch.update({
                where: { id: task.batchId },
                data: { status: batchStatus },
              });
            }
          }
        }
      }

      // For completed or failed tasks, publish an event
      if (status === TaskStatus.COMPLETED || TaskStatus.FAILED) {
        await taskCompleted.publish({
          taskId,
          taskType: task.taskType,
          batchId: task.batchId,
          status,
          success: status === TaskStatus.COMPLETED,
          output: output,
          errorMessage: error,
          resourceIds: getResourceIds(output),
          timestamp: new Date(),
          sourceService: "batch",
        });
      }

      log.info(`Updated task ${taskId} status from ${oldStatus} to ${status}`, {
        taskId,
        oldStatus,
        newStatus: status,
        batchId: task.batchId,
      });
    });
  } catch (error) {
    log.error(`Failed to update task ${taskId} status to ${status}`, {
      taskId,
      status,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new Error(
      `Failed to update task status: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract important resource IDs from task output for event notifications
 */
function getResourceIds(
  output?: PrismaJson.TaskOutputJSON,
): Record<string, string> {
  if (!output) return {};

  const resourceMap: Record<string, string> = {};

  // Extract common resource IDs that might be present
  const resourceFields = [
    "id",
    "audioId",
    "videoId",
    "transcriptionId",
    "documentId",
    "meetingId",
    "meetingRecordId",
    "diarizationId",
  ] as const;

  for (const field of resourceFields) {
    const key = field as keyof typeof output;
    if (field in output && typeof output[key] === "string") {
      resourceMap[key] = output[key];
    }
  }

  return resourceMap;
}
