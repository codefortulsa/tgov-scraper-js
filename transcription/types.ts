/**
 * Type definitions for the transcription service
 */

/**
 * Status of a transcription job or result
 */
export type TranscriptionStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Represents a time-aligned segment in a transcription
 */
export interface TranscriptionSegment {
  /**
   * Segment index in the transcription
   */
  index: number;
  
  /**
   * Start time in seconds
   */
  start: number;
  
  /**
   * End time in seconds
   */
  end: number;
  
  /**
   * Text content of this segment
   */
  text: string;
  
  /**
   * Confidence score for this segment (0-1)
   */
  confidence?: number;
}

/**
 * Complete transcription result with metadata
 */
export interface TranscriptionResult {
  /**
   * Unique identifier for the transcription
   */
  id: string;
  
  /**
   * Complete transcribed text
   */
  text: string;
  
  /**
   * Detected or specified language
   */
  language?: string;
  
  /**
   * The model used for transcription (e.g., "whisper-1")
   */
  model: string;
  
  /**
   * Overall confidence score of the transcription (0-1)
   */
  confidence?: number;
  
  /**
   * Time taken to process in seconds
   */
  processingTime?: number;
  
  /**
   * Current status of the transcription
   */
  status: TranscriptionStatus;
  
  /**
   * Error message if the transcription failed
   */
  error?: string;
  
  /**
   * When the transcription was created
   */
  createdAt: Date;
  
  /**
   * When the transcription was last updated
   */
  updatedAt: Date;
  
  /**
   * ID of the audio file that was transcribed
   */
  audioFileId: string;
  
  /**
   * ID of the meeting record this transcription belongs to
   */
  meetingRecordId?: string;
  
  /**
   * Time-aligned segments of the transcription
   */
  segments?: TranscriptionSegment[];
}

/**
 * Request parameters for creating a new transcription
 */
export interface TranscriptionRequest {
  /**
   * ID of the audio file to transcribe
   */
  audioFileId: string;
  
  /**
   * Optional ID of the meeting record this transcription belongs to
   */
  meetingRecordId?: string;
  
  /**
   * The model to use for transcription (default: "whisper-1")
   */
  model?: string;
  
  /**
   * Optional language hint for the transcription
   */
  language?: string;
  
  /**
   * Optional priority for job processing (higher values = higher priority)
   */
  priority?: number;
}

/**
 * Response from transcription job operations
 */
export interface TranscriptionResponse {
  /**
   * Unique identifier for the job
   */
  jobId: string;
  
  /**
   * Current status of the job
   */
  status: TranscriptionStatus;
  
  /**
   * ID of the resulting transcription (available when completed)
   */
  transcriptionId?: string;
  
  /**
   * Error message if the job failed
   */
  error?: string;
}