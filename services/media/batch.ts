/**
 * Video Batch Processing API Endpoints
 *
 * Provides batch processing endpoints for video acquisition and processing,
 * designed for handling multiple videos concurrently or in the background.
 */
import { JobStatus } from "../enums";
import { db } from "./db";
import { processMedia } from "./processor";

import { scrapers, tgov, transcription } from "~encore/clients";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import logger from "encore.dev/log";

import { subDays } from "date-fns";

// Interface for batch processing request
interface BatchProcessRequest {
  viewerUrls?: string[];
  meetingRecordIds?: string[];
  extractAudio?: boolean;
  batchSize?: number;
}

interface BatchProcessResponse {
  batchId: string;
  totalVideos: number;
  status: "queued" | "processing" | "completed" | "failed";
}

/**
 * Queue a batch of videos for processing
 * // TODO: TEST THIS
 *
 * This endpoint accepts an array of viewer URLs and queues them for processing.
 * It returns a batch ID that can be used to check the status of the batch.
 */
export const queueVideoBatch = api(
  {
    method: "POST",
    path: "/api/videos/batch/queue",
    expose: true,
  },
  async (req: BatchProcessRequest): Promise<BatchProcessResponse> => {
    if (!req.viewerUrls || req.viewerUrls.length === 0) {
      throw new Error("No viewer URLs provided");
    }

    // Create a batch record in the database
    const batch = await db.$transaction(
      async (tx) => {
        // First, create entries for each URL to be processed
        const videoTasks = await Promise.all(
          (req.viewerUrls ?? []).map(async (url, index) => {
            const { videoUrl } = await scrapers.scrapeVideoDownloadUrl({
              hint: { url },
            });

            return tx.videoProcessingTask.create({
              data: {
                viewerUrl: url,
                meetingRecordId: req.meetingRecordIds?.[index],
                status: "queued",
                extractAudio: req.extractAudio ?? true,
                downloadUrl: videoUrl,
              },
            });
          }),
        );

        // Then create the batch that references these tasks
        return tx.videoProcessingBatch.create({
          data: {
            status: "queued",
            totalTasks: videoTasks.length,
            completedTasks: 0,
            failedTasks: 0,
            tasks: {
              connect: videoTasks.map((task) => ({ id: task.id })),
            },
          },
        });
      },
      { timeout: 10000 },
    );

    logger.info(`Queued batch ${batch.id} with ${batch.totalTasks} videos`);

    return {
      batchId: batch.id,
      totalVideos: batch.totalTasks,
      status: batch.status as BatchProcessResponse["status"],
    };
  },
);

/**
 * Get the status of a batch
 * // TODO: TEST THIS
 */
export const getBatchStatus = api(
  {
    method: "GET",
    path: "/api/videos/batch/:batchId",
    expose: true,
  },
  async ({ batchId }: { batchId: string }) => {
    const batch = await db.videoProcessingBatch.findUnique({
      where: { id: batchId },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    return {
      id: batch.id,
      status: batch.status,
      totalTasks: batch.totalTasks,
      completedTasks: batch.completedTasks,
      failedTasks: batch.failedTasks,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      tasks: batch.tasks.map((task) => ({
        id: task.id,
        viewerUrl: task.viewerUrl,
        meetingRecordId: task.meetingRecordId,
        downloadUrl: task.downloadUrl,
        status: task.status,
        videoId: task.videoId,
        audioId: task.audioId,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
    };
  },
);

/**
 * List all batches
 * // TODO: TEST THIS
 */
export const listBatches = api(
  {
    method: "GET",
    path: "/api/videos/batches",
    expose: true,
  },
  async ({ limit = 10, offset = 0 }: { limit?: number; offset?: number }) => {
    const batches = await db.videoProcessingBatch.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    return batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      totalTasks: batch.totalTasks,
      completedTasks: batch.completedTasks,
      failedTasks: batch.failedTasks,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      taskCount: batch._count.tasks,
    }));
  },
);

/**
 * Process a batch of videos
 */
export const processNextBatch = api(
  {
    method: "POST",
    path: "/api/videos/batch/process",
    expose: true,
  },
  async ({
    batchSize = 5,
  }: {
    batchSize?: number;
  }): Promise<{ processed: number }> => {
    // Find the oldest queued batch
    const queuedBatch = await db.videoProcessingBatch.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      include: {
        tasks: {
          where: { status: "queued" },
          take: batchSize,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!queuedBatch || queuedBatch.tasks.length === 0) {
      return { processed: 0 };
    }

    // Update batch status to processing
    await db.videoProcessingBatch.update({
      where: { id: queuedBatch.id },
      data: { status: "processing" },
    });

    logger.info(
      `Processing batch ${queuedBatch.id} with ${queuedBatch.tasks.length} videos`,
    );

    let processed = 0;

    // Process each task in the batch
    for (const task of queuedBatch.tasks) {
      try {
        // Step 1: Update task status to processing
        await db.videoProcessingTask.update({
          where: { id: task.id },
          data: { status: JobStatus.PROCESSING },
        });

        // Step 2: Extract the download URL
        let downloadUrl = task.downloadUrl;

        if (!downloadUrl && task.viewerUrl) {
          // Scrape the download URL from the TGov service
          const { videoUrl } = await scrapers.scrapeVideoDownloadUrl({
            hint: { url: task.viewerUrl },
          });

          downloadUrl = videoUrl;

          // Update the task with the download URL
          await db.videoProcessingTask.update({
            where: { id: task.id },
            data: { downloadUrl },
          });
        }

        if (!downloadUrl) throw new Error("No download URL available");

        // Step 3: Process the video
        const result = await processMedia(downloadUrl, {
          extractAudio: task.extractAudio,
          meetingRecordId: task.meetingRecordId || undefined,
        });

        // Step 4: Update the task with the result
        await db.videoProcessingTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            videoId: result.videoId,
            audioId: result.audioId,
          },
        });

        processed++;
      } catch (error: any) {
        logger.error(`Error processing task ${task.id}: ${error.message}`);

        // Update the task with the error
        await db.videoProcessingTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error: error.message,
          },
        });

        // Update batch failed count
        await db.videoProcessingBatch.update({
          where: { id: queuedBatch.id },
          data: {
            failedTasks: { increment: 1 },
          },
        });
      }
    }

    // Check if all tasks are completed
    const remainingTasks = await db.videoProcessingTask.count({
      where: {
        batchId: queuedBatch.id,
        status: { in: ["queued", "processing"] },
      },
    });

    if (remainingTasks === 0) {
      await db.videoProcessingBatch.update({
        where: { id: queuedBatch.id },
        data: {
          status: "completed",
          completedTasks: queuedBatch.totalTasks - queuedBatch.failedTasks,
        },
      });
    } else {
      await db.videoProcessingBatch.update({
        where: { id: queuedBatch.id },
        data: {
          completedTasks: { increment: processed },
        },
      });
    }

    return { processed };
  },
);

/**
 * Auto-queue unprocessed meeting videos for processing
 *
 * This endpoint fetches recent meetings with video URLs that haven't been processed yet,
 * queues them for video processing, and optionally initiates transcription jobs.
 */
export const autoQueueNewMeetings = api(
  {
    method: "POST",
    path: "/api/videos/auto-queue",
    expose: true,
  },
  async ({
    daysBack = 30,
    limit = 10,
    autoTranscribe = true,
  }: {
    daysBack?: number;
    limit?: number;
    autoTranscribe?: boolean;
  }): Promise<{
    batchId?: string;
    queuedMeetings: number;
    transcriptionJobs: number;
  }> => {
    logger.info(
      `Searching for unprocessed meetings from past ${daysBack} days`,
    );

    // Get recent meetings from TGov service
    const { meetings } = await tgov.listMeetings({
      afterDate: subDays(new Date(), daysBack),
      next: limit,
    });

    // Filter for meetings with video URLs but no videoId (unprocessed)
    const unprocessedMeetings = meetings.filter(
      (meeting) => meeting.videoViewUrl && !meeting.videoId,
    );

    if (unprocessedMeetings.length === 0) {
      logger.info("No unprocessed meetings found");
      return { queuedMeetings: 0, transcriptionJobs: 0 };
    }

    // Limit the number of meetings to process
    const meetingsToProcess = unprocessedMeetings.slice(0, limit);

    logger.info(
      `Queueing ${meetingsToProcess.length} unprocessed meetings for video processing`,
    );

    try {
      // Queue the videos for processing
      const response = await queueVideoBatch({
        viewerUrls: meetingsToProcess.map((m) => m.videoViewUrl!),
        meetingRecordIds: meetingsToProcess.map((m) => m.id),
        extractAudio: true,
      });

      logger.info(
        `Successfully queued batch ${response.batchId} with ${response.totalVideos} videos`,
      );

      // Immediately process this batch
      await processNextBatch({ batchSize: meetingsToProcess.length });

      // If autoTranscribe is enabled, wait for video processing and then queue transcriptions
      let transcriptionJobsCreated = 0;

      if (autoTranscribe) {
        // Give some time for video processing to complete
        // In a production system, you might want a more sophisticated approach with callbacks
        logger.info("Scheduling transcription jobs for processed videos");

        // Get the batch status after processing
        const batchStatus = await getBatchStatus({ batchId: response.batchId });

        // Queue transcription for successfully processed videos
        const completedTasks = batchStatus.tasks.filter(
          (task) => task.status === "completed" && task.audioId,
        );

        for (const task of completedTasks) {
          try {
            if (task.audioId) {
              await transcription.transcribe({
                audioFileId: task.audioId,
                meetingRecordId: task.meetingRecordId ?? undefined,
              });
              transcriptionJobsCreated++;
            }
          } catch (error) {
            logger.error(
              `Failed to create transcription job for task ${task.id}`,
              { error: error instanceof Error ? error.message : String(error) },
            );
          }
        }

        logger.info(`Created ${transcriptionJobsCreated} transcription jobs`);
      }

      return {
        batchId: response.batchId,
        queuedMeetings: meetingsToProcess.length,
        transcriptionJobs: transcriptionJobsCreated,
      };
    } catch (error) {
      logger.error("Failed to auto-queue meetings", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to auto-queue meetings for processing");
    }
  },
);

/**
 * Automatic batch processing endpoint for cron job
 * // TODO: TEST THIS
 */
export const processNextBatchCronTarget = api(
  {
    method: "POST",
    path: "/api/videos/batch/auto-process",
    expose: true,
  },
  async () => {
    return processNextBatch({ batchSize: 5 });
  },
);

/**
 * Auto-queue new meetings without parameters - wrapper for cron job
 * // TODO: TEST THIS
 */
export const autoQueueNewMeetingsCronTarget = api(
  {
    method: "POST",
    path: "/api/videos/auto-queue/cron",
    expose: false,
  },
  async () => {
    // Call with default parameters
    return autoQueueNewMeetings({
      daysBack: 30,
      limit: 10,
      autoTranscribe: true,
    });
  },
);

/**
 * Cron job to process video batches
 */
export const autoProcessNextBatchCron = new CronJob("process-video-batches", {
  title: "Process Video Batches",
  schedule: "*/5 * * * *", // Every 5 minutes
  endpoint: processNextBatchCronTarget,
});

/**
 * Cron job to auto-queue new meetings for processing
 * Runs daily at 3:00 AM to check for new unprocessed meetings
 */
export const autoQueueNewMeetingsCron = new CronJob("auto-queue-meetings", {
  title: "Auto-Queue New Meeting Videos",
  schedule: "0 3 * * *", // Daily at 3:00 AM
  endpoint: autoQueueNewMeetingsCronTarget,
});
