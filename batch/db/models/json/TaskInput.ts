// Task input types for different task types
export type TaskInputJSON =
  | MediaTaskInputJSON
  | DocumentTaskInputJSON
  | TranscriptionTaskInputJSON;

// Base task input with common fields
type BaseTaskInputJSON = { meetingRecordId?: string };

type MediaTaskInputJSON = BaseTaskInputJSON & {
  taskType: MediaTaskType;
  url?: string;
  viewerUrl?: string;
  fileId?: string;
  options?: {
    extractAudio?: boolean;
  };
};

type DocumentTaskInputJSON = BaseTaskInputJSON & {
  taskType: DocumentTaskType;
  url?: string;
  title?: string;
  fileType?: string;
};

type TranscriptionTaskInputJSON = BaseTaskInputJSON & {
  taskType: TranscriptionTaskType;
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
