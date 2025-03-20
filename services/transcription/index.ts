import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import env from "../../env";
import { JobStatus } from "../enums";
import { db } from "./db";
import { SpeakerModel } from "./db/models/db";
import { Phi4Client } from "./phi4Client";
import { WhisperClient } from "./whisperClient";

import { media } from "~encore/clients";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";

/** Represents a time-aligned segment in a transcription */
export interface TranscriptionSegment {
  /** * Segment index in the transcription */
  index: number;
  /** * Start time in seconds */
  start: number;
  /** * End time in seconds */
  end: number;
  /** * Text content of this segment */
  text: string;
  /**
   * Confidence score for this segment (0-1)
   */
  confidence?: number;
}

/** Complete transcription result with metadata */
export interface TranscriptionResult {
  /** * Unique identifier for the transcription */
  id: string;
  /** * Complete transcribed text */
  text: string;
  /** * Detected or specified language */
  language?: string;
  /** * The model used for transcription (e.g., "whisper-1") */
  model: string;
  /** * Overall confidence score of the transcription (0-1) */
  confidence?: number;
  /** * Time taken to process in seconds */
  processingTime?: number;
  /** * Current status of the transcription */
  status: string;
  /** * Error message if the transcription failed */
  error?: string;
  /** * When the transcription was created */
  createdAt: Date;
  /** * When the transcription was last updated */
  updatedAt: Date;
  /** * ID of the audio file that was transcribed */
  audioFileId: string;
  /** * ID of the meeting record this transcription belongs to */
  meetingRecordId?: string;
  /**
   * Time-aligned segments of the transcription
   */
  segments?: TranscriptionSegment[];
  /** Whether speaker diarization was performed */
  diarized: boolean;
  /** Speakers identified in the transcription (if diarized) */
  speakers?: SpeakerInfo[];
}

/** Information about a speaker in a diarized transcription */
export interface SpeakerInfo {
  /** Unique identifier for the speaker */
  id: string;
  /** Label for the speaker (e.g., "SpeakerModel 1") */
  label: string;
  /** Identified name of the speaker if available */
  name?: string;
}

/** Request parameters for creating a new transcription */
export interface TranscriptionRequest {
  /** * ID of the audio file to transcribe */
  audioFileId: string;
  /** * Optional ID of the meeting record this transcription belongs to */
  meetingRecordId?: string;
  /** * The model to use for transcription (default: "whisper-1") */
  model?: string;
  /** * Optional language hint for the transcription */
  language?: string;
  /**
   * Optional priority for job processing (higher values = higher priority)
   */
  priority?: number;
  /** Whether to perform speaker diarization */
  enableDiarization?: boolean;
  /** Model to use for diarization (default: "phi-4" if diarization is enabled) */
  diarizationModel?: string;
  /** Minimum number of speakers to identify (optional) */
  minSpeakers?: number;
  /** Maximum number of speakers to identify (optional) */
  maxSpeakers?: number;
}

/** Response from transcription job operations */
export interface TranscriptionResponse {
  /** * Unique identifier for the job */
  jobId: string;
  /** * Current status of the job */
  status: string;
  /** * ID of the resulting transcription (available when completed) */
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

// Initialize the Phi-4 client for diarization (if API key is available)
const phi4Client =
  env.MICROSOFT_API_KEY ?
    new Phi4Client({
      apiKey: env.MICROSOFT_API_KEY,
      apiEndpoint: env.MICROSOFT_PHI4_API_ENDPOINT,
    })
  : null;

/** API to request a transcription for an audio file */
export const transcribe = api(
  {
    method: "POST",
    path: "/transcribe",
    expose: true,
  },
  async (req: TranscriptionRequest): Promise<TranscriptionResponse> => {
    const {
      audioFileId,
      meetingRecordId,
      model,
      language,
      priority,
      enableDiarization,
      diarizationModel,
      minSpeakers,
      maxSpeakers,
    } = req;

    // Check for diarization support
    if (enableDiarization && !phi4Client) {
      throw APIError.internal(
        "Diarization is not available: Microsoft API key not configured",
      );
    }

    // Validate that the audio file exists
    try {
      const audioFile = await media.getMediaInfo({ mediaFileId: audioFileId });
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
          status: JobStatus.QUEUED,
          priority: priority || 0,
          model: model || "whisper-1",
          language,
          audioFileId,
          meetingRecordId,
          enableDiarization: enableDiarization || false,
          diarizationModel:
            enableDiarization ? diarizationModel || "phi-4" : null,
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
        enableDiarization: enableDiarization || false,
      });

      return {
        jobId: job.id,
        status: JobStatus.QUEUED,
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

/** API to get the status of a transcription job */
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
        status: job.status as JobStatus,
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

/** API to get a transcription by ID */
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
        include: { segments: true, speakers: true },
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
        status: transcription.status as JobStatus,
        error: transcription.error || undefined,
        createdAt: transcription.createdAt,
        updatedAt: transcription.updatedAt,
        audioFileId: transcription.audioFileId,
        meetingRecordId: transcription.meetingRecordId || undefined,
        diarized: transcription.diarized,
        speakers:
          transcription.diarized ?
            transcription.speakers.map((speaker) => ({
              id: speaker.id,
              label: speaker.label,
              name: speaker.name || undefined,
            }))
          : undefined,
        segments: transcription.segments.map((segment) => ({
          index: segment.index,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence || undefined,
          ...(segment.speakerId && { speakerId: segment.speakerId }),
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

/** API to get all transcriptions for a meeting */
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
        include: { segments: true, speakers: true },
      });

      return {
        transcriptions: transcriptions.map((transcription) => ({
          id: transcription.id,
          text: transcription.text,
          language: transcription.language || undefined,
          model: transcription.model,
          confidence: transcription.confidence || undefined,
          processingTime: transcription.processingTime || undefined,
          status: transcription.status as JobStatus,
          error: transcription.error || undefined,
          createdAt: transcription.createdAt,
          updatedAt: transcription.updatedAt,
          audioFileId: transcription.audioFileId,
          meetingRecordId: transcription.meetingRecordId || undefined,
          diarized: transcription.diarized,
          speakers:
            transcription.diarized ?
              transcription.speakers.map((speaker) => ({
                id: speaker.id,
                label: speaker.label,
                name: speaker.name || undefined,
              }))
            : undefined,
          segments: transcription.segments.map((segment) => ({
            index: segment.index,
            start: segment.start,
            end: segment.end,
            text: segment.text,
            confidence: segment.confidence || undefined,
            ...(segment.speakerId && { speakerId: segment.speakerId }),
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
        status: JobStatus.QUEUED,
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

    // Get the media file details from the media service
    const mediaFile = await media.getMediaInfo({
      mediaFileId: job.audioFileId,
    });

    if (!mediaFile || !mediaFile.url) {
      throw new Error(`Media file ${job.audioFileId} not found or has no URL`);
    }

    // Create a temporary directory for the media file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcription-"));

    // Determine file type and handle appropriately
    const isVideo = mediaFile.mimetype?.startsWith("video/");
    const fileExt =
      isVideo ?
        mediaFile.mimetype?.includes("mp4") ?
          ".mp4"
        : ".webm"
      : ".mp3";

    const mediaPath = path.join(tempDir, `media${fileExt}`);
    const audioPath = isVideo ? path.join(tempDir, "audio.mp3") : mediaPath;

    // Download the media file
    await downloadFile(mediaFile.url, mediaPath);
    log.info(`Downloaded media file for job ${jobId}`, {
      jobId,
      mediaFileId: job.audioFileId,
      isVideo,
      tempDir,
    });

    // If it's a video file, extract the audio
    if (isVideo) {
      if (!phi4Client) {
        log.info(
          `Video file provided but Phi-4 client not available, extracting audio only for job ${jobId}`,
        );
      }

      log.info(`Extracting audio from video for job ${jobId}`);
      await extractAudioFromVideo(mediaPath, audioPath);
    }

    // Transcribe the audio file
    const startTime = Date.now();
    const whisperResponse = await whisperClient.transcribeFile(audioPath, {
      model: job.model,
      language: job.language || undefined,
    });
    const transcriptionTime = Math.floor((Date.now() - startTime) / 1000);

    log.info(`Successfully transcribed audio for job ${jobId}`, {
      jobId,
      processingTime: transcriptionTime,
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

    // Prepare for speaker diarization if enabled
    let diarized = false;
    let speakersData: SpeakerModel[] = [];
    let diarizedSegments = whisperResponse.segments || [];

    // Perform speaker diarization if requested and we have a phi4Client
    if (
      job.enableDiarization &&
      phi4Client &&
      whisperResponse.segments &&
      whisperResponse.segments.length > 0
    ) {
      try {
        log.info(`Starting speaker diarization for job ${jobId}`);

        const diarizationStartTime = Date.now();
        const diarizationResult = await phi4Client.diarizeAudio({
          audioPath,
          videoPath: isVideo ? mediaPath : undefined,
          transcriptionSegments: whisperResponse.segments,
          language: whisperResponse.language,
        });

        const diarizationTime = Math.floor(
          (Date.now() - diarizationStartTime) / 1000,
        );
        log.info(`Completed speaker diarization for job ${jobId}`, {
          jobId,
          speakersCount: diarizationResult.speakers.length,
          processingTime: diarizationTime,
        });

        diarized = true;
        speakersData = diarizationResult.speakers;
        diarizedSegments = diarizationResult.segments.map((s) =>
          Object.assign(s, { confidence: s.confidence ?? undefined }),
        );
      } catch (error) {
        // Log error but continue with the transcription without diarization
        log.error(`Failed to perform speaker diarization for job ${jobId}`, {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Total processing time including diarization if performed
    const processingTime = Math.floor((Date.now() - startTime) / 1000);

    // Create the transcription record
    const transcriptionData = {
      text: whisperResponse.text,
      language: whisperResponse.language,
      model: job.model,
      confidence: averageConfidence,
      processingTime,
      status: JobStatus.COMPLETED,
      audioFileId: job.audioFileId,
      meetingRecordId: job.meetingRecordId,
      diarized,
    };

    // Create transcription with speakers and segments
    const transcription = await db.transcription.create({
      include: { segments: true, speakers: true },
      data: {
        ...transcriptionData,
        // Create speakers if diarization was performed
        speakers:
          diarized ?
            {
              create: speakersData.map((speaker) => ({
                id: speaker.id,
                label: speaker.label,
                name: speaker.name,
              })),
            }
          : undefined,
        // Create segments with speaker IDs if diarized
        segments: {
          create: diarizedSegments.map((segment) => ({
            index: segment.index,
            start: segment.start,
            end: segment.end,
            text: segment.text,
            confidence: segment.confidence,
            speakerId:
              "speakerId" in segment ? (segment as any).speakerId : null,
          })),
        },
      },
    });

    // Update the job with the transcription ID
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        transcriptionId: transcription.id,
      },
    });

    log.info(`Completed transcription job ${jobId}`, {
      jobId,
      transcriptionId: transcription.id,
      segments: transcription.segments.length,
      diarized,
      speakers: diarized ? transcription.speakers.length : 0,
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
        status: JobStatus.FAILED,
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

/**
 * Utility function to extract audio from a video file
 */
async function extractAudioFromVideo(
  videoPath: string,
  audioPath: string,
): Promise<void> {
  try {
    const { exec: execCallback } = require("child_process");
    const { promisify } = require("util");
    const exec = promisify(execCallback);

    await exec(
      `ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${audioPath}"`,
    );

    log.info("Extracted audio from video", {
      videoPath,
      audioPath,
    });
  } catch (error) {
    log.error("Failed to extract audio from video", {
      videoPath,
      audioPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to extract audio from video: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
