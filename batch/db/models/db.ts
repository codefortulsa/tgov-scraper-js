// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export const JobStatus = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  COMPLETED_WITH_ERRORS: "COMPLETED_WITH_ERRORS",
  FAILED: "FAILED",
} as const;

export type JobStatus = keyof typeof JobStatus;

export const BatchType = {
  MEDIA: "MEDIA",
  DOCUMENT: "DOCUMENT",
  TRANSCRIPTION: "TRANSCRIPTION",
} as const;

export type BatchType = keyof typeof BatchType;

export const TaskType = {
  DOCUMENT_DOWNLOAD: "DOCUMENT_DOWNLOAD",
  DOCUMENT_CONVERT: "DOCUMENT_CONVERT",
  DOCUMENT_EXTRACT: "DOCUMENT_EXTRACT",
  DOCUMENT_PARSE: "DOCUMENT_PARSE",
  AGENDA_DOWNLOAD: "AGENDA_DOWNLOAD",
  VIDEO_DOWNLOAD: "VIDEO_DOWNLOAD",
  VIDEO_PROCESS: "VIDEO_PROCESS",
  AUDIO_EXTRACT: "AUDIO_EXTRACT",
  AUDIO_TRANSCRIBE: "AUDIO_TRANSCRIBE",
  SPEAKER_DIARIZE: "SPEAKER_DIARIZE",
  TRANSCRIPT_FORMAT: "TRANSCRIPT_FORMAT",
} as const;

export type $TaskType = keyof typeof TaskType;

export const EventType = {
  BATCH_CREATED: "BATCH_CREATED",
  TASK_COMPLETED: "TASK_COMPLETED",
  BATCH_STATUS_CHANGED: "BATCH_STATUS_CHANGED",
} as const;

export type EventType = keyof typeof EventType;

export type ProcessingBatchModel = {
  id: string;
  name: string | null;
  batchType: BatchType;
  status: JobStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  queuedTasks: number;
  processingTasks: number;
  priority: number;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: ProcessingTaskModel[];
};

export type ProcessingTaskModel = {
  id: string;
  batchId: string | null;
  batch?: ProcessingBatchModel | null;
  taskType: $TaskType;
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  priority: number;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  meetingRecordId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  dependsOn?: TaskDependencyModel[];
  dependencies?: TaskDependencyModel[];
};

export type TaskDependencyModel = {
  id: string;
  dependentTaskId: string;
  dependentTask?: ProcessingTaskModel;
  dependencyTaskId: string;
  dependencyTask?: ProcessingTaskModel;
  createdAt: Date;
};

export type WebhookSubscriptionModel = {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  eventTypes: EventType[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WebhookDeliveryModel = {
  id: string;
  webhookId: string;
  eventType: string;
  payload: JsonValue;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  successful: boolean;
  scheduledFor: Date;
  lastAttemptedAt: Date | null;
  createdAt: Date;
};

type JsonValue =
  | string
  | number
  | boolean
  | { [key in string]?: JsonValue }
  | Array<JsonValue>
  | null;
