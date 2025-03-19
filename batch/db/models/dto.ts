// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export type $JobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";

export type $BatchType = "MEDIA" | "DOCUMENT" | "TRANSCRIPTION";

export type $TaskType =
  | "DOCUMENT_DOWNLOAD"
  | "DOCUMENT_CONVERT"
  | "DOCUMENT_EXTRACT"
  | "DOCUMENT_PARSE"
  | "AGENDA_DOWNLOAD"
  | "VIDEO_DOWNLOAD"
  | "VIDEO_PROCESS"
  | "AUDIO_EXTRACT"
  | "AUDIO_TRANSCRIBE"
  | "SPEAKER_DIARIZE"
  | "TRANSCRIPT_FORMAT";

export type $EventType =
  | "BATCH_CREATED"
  | "TASK_COMPLETED"
  | "BATCH_STATUS_CHANGED";

export type ProcessingBatchDto = {
  id: string;
  name: string | null;
  batchType: $BatchType;
  status: $JobStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  queuedTasks: number;
  processingTasks: number;
  priority: number;
  metadata: JsonValue | null;
  createdAt: string;
  updatedAt: string;
  tasks?: ProcessingTaskDto[];
};

export type ProcessingTaskDto = {
  id: string;
  batchId: string | null;
  batch?: ProcessingBatchDto | null;
  taskType: $TaskType;
  status: $JobStatus;
  retryCount: number;
  maxRetries: number;
  priority: number;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  meetingRecordId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dependsOn?: TaskDependencyDto[];
  dependencies?: TaskDependencyDto[];
};

export type TaskDependencyDto = {
  id: string;
  dependentTaskId: string;
  dependentTask?: ProcessingTaskDto;
  dependencyTaskId: string;
  dependencyTask?: ProcessingTaskDto;
  createdAt: string;
};

export type WebhookSubscriptionDto = {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  eventTypes: $EventType[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryDto = {
  id: string;
  webhookId: string;
  eventType: string;
  payload: JsonValue;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  successful: boolean;
  scheduledFor: string;
  lastAttemptedAt: string | null;
  createdAt: string;
};

type JsonValue =
  | string
  | number
  | boolean
  | { [key in string]?: JsonValue }
  | Array<JsonValue>
  | null;
