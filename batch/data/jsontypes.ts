import { TASK_TYPE_STRING_MAP } from "../constants";

import { BatchType, TaskType } from "@prisma/client/batch/index.js";

declare global {
  namespace PrismaJson {
    // Base metadata types for different batch types
    type BatchMetadataJSON =
      | MediaBatchMetadataJSON
      | DocumentBatchMetadataJSON
      | TranscriptionBatchMetadataJSON;

    // Common fields shared across batch types
    type BaseBatchMetadataJSON = {
      // No need to duplicate the "type" field as it's already in the BatchType column
      source?: string;
      description?: string;
    };

    type MediaBatchMetadataJSON = BaseBatchMetadataJSON & {
      type: (typeof BatchType)["MEDIA"];
      // Consolidated count fields
      fileCount?: number;
      options?: {
        extractAudio?: boolean;
        // Removed unnecessary nested options
      };
    };

    type DocumentBatchMetadataJSON = BaseBatchMetadataJSON & {
      type: (typeof BatchType)["DOCUMENT"];
      fileCount?: number;
      documentTypes?: string[];
    };

    type TranscriptionBatchMetadataJSON = BaseBatchMetadataJSON & {
      type: (typeof BatchType)["TRANSCRIPTION"];
      audioId?: string; // Single audio file reference
      audioCount?: number; // Multiple audio files count
      options?: {
        language?: string;
        model?: string;
        // Options moved from task-specific to batch level for consistency
        detectSpeakers?: boolean;
        wordTimestamps?: boolean;
        format?: "json" | "txt" | "srt" | "vtt" | "html";
      };
    };

    // Task input types for different task types
    type TaskInputJSON =
      | MediaTaskInputJSON
      | DocumentTaskInputJSON
      | TranscriptionTaskInputJSON;

    // Define allowed string literals for task types using the mapping
    type MediaTaskTypeString =
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.MEDIA_VIDEO_DOWNLOAD]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.MEDIA_VIDEO_PROCESS]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.MEDIA_AUDIO_EXTRACT];

    type DocumentTaskTypeString =
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.DOCUMENT_DOWNLOAD]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.DOCUMENT_CONVERT]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.DOCUMENT_EXTRACT]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.DOCUMENT_PARSE]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.AGENDA_DOWNLOAD];

    type TranscriptionTaskTypeString =
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.AUDIO_TRANSCRIBE]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.SPEAKER_DIARIZE]
      | (typeof TASK_TYPE_STRING_MAP)[TaskType.TRANSCRIPT_FORMAT];

    // Base task input with common fields
    type BaseTaskInputJSON = {
      meetingRecordId?: string;
    };

    type MediaTaskInputJSON = BaseTaskInputJSON & {
      taskType: MediaTaskTypeString;
      url?: string;
      viewerUrl?: string;
      fileId?: string;
      options?: {
        extractAudio?: boolean;
      };
    };

    type DocumentTaskInputJSON = BaseTaskInputJSON & {
      taskType: DocumentTaskTypeString;
      url?: string;
      title?: string;
      fileType?: string;
    };

    type TranscriptionTaskInputJSON = BaseTaskInputJSON & {
      taskType: TranscriptionTaskTypeString;
      audioFileId?: string;
      transcriptionId?: string; // Added for dependent tasks
      options?: {
        language?: string;
        model?: string;
        minSpeakers?: number;
        maxSpeakers?: number;
        format?: "json" | "txt" | "srt" | "vtt" | "html";
      };
    };

    // Base output type for common fields
    type BaseTaskOutputJSON = {
      id?: string;
      processingTime?: number; // Added for performance tracking
    };

    // Task output types for different task types
    type TaskOutputJSON =
      | MediaTaskOutputJSON
      | DocumentTaskOutputJSON
      | TranscriptionTaskOutputJSON;

    type MediaTaskOutputJSON = BaseTaskOutputJSON & {
      videoId?: string;
      audioId?: string;
      url?: string;
      duration?: number;
      fileSize?: number;
      mimeType?: string;
    };

    type DocumentTaskOutputJSON = BaseTaskOutputJSON & {
      documentId?: string;
      url?: string;
      mimeType?: string;
      pageCount?: number;
      textContent?: string;
      fileSize?: number;
    };

    type TranscriptionTaskOutputJSON = BaseTaskOutputJSON & {
      transcriptionId?: string;
      audioFileId?: string;
      language?: string;
      durationSeconds?: number;
      wordCount?: number;
      speakerCount?: number;
      confidenceScore?: number;
      diarizationId?: string;
      format?: string;
      outputUrl?: string;
      byteSize?: number;
    };

    // Webhook payload structure
    type WebhookPayloadJSON =
      | BatchCreatedWebhookPayload
      | TaskCompletedWebhookPayload
      | BatchStatusChangedWebhookPayload;

    type BatchCreatedWebhookPayload = {
      eventType: "batch-created";
      batchId: string;
      batchType: string;
      taskCount: number;
      metadata: BatchMetadataJSON;
      timestamp: Date;
    };

    type TaskCompletedWebhookPayload = {
      eventType: "task-completed";
      batchId: string;
      taskId: string;
      taskType: string;
      success: boolean;
      errorMessage?: string;
      resourceIds: Record<string, string>;
      meetingRecordId?: string;
      timestamp: Date;
    };

    type BatchStatusChangedWebhookPayload = {
      eventType: "batch-status-changed";
      batchId: string;
      status: string;
      taskSummary: {
        total: number;
        completed: number;
        failed: number;
        queued: number;
        processing: number;
      };
      timestamp: Date;
    };
  }
}

export {};
