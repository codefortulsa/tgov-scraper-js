import fs from "fs";
import os from "os";
import path from "path";

import { media } from "~encore/clients";
import { prisma } from "./data";
import {
  TranscriptionRequest,
  TranscriptionResponse,
  TranscriptionResult,
  TranscriptionStatus,
} from "./types";
import { WhisperClient } from "./whisperClient";

import { api, APIError, ErrCode } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import env from "../env";

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
      const job = await prisma.transcriptionJob.create({
        data: {
          status: "queued",
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
        status: "queued",
      };
    } catch (error) {
      log.error("Failed to create transcription job", {
        audioFileId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to create transcription job");
    }
  }
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
      const job = await prisma.transcriptionJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw APIError.notFound(`Job ${jobId} not found`);
      }

      return {
        jobId: job.id,
        status: job.status as TranscriptionStatus,
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
  }
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
      const transcription = await prisma.transcription.findUnique({
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
        status: transcription.status as TranscriptionStatus,
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
  }
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
  async (req: { meetingId: string }): Promise<TranscriptionResult[]> => {
    const { meetingId } = req;

    try {
      const transcriptions = await prisma.transcription.findMany({
        where: { meetingRecordId: meetingId },
        include: { segments: true },
      });

      return transcriptions.map((transcription) => ({
        id: transcription.id,
        text: transcription.text,
        language: transcription.language || undefined,
        model: transcription.model,
        confidence: transcription.confidence || undefined,
        processingTime: transcription.processingTime || undefined,
        status: transcription.status as TranscriptionStatus,
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
      }));
    } catch (error) {
      log.error("Failed to get meeting transcriptions", {
        meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to get meeting transcriptions");
    }
  }
);

/**
 * Scheduled job to process any queued transcription jobs
 */
export const processQueuedJobs = api(
  {
    method: "POST",
    expose: false,
  },
  async (): Promise<{ processed: number }> => {
    const queuedJobs = await prisma.transcriptionJob.findMany({
      where: {
        status: "queued",
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "asc" },
      ],
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
  }
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
    await prisma.transcriptionJob.update({
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
    const job = await prisma.transcriptionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Get the audio file details from the media service
    const audioFile = await media.getMediaFile({ mediaId: job.audioFileId });

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
    const transcription = await prisma.transcription.create({
      data: {
        text: whisperResponse.text,
        language: whisperResponse.language,
        model: job.model,
        confidence: averageConfidence,
        processingTime,
        status: "completed",
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
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        transcriptionId: transcription.id,
      },
    });

    log.info(`Completed transcription job ${jobId}`, {
      jobId,
      transcriptionId: transcription.id,
      segments: transcription.segments ? "created" : "none",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error processing job ${jobId}:`, {
      jobId,
      error: errorMessage,
    });

    // Update the job with the error
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
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
        log.error(
          `Failed to clean up temporary directory for job ${jobId}:`,
          {
            jobId,
            tempDir,
            error: error instanceof Error ? error.message : String(error),
          }
        );
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
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    
    const fileStream = fs.createWriteStream(destination);
    
    return new Promise((resolve, reject) => {
      if (!response.body) {
        reject(new Error("Response body is null"));
        return;
      }
      
      const responseStream = response.body;
      const writableStream = fs.createWriteStream(destination);
      
      responseStream.pipe(writableStream);
      
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
