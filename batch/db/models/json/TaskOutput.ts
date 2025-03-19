// Base output type for common fields
export type BaseTaskOutputJSON = {
  id?: string;
  processingTime?: number; // Added for performance tracking
};

// Task output types for different task types
export type TaskOutputJSON =
  | MediaTaskOutputJSON
  | DocumentTaskOutputJSON
  | TranscriptionTaskOutputJSON;

export type MediaTaskOutputJSON = BaseTaskOutputJSON & {
  videoId?: string;
  audioId?: string;
  url?: string;
  duration?: number;
  fileSize?: number;
  mimeType?: string;
};

export type DocumentTaskOutputJSON = BaseTaskOutputJSON & {
  documentId?: string;
  url?: string;
  mimeType?: string;
  pageCount?: number;
  textContent?: string;
  fileSize?: number;
};

export type TranscriptionTaskOutputJSON = BaseTaskOutputJSON & {
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
