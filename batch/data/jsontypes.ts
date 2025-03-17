import { BatchType } from "@prisma/client/batch/index.js";

declare global {
  namespace PrismaJson {
    // Base metadata types for different batch types
    type BatchMetadataJSON =
      | MediaBatchMetadataJSON
      | DocumentBatchMetadataJSON
      | TranscriptionBatchMetadataJSON;

    type MediaBatchMetadataJSON = {
      type: (typeof BatchType)["MEDIA"];
      videoCount?: number;
      audioCount?: number;
      options?: {
        extractAudio: boolean;
      };
    };

    type DocumentBatchMetadataJSON = {
      type: (typeof BatchType)["DOCUMENT"];
      documentCount?: number;
      documentTypes?: string[];
      source?: string;
    };

    type TranscriptionBatchMetadataJSON = {
      type: (typeof BatchType)["TRANSCRIPTION"];
      audioCount?: number;
      options?: {
        language?: string;
        model?: string;
      };
    };

    // Task input types for different task types
    type TaskInputJSON =
      | MediaTaskInputJSON
      | DocumentTaskInputJSON
      | TranscriptionTaskInputJSON;

    type MediaTaskInputJSON = {
      taskType: "video_download" | "video_process" | "audio_extract";
      url?: string;
      viewerUrl?: string;
      fileId?: string;
      meetingRecordId?: string;
      options?: {
        extractAudio: boolean;
      };
    };

    type DocumentTaskInputJSON = {
      taskType: "document_download" | "document_convert" | "document_extract";
      url?: string;
      meetingRecordId?: string;
      title?: string;
      fileType?: string;
    };

    type TranscriptionTaskInputJSON = {
      taskType: "audio_transcribe" | "transcription_format" | "speaker_diarize";
      audioFileId?: string;
      meetingRecordId?: string;
      options?: {
        language?: string;
        model?: string;
      };
    };

    // Task output types for different task types
    type TaskOutputJSON =
      | MediaTaskOutputJSON
      | DocumentTaskOutputJSON
      | TranscriptionTaskOutputJSON;

    type MediaTaskOutputJSON = {
      id?: string;
      videoId?: string;
      audioId?: string;
      url?: string;
      duration?: number;
      fileSize?: number;
      mimeType?: string;
    };

    type DocumentTaskOutputJSON = {
      id?: string;
      documentId?: string;
      url?: string;
      mimeType?: string;
      pageCount?: number;
      textContent?: string;
      fileSize?: number;
    };

    type TranscriptionTaskOutputJSON = {
      id?: string;
      transcriptionId?: string;
      audioFileId?: string;
      language?: string;
      durationSeconds?: number;
      wordCount?: number;
      speakerCount?: number;
      confidenceScore?: number;
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
