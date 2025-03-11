/**
 * Video Batch Processing API Endpoints
 *
 * Provides batch processing endpoints for video acquisition and processing,
 * designed for handling multiple videos concurrently or in the background.
 */
import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import logger from "encore.dev/log";
import { db } from "../data";
import { processVideo } from "./index";
import { scrapeVideos } from "./api";

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
    const batch = await db.$transaction(async (tx) => {
      // First, create entries for each URL to be processed
      const videoTasks = await Promise.all(
        req.viewerUrls!.map(async (url, index) => {
          return tx.videoProcessingTask.create({
            data: {
              viewerUrl: url,
              meetingRecordId: req.meetingRecordIds?.[index],
              status: "queued",
              extractAudio: req.extractAudio ?? true,
            },
          });
        })
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
    });

    logger.info(`Queued batch ${batch.id} with ${batch.totalTasks} videos`);

    return {
      batchId: batch.id,
      totalVideos: batch.totalTasks,
      status: batch.status as "queued" | "processing" | "completed" | "failed",
    };
  }
);

/**
 * Get the status of a batch
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
      batchId: batch.id,
      status: batch.status,
      totalTasks: batch.totalTasks,
      completedTasks: batch.completedTasks,
      failedTasks: batch.failedTasks,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      tasks: batch.tasks.map((task) => ({
        id: task.id,
        viewerUrl: task.viewerUrl,
        downloadUrl: task.downloadUrl,
        status: task.status,
        videoId: task.videoId,
        audioId: task.audioId,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
    };
  }
);

/**
 * List all batches
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
    }));
  }
);

/**
 * Process the next batch of videos
 *
 * This endpoint processes a certain number of queued videos.
 * It's designed to be called by a cron job.
 */
export const processNextBatch = api(
  {
    method: "POST",
    path: "/api/videos/batch/process",
  },
  async ({ batchSize = 5 }: { batchSize?: number }) => {
    // Find batches with queued status
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
      `Processing batch ${queuedBatch.id} with ${queuedBatch.tasks.length} videos`
    );

    let processed = 0;

    // Process each task in the batch
    for (const task of queuedBatch.tasks) {
      try {
        // Step 1: Update task status to processing
        await db.videoProcessingTask.update({
          where: { id: task.id },
          data: { status: "processing" },
        });

        // Step 2: Extract the download URL
        let downloadUrl = task.downloadUrl;

        if (!downloadUrl && task.viewerUrl) {
          // Scrape the download URL
          const scrapeResult = await scrapeVideos({
            viewerUrls: [task.viewerUrl],
          });

          if (scrapeResult.results[0].error) {
            throw new Error(scrapeResult.results[0].error);
          }

          downloadUrl = scrapeResult.results[0].downloadUrl;

          // Update the task with the download URL
          await db.videoProcessingTask.update({
            where: { id: task.id },
            data: { downloadUrl },
          });
        }

        if (!downloadUrl) {
          throw new Error("No download URL available");
        }

        // Step 3: Process the video
        const result = await processVideo(downloadUrl, {
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

    // Update batch completed count and check if all tasks are done
    const updatedBatch = await db.videoProcessingBatch.update({
      where: { id: queuedBatch.id },
      data: {
        completedTasks: { increment: processed },
      },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    // Check if all tasks are completed or failed
    if (
      updatedBatch.completedTasks + updatedBatch.failedTasks >=
      updatedBatch._count.tasks
    ) {
      await db.videoProcessingBatch.update({
        where: { id: queuedBatch.id },
        data: { status: "completed" },
      });
    }

    return { processed };
  }
);

/**
 * Endpoint that takes no params and delegates to the processNextBatch endpoint
 * to use the default batch size (specifically for use with cron jobs)
 * @see processNextBatch
 */
export const autoProcessNextBatch = api(
  {
    method: "POST",
    path: "/api/videos/batch/auto-process",
    expose: true,
  },
  async () => {
    return processNextBatch({});
  } 
)

/**
 * Cron job to process video batches
 */
export const processBatchesCron = new CronJob("process-video-batches", {
  title: "Process Video Batches",
  schedule: "*/5 * * * *", // Every 5 minutes
  endpoint: autoProcessNextBatch,
});
