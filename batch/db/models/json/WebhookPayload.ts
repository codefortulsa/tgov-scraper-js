import { $TaskType, BatchType, JobStatus } from "../db";
import { BatchMetadata } from "./BatchMetadata";

// Webhook payload structure
export type WebhookPayloadJSON =
  | BatchCreatedWebhookPayload
  | TaskCompletedWebhookPayload
  | BatchStatusChangedWebhookPayload;

export type BatchCreatedWebhookPayload = {
  eventType: "batch-created";
  batchId: string;
  batchType: BatchType;
  taskCount: number;
  metadata: BatchMetadata;
  timestamp: Date;
};

export type TaskCompletedWebhookPayload = {
  eventType: "task-completed";
  batchId: string;
  taskId: string;
  taskType: $TaskType;
  success: boolean;
  errorMessage?: string;
  resourceIds: Record<string, string>;
  meetingRecordId?: string;
  timestamp: Date;
};

export type BatchStatusChangedWebhookPayload = {
  eventType: "batch-status-changed";
  batchId: string;
  status: JobStatus;
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    queued: number;
    processing: number;
  };
  timestamp: Date;
};
