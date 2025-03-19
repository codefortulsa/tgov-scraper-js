/**
 * Batch Processing Module
 *
 * Provides a unified system for batch task processing with:
 * - Task queuing and scheduling
 * - Asynchronous processing via pub/sub events
 * - Task dependency management
 * - Automatic retries and failure handling
 */
import { db } from "./db";
import {
  $TaskType,
  BatchType,
  JobStatus,
  ProcessingTaskModel,
} from "./db/models/db";
import { ProcessingBatchDto, ProcessingTaskDto } from "./db/models/dto";
import { BatchMetadata, TaskInputJSON, TaskOutputJSON } from "./db/models/json";
import { taskCompleted } from "./topics";

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
  async (
    params: Omit<ProcessingTaskDto, "id" | "createdAt" | "updatedAt">,
  ): Promise<{
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

    if (input == null) {
      throw APIError.invalidArgument("Task input cannot be nullish");
    }

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
          input,
          batchId,
          taskType,
          status: JobStatus.QUEUED,
          meetingRecordId,
          priority,
          // Create dependencies if provided
          ...(dependsOn.length > 0 && {
            dependsOn: {
              createMany: {
                data: dependsOn.map((dep) => ({
                  dependencyTaskId: dep.dependencyTaskId,
                })),
              },
            },
          }),
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
  async (
    params: Pick<
      ProcessingBatchDto,
      "batchType" | "name" | "priority" | "metadata"
    >,
  ): Promise<{ batchId: string }> => {
    const { batchType, name, priority = 0, metadata } = params;

    try {
      const batch = await db.processingBatch.create({
        data: {
          batchType,
          name,
          status: JobStatus.QUEUED,
          priority,
          metadata: metadata ?? {},
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
    taskStatus?: JobStatus | JobStatus[];
    taskLimit?: number;
  }): Promise<{
    batch: {
      id: string;
      name?: string;
      batchType: BatchType;
      status: string;
      priority: number;
      metadata?: BatchMetadata;
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
      taskType: $TaskType;
      status: string;
      priority: number;
      input: TaskInputJSON;
      output?: TaskOutputJSON;
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
          metadata: batch.metadata || {},
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
  status: JobStatus;
  output?: TaskOutputJSON;
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
            status === JobStatus.COMPLETED || JobStatus.FAILED ?
              new Date()
            : undefined,
        },
      });

      // If the task belongs to a batch, update batch counters
      if (task.batchId) {
        const updateData: any = {};

        // Decrement counter for old status
        if (oldStatus === JobStatus.QUEUED) {
          updateData.queuedTasks = { decrement: 1 };
        } else if (oldStatus === JobStatus.PROCESSING) {
          updateData.processingTasks = { decrement: 1 };
        }

        // Increment counter for new status
        if (status === JobStatus.QUEUED) {
          updateData.queuedTasks = { increment: 1 };
        } else if (status === JobStatus.PROCESSING) {
          updateData.processingTasks = { increment: 1 };
        } else if (status === JobStatus.COMPLETED) {
          updateData.completedTasks = { increment: 1 };
        } else if (JobStatus.FAILED) {
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
            let batchStatus: JobStatus;

            if (batch.failedTasks === 0) {
              batchStatus = JobStatus.COMPLETED; // All tasks completed successfully
            } else if (batch.completedTasks === 0) {
              batchStatus = JobStatus.FAILED; // All tasks failed
            } else {
              batchStatus = JobStatus.COMPLETED_WITH_ERRORS; // Mixed results
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
      if (status === JobStatus.COMPLETED || JobStatus.FAILED) {
        await taskCompleted.publish({
          taskId,
          taskType: task.taskType,
          batchId: task.batchId,
          status,
          success: status === JobStatus.COMPLETED,
          // Only include error message for failed tasks
          ...(status === JobStatus.FAILED && error ?
            { errorMessage: error }
          : {}),
          // Extract only essential resource IDs from output
          resourceIds: getEssentialResourceIds(output),
          // Include meetingRecordId as it's commonly used for linking records
          meetingRecordId: task.meetingRecordId ?? undefined,
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
function getResourceIds(output?: TaskOutputJSON): Record<string, string> {
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

/**
 * Extract only essential resource IDs from task output for event notifications
 * This is an optimized version that only extracts the most critical identifiers
 * needed for dependent task processing
 */
function getEssentialResourceIds(
  output?: TaskOutputJSON,
): Record<string, string> {
  if (!output) return {};
  const resourceMap: Record<string, string> = {};

  // Extract only the most critical resource IDs
  // Subscribers can query the database for additional details if needed
  const essentialFields = [
    "transcriptionId",
    "audioId",
    "videoId",
    "documentId",
    "diarizationId",
  ] as const;

  for (const field of essentialFields) {
    const key = field as keyof typeof output;
    if (field in output && typeof output[key] === "string") {
      resourceMap[key] = output[key];
    }
  }

  return resourceMap;
}
