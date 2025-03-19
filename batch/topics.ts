/**
 * Batch Processing Event Topics
 *
 * This file defines the pub/sub topics used for event-driven communication
 * between services in the batch processing pipeline.
 */
import { $TaskType, BatchType, JobStatus } from "./db/models/db";
import { BatchMetadata } from "./db/models/json";

import { Attribute, Topic } from "encore.dev/pubsub";

/**
 * Base interface for all batch events including common fields
 */
interface BatchEventBase {
  /**
   * Timestamp when the event occurred
   */
  timestamp: Date;

  /**
   * Service that generated the event
   */
  sourceService: string;
}

/**
 * Event published when a new batch is created
 */
export interface BatchCreatedEvent extends BatchEventBase {
  /**
   * The ID of the created batch
   */
  batchId: Attribute<string>;

  /**
   * The type of batch
   */
  batchType: BatchType;

  /**
   * The number of tasks in the batch
   */
  taskCount: number;

  /**
   * Optional metadata about the batch
   */
  metadata?: BatchMetadata;
}

/**
 * Event published when a task is completed
 * Optimized to contain only essential data, subscribers can query the database for details
 */
export interface TaskCompletedEvent extends BatchEventBase {
  /**
   * The ID of the batch this task belongs to
   */
  batchId: Attribute<string> | null;

  /**
   * The ID of the completed task
   */
  taskId: string;

  /**
   * The type of task that completed
   */
  taskType: $TaskType;

  /**
   * Whether the task was successful
   */
  success: boolean;

  /**
   * The detailed status of the task
   */
  status: JobStatus;

  /**
   * Error message if the task failed - only included for failed tasks
   */
  errorMessage?: string;

  /**
   * IDs of primary resources created by the task
   * Only contains top-level resource identifiers needed for dependent processing
   */
  resourceIds: Record<string, string>;

  /**
   * Meeting record ID associated with this task, if applicable
   * Included as it's commonly used for linking records across services
   */
  meetingRecordId?: string;
}

/**
 * Event published when a batch status changes
 */
export interface BatchStatusChangedEvent extends BatchEventBase {
  /**
   * The ID of the batch with the updated status
   */
  batchId: Attribute<string>;

  /**
   * The new status of the batch
   */
  status: JobStatus;

  /**
   * Summary of task statuses
   */
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    queued: number;
    processing: number;
  };
}

/**
 * Topic for batch creation events
 */
export const batchCreated = new Topic<BatchCreatedEvent>("batch-created", {
  deliveryGuarantee: "at-least-once",
});

/**
 * Topic for task completion events
 * Using orderingAttribute to ensure events for the same batch are processed in order
 */
export const taskCompleted = new Topic<TaskCompletedEvent>("task-completed", {
  deliveryGuarantee: "at-least-once",
  orderingAttribute: "batchId",
});

/**
 * Topic for batch status change events
 * Using orderingAttribute to ensure events for the same batch are processed in order
 */
export const batchStatusChanged = new Topic<BatchStatusChangedEvent>(
  "batch-status-changed",
  {
    deliveryGuarantee: "at-least-once",
    orderingAttribute: "batchId",
  },
);
