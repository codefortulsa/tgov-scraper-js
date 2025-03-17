// filepath: /Users/alec/dev/punctuil/services/tulsa-transcribe/batch/constants.ts
/**
 * Batch processing constants
 */
import { TaskType } from "@prisma/client/batch/index.js";

/**
 * Task type constants for document processing
 */
export const DOCUMENT_TASK_TYPES = [
  TaskType.DOCUMENT_DOWNLOAD,
  TaskType.DOCUMENT_CONVERT,
  TaskType.DOCUMENT_EXTRACT,
  TaskType.DOCUMENT_PARSE,
  TaskType.AGENDA_DOWNLOAD,
];

/**
 * Task type constants for media processing
 */
export const MEDIA_TASK_TYPES = [
  TaskType.MEDIA_VIDEO_DOWNLOAD,
  TaskType.MEDIA_VIDEO_PROCESS,
  TaskType.MEDIA_AUDIO_EXTRACT,
];

/**
 * Task type constants for transcription processing
 */
export const TRANSCRIPTION_TASK_TYPES = [
  TaskType.AUDIO_TRANSCRIBE,
  TaskType.SPEAKER_DIARIZE,
  TaskType.TRANSCRIPT_FORMAT,
];

/**
 * All task types
 */
export const ALL_TASK_TYPES = [
  ...DOCUMENT_TASK_TYPES,
  ...MEDIA_TASK_TYPES,
  ...TRANSCRIPTION_TASK_TYPES,
];

/**
 * Map string literals to TaskType enum values
 * This helps with backward compatibility during migration
 */
export const TASK_TYPE_MAP = {
  // Document task types
  document_download: TaskType.DOCUMENT_DOWNLOAD,
  document_convert: TaskType.DOCUMENT_CONVERT,
  document_extract: TaskType.DOCUMENT_EXTRACT,
  document_parse: TaskType.DOCUMENT_PARSE,
  agenda_download: TaskType.AGENDA_DOWNLOAD,

  // Media task types
  video_download: TaskType.MEDIA_VIDEO_DOWNLOAD,
  video_process: TaskType.MEDIA_VIDEO_PROCESS,
  audio_extract: TaskType.MEDIA_AUDIO_EXTRACT,

  // Transcription task types
  audio_transcribe: TaskType.AUDIO_TRANSCRIBE,
  speaker_diarize: TaskType.SPEAKER_DIARIZE,
  transcript_format: TaskType.TRANSCRIPT_FORMAT,
} as const;

/**
 * Map TaskType enum values to string literals
 * This helps with backward compatibility during migration
 */
export const TASK_TYPE_STRING_MAP: Record<TaskType, string> = {
  // Document task types
  [TaskType.DOCUMENT_DOWNLOAD]: "document_download",
  [TaskType.DOCUMENT_CONVERT]: "document_convert",
  [TaskType.DOCUMENT_EXTRACT]: "document_extract",
  [TaskType.DOCUMENT_PARSE]: "document_parse",
  [TaskType.AGENDA_DOWNLOAD]: "agenda_download",

  // Media task types
  [TaskType.MEDIA_VIDEO_DOWNLOAD]: "video_download",
  [TaskType.MEDIA_VIDEO_PROCESS]: "video_process",
  [TaskType.MEDIA_AUDIO_EXTRACT]: "audio_extract",

  // Transcription task types
  [TaskType.AUDIO_TRANSCRIBE]: "audio_transcribe",
  [TaskType.SPEAKER_DIARIZE]: "speaker_diarize",
  [TaskType.TRANSCRIPT_FORMAT]: "transcript_format",
};
