import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import env from "../env";
import { db } from "./data";
import { WhisperClient } from "./whisperClient";

import { TaskStatus } from "@prisma/client/batch/index.js";
import { media } from "~encore/clients";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";

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
 * Type definitions for the transcription service
 */

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
  status: TaskStatus;

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
  status: TaskStatus;

  /**
   * ID of the resulting transcription (available when completed)
   */
  transcriptionId?: string;

  /**
   * Error message if the job failed
   */
  error?: string;
}

// Initialize the Whisper client
const whisperClient = new WhisperClient({
  apiKey: env.OPENAI_API_KEY,
  defaultModel: "whisper-1",
});

/**
 * API to request a transcription for an audio file
 */
export const transcribe = api(
  {
    method: "POST",
    path: "/transcribe",
    expose: true,
  },
  async (req: TranscriptionRequest): Promise<TranscriptionResponse> => {
    const { audioFileId, meetingRecordId, model, language, priority } = req;

    // Validate that the audio file exists
    try {
      const audioFile = await media.getMediaFile({ mediaId: audioFileId });
      if (!audioFile) {
        throw APIError.notFound(`Audio file ${audioFileId} not found`);
      }
    } catch (error) {
      log.error("Failed to verify audio file existence", {
        audioFileId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to verify audio file existence");
    }

    // Create a transcription job in the database
    try {
      const job = await db.transcriptionJob.create({
        data: {
          status: TaskStatus.QUEUED,
          priority: priority || 0,
          model: model || "whisper-1",
          language,
          audioFileId,
          meetingRecordId,
        },
      });

      // Start processing the job asynchronously
      processJob(job.id).catch((error) => {
        log.error(`Error processing job ${job.id}:`, {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      log.info("Created transcription job", {
        jobId: job.id,
        audioFileId,
        meetingRecordId,
        model: model || "whisper-1",
      });

      return {
        jobId: job.id,
        status: TaskStatus.QUEUED,
      };
    } catch (error) {
      log.error("Failed to create transcription job", {
        audioFileId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to create transcription job");
    }
  },
);

/**
 * API to get the status of a transcription job
 */
export const getJobStatus = api(
  {
    method: "GET",
    path: "/jobs/:jobId",
    expose: true,
  },
  async (req: { jobId: string }): Promise<TranscriptionResponse> => {
    const { jobId } = req;

    try {
      const job = await db.transcriptionJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw APIError.notFound(`Job ${jobId} not found`);
      }

      return {
        jobId: job.id,
        status: job.status as TaskStatus,
        transcriptionId: job.transcriptionId || undefined,
        error: job.error || undefined,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      log.error("Failed to get job status", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to get job status");
    }
  },
);

/**
 * API to get a transcription by ID
 */
export const getTranscription = api(
  {
    method: "GET",
    path: "/transcriptions/:transcriptionId",
    expose: true,
  },
  async (req: { transcriptionId: string }): Promise<TranscriptionResult> => {
    const { transcriptionId } = req;

    try {
      const transcription = await db.transcription.findUnique({
        where: { id: transcriptionId },
        include: { segments: true },
      });

      if (!transcription) {
        throw APIError.notFound(`Transcription ${transcriptionId} not found`);
      }

      return {
        id: transcription.id,
        text: transcription.text,
        language: transcription.language || undefined,
        model: transcription.model,
        confidence: transcription.confidence || undefined,
        processingTime: transcription.processingTime || undefined,
        status: transcription.status as TaskStatus,
        error: transcription.error || undefined,
        createdAt: transcription.createdAt,
        updatedAt: transcription.updatedAt,
        audioFileId: transcription.audioFileId,
        meetingRecordId: transcription.meetingRecordId || undefined,
        segments: transcription.segments.map((segment) => ({
          index: segment.index,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence || undefined,
        })),
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      log.error("Failed to get transcription", {
        transcriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to get transcription");
    }
  },
);

/**
 * API to get all transcriptions for a meeting
 */
export const getMeetingTranscriptions = api(
  {
    method: "GET",
    path: "/meetings/:meetingId/transcriptions",
    expose: true,
  },
  async (req: {
    meetingId: string;
  }): Promise<{ transcriptions: TranscriptionResult[] }> => {
    const { meetingId } = req;

    try {
      const transcriptions = await db.transcription.findMany({
        where: { meetingRecordId: meetingId },
        include: { segments: true },
      });

      return {
        transcriptions: transcriptions.map((transcription) => ({
          id: transcription.id,
          text: transcription.text,
          language: transcription.language || undefined,
          model: transcription.model,
          confidence: transcription.confidence || undefined,
          processingTime: transcription.processingTime || undefined,
          status: transcription.status as TaskStatus,
          error: transcription.error || undefined,
          createdAt: transcription.createdAt,
          updatedAt: transcription.updatedAt,
          audioFileId: transcription.audioFileId,
          meetingRecordId: transcription.meetingRecordId || undefined,
          segments: transcription.segments.map((segment) => ({
            index: segment.index,
            start: segment.start,
            end: segment.end,
            text: segment.text,
            confidence: segment.confidence || undefined,
          })),
        })),
      };
    } catch (error) {
      log.error("Failed to get meeting transcriptions", {
        meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to get meeting transcriptions");
    }
  },
);

/**
 * Scheduled job to process any queued transcription jobs
 * // TODO: TEST THIS
 */
export const processQueuedJobs = api(
  {
    method: "POST",
    expose: false,
  },
  async (): Promise<{ processed: number }> => {
    const queuedJobs = await db.transcriptionJob.findMany({
      where: {
        status: TaskStatus.QUEUED,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 10, // Process in batches to avoid overloading
    });

    log.info(`Found ${queuedJobs.length} queued jobs to process`);

    for (const job of queuedJobs) {
      processJob(job.id).catch((error) => {
        log.error(`Error processing job ${job.id}:`, {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return { processed: queuedJobs.length };
  },
);

/**
 * Schedule job processing every 5 minutes
 */
export const jobProcessorCron = new CronJob("transcription-job-processor", {
  title: "Process queued transcription jobs",
  endpoint: processQueuedJobs,
  every: "5m",
});

/**
 * Process a transcription job
 * This function is called asynchronously after a job is created
 */
async function processJob(jobId: string): Promise<void> {
  // Mark the job as processing
  try {
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });
  } catch (error) {
    log.error(`Failed to update job ${jobId} status to processing`, {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  let tempDir: string | null = null;

  try {
    // Get the job details
    const job = await db.transcriptionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Get the audio file details from the media service
    const audioFile = await media.getMediaFile({
      mediaId: job.audioFileId,
    });

    if (!audioFile || !audioFile.url) {
      throw new Error(`Audio file ${job.audioFileId} not found or has no URL`);
    }

    // Create a temporary directory for the audio file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcription-"));
    const audioPath = path.join(tempDir, "audio.mp3");

    // Download the audio file
    await downloadFile(audioFile.url, audioPath);
    log.info(`Downloaded audio file for job ${jobId}`, {
      jobId,
      audioFileId: job.audioFileId,
      tempDir,
    });

    // Transcribe the audio file
    const startTime = Date.now();
    const whisperResponse = await whisperClient.transcribeFile(audioPath, {
      model: job.model,
      language: job.language || undefined,
    });
    const processingTime = Math.floor((Date.now() - startTime) / 1000);

    log.info(`Successfully transcribed audio for job ${jobId}`, {
      jobId,
      processingTime,
      textLength: whisperResponse.text.length,
      segmentsCount: whisperResponse.segments?.length || 0,
    });

    // Calculate average confidence if segments available
    const averageConfidence =
      whisperResponse.segments && whisperResponse.segments.length > 0 ?
        whisperResponse.segments.reduce(
          (sum, seg) => sum + (seg.confidence || 0),
          0,
        ) / whisperResponse.segments.length
      : undefined;

    // Create the transcription record
    const transcription = await db.transcription.create({
      include: { segments: true },
      data: {
        text: whisperResponse.text,
        language: whisperResponse.language,
        model: job.model,
        confidence: averageConfidence,
        processingTime,
        status: TaskStatus.COMPLETED,
        audioFileId: job.audioFileId,
        meetingRecordId: job.meetingRecordId,
        segments: {
          create:
            whisperResponse.segments?.map((segment) => ({
              index: segment.index,
              start: segment.start,
              end: segment.end,
              text: segment.text,
              confidence: segment.confidence,
            })) || [],
        },
      },
    });

    // Update the job with the transcription ID
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: TaskStatus.COMPLETED,
        transcriptionId: transcription.id,
      },
    });

    log.info(`Completed transcription job ${jobId}`, {
      jobId,
      transcriptionId: transcription.id,
      segments: transcription.segments.length > 0 ? "created" : "none",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error processing job ${jobId}:`, {
      jobId,
      error: errorMessage,
    });

    // Update the job with the error
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: TaskStatus.FAILED,
        error: errorMessage,
      },
    });
  } finally {
    // Clean up temporary files
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        log.debug(`Cleaned up temporary directory for job ${jobId}`, {
          jobId,
          tempDir,
        });
      } catch (error) {
        log.error(`Failed to clean up temporary directory for job ${jobId}:`, {
          jobId,
          tempDir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

/**
 * Utility function to download a file
 */
async function downloadFile(url: string, destination: string): Promise<void> {
  log.debug(`Downloading file from ${url} to ${destination}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download file: ${response.status} ${response.statusText}`,
      );
    }

    const fileStream = fs.createWriteStream(destination);

    return new Promise((resolve, reject) => {
      if (!response.body) {
        reject(new Error("Response body is null"));
        return;
      }

      // Convert Web ReadableStream to Node Readable stream
      const readableStream = Readable.fromWeb(
        response.body as import("stream/web").ReadableStream,
      );
      const writableStream = fs.createWriteStream(destination);

      readableStream.pipe(writableStream);

      writableStream.on("finish", () => {
        resolve();
      });

      writableStream.on("error", (err) => {
        fs.unlink(destination, () => {
          reject(err);
        });
      });
    });
  } catch (error) {
    log.error(`Error downloading file from ${url}`, {
      url,
      destination,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
