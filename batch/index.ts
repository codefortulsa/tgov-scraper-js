/**
 * Batch Service API Implementation
 * 
 * Provides centralized management of batch processing operations including:
 * - Creating and managing batches of tasks
 * - Processing tasks with dependencies
 * - Publishing events for completed operations
 */
import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";

import { db } from "./data";
import { batchCreated, taskCompleted, batchStatusChanged } from "./topics";

/**
 * Type definitions for batch operations
 */

/**
 * Represents a task to be processed
 */
export interface ProcessingTaskInput {
  /**
   * Type of task to perform
   */
  taskType: string;
  
  /**
   * Priority of the task (higher values = higher priority)
   */
  priority?: number;
  
  /**
   * Input data needed to process the task
   */
  input: Record<string, any>;
  
  /**
   * Optional meeting record ID associated with this task
   */
  meetingRecordId?: string;
  
  /**
   * IDs of tasks that must complete before this one can start
   */
  dependsOnTaskIds?: string[];
  
  /**
   * Maximum number of retries for this task
   */
  maxRetries?: number;
}

/**
 * Response format for task information
 */
export interface ProcessingTaskResponse {
  id: string;
  batchId: string;
  taskType: string;
  status: string;
  priority: number;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  meetingRecordId?: string;
  retryCount: number;
  maxRetries: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Summary of a batch's status
 */
export interface BatchSummary {
  id: string;
  name?: string;
  batchType: string;
  status: string;
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    queued: number;
    processing: number;
  };
  priority: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a new batch with the given tasks
 */
export const createBatch = api(
  {
    method: "POST",
    path: "/batch",
    expose: true,
  },
  async (params: {
    /**
     * Optional name for the batch
     */
    name?: string;
    
    /**
     * Type of batch being created
     */
    batchType: string;
    
    /**
     * Priority of the batch (higher values = higher priority)
     */
    priority?: number;
    
    /**
     * Additional metadata for the batch
     */
    metadata?: Record<string, any>;
    
    /**
     * Tasks to be included in this batch
     */
    tasks: ProcessingTaskInput[];
  }): Promise<{
    batchId: string;
    tasks: ProcessingTaskResponse[];
  }> => {
    const { name, batchType, priority = 0, metadata, tasks } = params;
    
    if (!tasks.length) {
      throw APIError.invalidArgument("At least one task is required");
    }
    
    try {
      // Create the batch and all tasks in a transaction
      const result = await db.$transaction(async (tx) => {
        // Create the batch first
        const batch = await tx.processingBatch.create({
          data: {
            name,
            batchType,
            status: "queued",
            priority,
            totalTasks: tasks.length,
            queuedTasks: tasks.length,
            metadata: metadata || {},
          },
        });
        
        // Create all tasks
        const createdTasks = await Promise.all(
          tasks.map(async (task) => {
            return tx.processingTask.create({
              data: {
                batchId: batch.id,
                taskType: task.taskType,
                status: "queued",
                priority: task.priority ?? priority,
                input: task.input,
                meetingRecordId: task.meetingRecordId,
                maxRetries: task.maxRetries ?? 3,
              },
            });
          })
        );
        
        // Set up task dependencies if specified
        const dependencyPromises: Promise<any>[] = [];
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          if (task.dependsOnTaskIds?.length) {
            // Find the actual task IDs in our created batch
            for (const depId of task.dependsOnTaskIds) {
              // Find the dependent task in our batch
              const dependencyTask = createdTasks.find(t => 
                // This works if the dependsOnTaskIds refers to indices in the input array
                // Otherwise, the caller needs to ensure these IDs are valid
                t.id === depId || createdTasks[parseInt(depId)]?.id
              );
              
              if (dependencyTask) {
                dependencyPromises.push(
                  tx.taskDependency.create({
                    data: {
                      dependentTaskId: createdTasks[i].id,
                      dependencyTaskId: dependencyTask.id,
                    },
                  })
                );
              }
            }
          }
        }
        
        if (dependencyPromises.length > 0) {
          await Promise.all(dependencyPromises);
        }
        
        return { batch, tasks: createdTasks };
      });
      
      // Publish batch created event
      await batchCreated.publish({
        batchId: result.batch.id,
        batchType,
        taskCount: tasks.length,
        metadata: metadata || {},
        timestamp: new Date(),
        sourceService: "batch",
      });
      
      log.info(`Created batch ${result.batch.id} with ${tasks.length} tasks`, {
        batchId: result.batch.id,
        batchType,
        taskCount: tasks.length,
      });
      
      // Format the response
      return {
        batchId: result.batch.id,
        tasks: result.tasks.map(task => ({
          id: task.id,
          batchId: task.batchId,
          taskType: task.taskType,
          status: task.status,
          priority: task.priority,
          input: task.input as Record<string, any>,
          output: task.output as Record<string, any> | undefined,
          error: task.error || undefined,
          meetingRecordId: task.meetingRecordId || undefined,
          retryCount: task.retryCount,
          maxRetries: task.maxRetries,
          startedAt: task.startedAt || undefined,
          completedAt: task.completedAt || undefined,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
      };
    } catch (error) {
      log.error("Failed to create batch", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to create batch");
    }
  }
);

/**
 * Gets the status and summary of a specific batch
 */
export const getBatchStatus = api(
  {
    method: "GET",
    path: "/batch/:batchId",
    expose: true,
  },
  async (params: {
    batchId: string;
    includeTaskDetails?: boolean;
  }): Promise<{
    batch: BatchSummary;
    tasks?: ProcessingTaskResponse[];
  }> => {
    const { batchId, includeTaskDetails = false } = params;
    
    try {
      // Get the batch with task counts
      const batch = await db.processingBatch.findUnique({
        where: { id: batchId },
      });
      
      if (!batch) {
        throw APIError.notFound(`Batch with ID ${batchId} not found`);
      }
      
      // Get task counts for summary
      const taskCounts = await db.processingTask.groupBy({
        by: ['status'],
        where: { batchId },
        _count: {
          id: true,
        },
      });
      
      // Create task summary
      const taskSummary = {
        total: batch.totalTasks,
        completed: batch.completedTasks,
        failed: batch.failedTasks,
        queued: batch.queuedTasks,
        processing: batch.processingTasks,
      };
      
      const batchSummary: BatchSummary = {
        id: batch.id,
        name: batch.name || undefined,
        batchType: batch.batchType,
        status: batch.status,
        taskSummary,
        priority: batch.priority,
        metadata: batch.metadata as Record<string, any> | undefined,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      };
      
      const response: { batch: BatchSummary; tasks?: ProcessingTaskResponse[] } = {
        batch: batchSummary,
      };
      
      // Include task details if requested
      if (includeTaskDetails) {
        const tasks = await db.processingTask.findMany({
          where: { batchId },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' },
          ],
        });
        
        response.tasks = tasks.map(task => ({
          id: task.id,
          batchId: task.batchId,
          taskType: task.taskType,
          status: task.status,
          priority: task.priority,
          input: task.input as Record<string, any>,
          output: task.output as Record<string, any> | undefined,
          error: task.error || undefined,
          meetingRecordId: task.meetingRecordId || undefined,
          retryCount: task.retryCount,
          maxRetries: task.maxRetries,
          startedAt: task.startedAt || undefined,
          completedAt: task.completedAt || undefined,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        }));
      }
      
      return response;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      
      log.error("Failed to get batch status", {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw APIError.internal("Failed to get batch status");
    }
  }
);

/**
 * Updates a task's status and results
 */
export const updateTaskStatus = api(
  {
    method: "PATCH",
    path: "/batch/task/:taskId",
    expose: false, // Internal API only
  },
  async (params: {
    taskId: string;
    status: "queued" | "processing" | "completed" | "failed";
    output?: Record<string, any>;
    error?: string;
    completedAt?: Date;
  }): Promise<{
    success: boolean;
    task: ProcessingTaskResponse;
    taskUnlockedIds?: string[];
  }> => {
    const { taskId, status, output, error, completedAt } = params;
    
    try {
      // Handle the task update in a transaction
      const result = await db.$transaction(async (tx) => {
        // Get the task
        const task = await tx.processingTask.findUnique({
          where: { id: taskId },
          include: { batch: true },
        });
        
        if (!task) {
          throw APIError.notFound(`Task with ID ${taskId} not found`);
        }
        
        // Prepare update data
        const updateData: any = { status };
        
        if (output) {
          updateData.output = output;
        }
        
        if (error) {
          updateData.error = error;
        }
        
        if (status === "processing" && !task.startedAt) {
          updateData.startedAt = new Date();
        }
        
        if (status === "completed" || status === "failed") {
          updateData.completedAt = completedAt || new Date();
        }
        
        // Update the task
        const updatedTask = await tx.processingTask.update({
          where: { id: taskId },
          data: updateData,
        });
        
        // Update batch status counts
        let batchUpdateData: any = {};
        
        if (task.status === "queued" && status !== "queued") {
          batchUpdateData.queuedTasks = { decrement: 1 };
        }
        
        if (task.status === "processing" && status !== "processing") {
          batchUpdateData.processingTasks = { decrement: 1 };
        }
        
        if (status === "processing" && task.status !== "processing") {
          batchUpdateData.processingTasks = { increment: 1 };
        }
        
        if (status === "completed" && task.status !== "completed") {
          batchUpdateData.completedTasks = { increment: 1 };
        }
        
        if (status === "failed" && task.status !== "failed") {
          batchUpdateData.failedTasks = { increment: 1 };
        }
        
        // Update batch if there are changes
        if (Object.keys(batchUpdateData).length > 0) {
          await tx.processingBatch.update({
            where: { id: task.batchId },
            data: batchUpdateData,
          });
        }
        
        // Check for task dependencies to unlock
        let unlockedTasks: string[] = [];
        
        if (status === "completed") {
          // Find tasks that depend on this one
          const dependencies = await tx.taskDependency.findMany({
            where: { dependencyTaskId: taskId },
            include: {
              dependentTask: true,
            },
          });
          
          // For each dependent task, check if all its dependencies are now satisfied
          for (const dep of dependencies) {
            const allDependencies = await tx.taskDependency.findMany({
              where: { dependentTaskId: dep.dependentTaskId },
              include: {
                dependencyTask: true,
              },
            });
            
            // Check if all dependencies are completed
            const allCompleted = allDependencies.every(
              d => d.dependencyTask.status === "completed"
            );
            
            if (allCompleted && dep.dependentTask.status === "queued") {
              unlockedTasks.push(dep.dependentTaskId);
            }
          }
        }
        
        // If this is the last task in the batch, update the batch status
        const remainingTasks = await tx.processingTask.count({
          where: {
            batchId: task.batchId,
            status: { in: ["queued", "processing"] },
          },
        });
        
        if (remainingTasks === 0) {
          // All tasks are either completed or failed
          const failedCount = await tx.processingTask.count({
            where: {
              batchId: task.batchId,
              status: "failed",
            },
          });
          
          const newBatchStatus = failedCount > 0 ? "completed_with_errors" : "completed";
          
          await tx.processingBatch.update({
            where: { id: task.batchId },
            data: { status: newBatchStatus },
          });
        }
        
        return { task: updatedTask, unlockedTasks, batch: task.batch };
      });
      
      // Publish task completed event (if the status is completed or failed)
      if (status === "completed" || status === "failed") {
        await taskCompleted.publish({
          batchId: result.task.batchId,
          taskId: result.task.id,
          taskType: result.task.taskType,
          success: status === "completed",
          errorMessage: result.task.error || undefined,
          resourceIds: (result.task.output as Record<string, any>) || {},
          meetingRecordId: result.task.meetingRecordId || undefined,
          timestamp: new Date(),
          sourceService: "batch",
        });
      }
      
      // If batch status changed, publish event
      const batch = await db.processingBatch.findUnique({
        where: { id: result.task.batchId },
      });
      
      if (batch && (batch.status === "completed" || batch.status === "completed_with_errors")) {
        await batchStatusChanged.publish({
          batchId: batch.id,
          status: batch.status as any,
          taskSummary: {
            total: batch.totalTasks,
            completed: batch.completedTasks,
            failed: batch.failedTasks,
            queued: batch.queuedTasks,
            processing: batch.processingTasks,
          },
          timestamp: new Date(),
          sourceService: "batch",
        });
      }
      
      // Format task response
      const taskResponse: ProcessingTaskResponse = {
        id: result.task.id,
        batchId: result.task.batchId,
        taskType: result.task.taskType,
        status: result.task.status,
        priority: result.task.priority,
        input: result.task.input as Record<string, any>,
        output: result.task.output as Record<string, any> | undefined,
        error: result.task.error || undefined,
        meetingRecordId: result.task.meetingRecordId || undefined,
        retryCount: result.task.retryCount,
        maxRetries: result.task.maxRetries,
        startedAt: result.task.startedAt || undefined,
        completedAt: result.task.completedAt || undefined,
        createdAt: result.task.createdAt,
        updatedAt: result.task.updatedAt,
      };
      
      return {
        success: true,
        task: taskResponse,
        taskUnlockedIds: result.unlockedTasks,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      
      log.error("Failed to update task status", {
        taskId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw APIError.internal("Failed to update task status");
    }
  }
);

/**
 * Lists the next available tasks for processing
 */
export const getNextTasks = api(
  {
    method: "GET",
    path: "/batch/tasks/next",
    expose: false, // Internal API only
  },
  async (params: {
    /**
     * Number of tasks to retrieve
     */
    limit?: number;
    
    /**
     * Types of tasks to include
     */
    taskTypes?: string[];
  }): Promise<{
    tasks: ProcessingTaskResponse[];
  }> => {
    const { limit = 10, taskTypes } = params;
    
    try {
      // Find tasks that are queued and don't have pending dependencies
      const tasksWithDependencies = await db.$transaction(async (tx) => {
        // Get queued tasks with their dependencies
        const queuedTasks = await tx.processingTask.findMany({
          where: {
            status: "queued",
            ...(taskTypes ? { taskType: { in: taskTypes } } : {}),
          },
          orderBy: [
            { priority: "desc" },
            { createdAt: "asc" },
          ],
          take: limit * 2, // Fetch more than needed to account for filtering
          include: {
            dependsOn: {
              include: {
                dependencyTask: true,
              },
            },
          },
        });
        
        // Filter for tasks where all dependencies are complete
        const availableTasks = queuedTasks.filter(task => {
          if (task.dependsOn.length === 0) {
            return true; // No dependencies
          }
          
          // All dependencies must be completed
          return task.dependsOn.every(dep => 
            dep.dependencyTask.status === "completed"
          );
        });
        
        return availableTasks.slice(0, limit);
      });
      
      // Map to the response format
      const tasks = tasksWithDependencies.map(task => ({
        id: task.id,
        batchId: task.batchId,
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
        input: task.input as Record<string, any>,
        output: task.output as Record<string, any> | undefined,
        error: task.error || undefined,
        meetingRecordId: task.meetingRecordId || undefined,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        startedAt: task.startedAt || undefined,
        completedAt: task.completedAt || undefined,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }));
      
      return { tasks };
    } catch (error) {
      log.error("Failed to get next tasks", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw APIError.internal("Failed to get next tasks");
    }
  }
);

/**
 * Lists available batches with optional filtering
 */
export const listBatches = api(
  {
    method: "GET",
    path: "/batch",
    expose: true,
  },
  async (params: {
    /**
     * Number of batches to retrieve
     */
    limit?: number;
    
    /**
     * Offset for pagination
     */
    offset?: number;
    
    /**
     * Filter by batch status
     */
    status?: string;
    
    /**
     * Filter by batch type
     */
    batchType?: string;
  }): Promise<{
    batches: BatchSummary[];
    total: number;
  }> => {
    const { limit = 10, offset = 0, status, batchType } = params;
    
    try {
      // Build where clause
      const where: any = {};
      
      if (status) {
        where.status = status;
      }
      
      if (batchType) {
        where.batchType = batchType;
      }
      
      // Get batches and count
      const [batches, total] = await Promise.all([
        db.processingBatch.findMany({
          where,
          orderBy: [
            { priority: "desc" },
            { createdAt: "desc" },
          ],
          take: limit,
          skip: offset,
        }),
        db.processingBatch.count({ where }),
      ]);
      
      // Map to response format
      const batchSummaries = batches.map(batch => ({
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
        priority: batch.priority,
        metadata: batch.metadata as Record<string, any> | undefined,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      }));
      
      return {
        batches: batchSummaries,
        total,
      };
    } catch (error) {
      log.error("Failed to list batches", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw APIError.internal("Failed to list batches");
    }
  }
);

/**
 * Process the next batch of available tasks
 */
export const processNextTasks = api(
  {
    method: "POST",
    path: "/batch/tasks/process",
    expose: true,
  },
  async (params: {
    /**
     * Number of tasks to process
     */
    limit?: number;
    
    /**
     * Types of tasks to process
     */
    taskTypes?: string[];
  }): Promise<{
    processed: number;
  }> => {
    const { limit = 10, taskTypes } = params;
    
    try {
      // Get next available tasks
      const { tasks } = await getNextTasks({ limit, taskTypes });
      
      if (tasks.length === 0) {
        return { processed: 0 };
      }
      
      // Mark them as processing
      let processed = 0;
      
      for (const task of tasks) {
        try {
          await updateTaskStatus({
            taskId: task.id,
            status: "processing",
          });
          
          // TODO: In a real implementation, you'd dispatch these tasks to actual processors
          // For now, we'll just log that we're processing them
          log.info(`Processing task ${task.id} of type ${task.taskType}`, {
            taskId: task.id,
            taskType: task.taskType,
            batchId: task.batchId,
          });
          
          processed++;
        } catch (error) {
          log.error(`Failed to start processing task ${task.id}`, {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      return { processed };
    } catch (error) {
      log.error("Failed to process next tasks", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw APIError.internal("Failed to process next tasks");
    }
  }
);

/**
 * Scheduled job to process queued tasks
 */
export const autoProcessNextTasksCron = new CronJob("auto-process-batch-tasks", {
  title: "Auto-process batch tasks",
  schedule: "*/2 * * * *", // Every 2 minutes
  endpoint: processNextTasks,
});