import { BatchType } from "../db";

// Base metadata types for different batch types
export type BatchMetadata =
  | MediaBatchMetadata
  | DocumentBatchMetadata
  | TranscriptionBatchMetadata;

// Common fields shared across batch types
export type BaseBatchMetadata = {
  type: BatchType;
  source?: string;
  description?: string;
};

export type MediaBatchMetadata = BaseBatchMetadata & {
  type: Extract<BatchType, "MEDIA">;
  fileCount?: number;
  extractAudio?: boolean;
};

export type DocumentBatchMetadata = BaseBatchMetadata & {
  type: Extract<BatchType, "DOCUMENT">;
  fileCount?: number;
  documentTypes?: string[];
};

export type TranscriptionBatchMetadata = BaseBatchMetadata & {
  type: Extract<BatchType, "TRANSCRIPTION">;
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
