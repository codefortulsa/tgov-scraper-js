/**
 * Media Task Processor
 *
 * Subscribes to batch events and processes media-related tasks:
 * - Video downloads
 * - Audio extraction
 * - Media file management
 */
import { db } from "../db";
import { BatchType } from "../db/client";
import { $TaskType, JobStatus, TaskType } from "../db/models/db";
import { updateTaskStatus } from "../index";
import { batchCreated, taskCompleted } from "../topics";

import { media, tgov } from "~encore/clients";

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { Subscription } from "encore.dev/pubsub";

/**
 * List of media task types this processor handles
 */
const MEDIA_TASK_TYPES = [
  TaskType.VIDEO_DOWNLOAD,
  TaskType.AUDIO_EXTRACT,
  TaskType.VIDEO_PROCESS,
] satisfies Array<$TaskType> & { length: 3 };

/**
 * Process the next batch of available media tasks
 */
export const processNextMediaTasks = api(
  {
    method: "POST",
    path: "/batch/media/process",
    expose: true,
  },
  async (params: {
    limit?: number;
  }): Promise<{
    processed: number;
  }> => {
    const { limit = 5 } = params;

    // Get next available tasks for media processing

    const nextTasks = await db.processingTask.findMany({
      take: limit,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      where: {
        status: JobStatus.QUEUED,
        taskType: { in: MEDIA_TASK_TYPES },
        dependsOn: {
          every: {
            dependencyTask: {
              status: {
                in: [JobStatus.COMPLETED, JobStatus.COMPLETED_WITH_ERRORS],
              },
            },
          },
        },
      },
    });

    if (nextTasks.length === 0) return { processed: 0 };

    log.info(`Processing ${nextTasks.length} media tasks`);

    let processedCount = 0;

    // Process each task
    for (const task of nextTasks) {
      try {
        // Mark task as processing
        await updateTaskStatus({
          taskId: task.id,
          status: JobStatus.PROCESSING,
        });

        // Process based on task type
        switch (task.taskType) {
          case TaskType.VIDEO_DOWNLOAD:
            await processVideoDownload(task);
            break;

          case TaskType.AUDIO_EXTRACT:
            await processAudioExtract(task);
            break;

          case TaskType.VIDEO_PROCESS:
            await processVideoComplete(task);
            break;

          default:
            throw new Error(`Unsupported task type: ${task.taskType}`);
        }

        processedCount++;
      } catch (error) {
        log.error(`Failed to process media task ${task.id}`, {
          taskId: task.id,
          taskType: task.taskType,
          error: error instanceof Error ? error.message : String(error),
        });

        // Mark task as failed
        await updateTaskStatus({
          taskId: task.id,
          status: JobStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { processed: processedCount };
  },
);

/**
 * Process a video download task
 */
async function processVideoDownload(task: any): Promise<void> {
  const input = task.input as {
    viewerUrl?: string;
    downloadUrl?: string;
    meetingRecordId?: string;
  };

  if (!input.viewerUrl && !input.downloadUrl) {
    throw new Error("Neither viewerUrl nor downloadUrl provided");
  }

  let downloadUrl = input.downloadUrl;

  // If we only have a viewer URL, extract the download URL
  if (!downloadUrl && input.viewerUrl) {
    const extractResult = await tgov.extractVideoUrl({
      viewerUrl: input.viewerUrl,
    });

    downloadUrl = extractResult.videoUrl;
  }

  if (!downloadUrl) throw new Error("Failed to determine download URL");

  // Download the video
  const downloadResult = await media.downloadVideos({
    url: downloadUrl,
    meetingRecordId: input.meetingRecordId,
  });

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: JobStatus.COMPLETED,
    output: {
      videoId: downloadResult.videoId,
      videoUrl: downloadResult.videoUrl,
    },
  });

  log.info(`Successfully downloaded video for task ${task.id}`, {
    taskId: task.id,
    videoId: downloadResult.videoId,
  });
}

/**
 * Process an audio extraction task
 */
async function processAudioExtract(task: any): Promise<void> {
  const input = task.input as { videoId: string; meetingRecordId?: string };

  if (!input.videoId) {
    throw new Error("No videoId provided for audio extraction");
  }

  // Extract audio from video
  const extractResult = await media.extractAudio({
    videoId: input.videoId,
    meetingRecordId: input.meetingRecordId,
  });

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: JobStatus.COMPLETED,
    output: {
      audioId: extractResult.audioId,
      audioUrl: extractResult.audioUrl,
      videoId: input.videoId,
    },
  });

  log.info(`Successfully extracted audio for task ${task.id}`, {
    taskId: task.id,
    videoId: input.videoId,
    audioId: extractResult.audioId,
  });
}

/**
 * Process a complete video processing task (download + extract in one operation)
 */
async function processVideoComplete(task: any): Promise<void> {
  const input = task.input as {
    viewerUrl?: string;
    downloadUrl?: string;
    meetingRecordId?: string;
    extractAudio?: boolean;
  };

  if (!input.viewerUrl && !input.downloadUrl) {
    throw new Error("Neither viewerUrl nor downloadUrl provided");
  }

  let downloadUrl = input.downloadUrl;

  // If we only have a viewer URL, extract the download URL
  if (!downloadUrl && input.viewerUrl) {
    const extractResult = await tgov.extractVideoUrl({
      viewerUrl: input.viewerUrl,
    });

    downloadUrl = extractResult.videoUrl;
  }

  if (!downloadUrl) {
    throw new Error("Failed to determine download URL");
  }

  // Process the media (download + extract audio if requested)
  const processResult = await media.processMedia(downloadUrl, {
    extractAudio: input.extractAudio ?? true,
    meetingRecordId: input.meetingRecordId,
  });

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: JobStatus.COMPLETED,
    output: {
      videoId: processResult.videoId,
      videoUrl: processResult.videoUrl,
      audioId: processResult.audioId,
      audioUrl: processResult.audioUrl,
    },
  });

  log.info(`Successfully processed video for task ${task.id}`, {
    taskId: task.id,
    videoId: processResult.videoId,
    audioId: processResult.audioId,
  });
}

/**
 * Subscription that listens for batch creation events and schedules
 * automatic processing of media tasks
 */
const _ = new Subscription(batchCreated, "media-batch-processor", {
  handler: async (event) => {
    // Only process batches of type "media"
    if (event.batchType !== BatchType.MEDIA) return;

    log.info(`Detected new media batch ${event.batchId}`, {
      batchId: event.batchId,
      taskCount: event.taskCount,
    });

    // Process this batch of media tasks
    try {
      await processNextMediaTasks({ limit: event.taskCount });
    } catch (error) {
      log.error(`Failed to process media batch ${event.batchId}`, {
        batchId: event.batchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Subscription that listens for task completion events to trigger
 * dependent tasks or follow-up processing
 */
const __ = new Subscription(taskCompleted, "media-task-completion-handler", {
  handler: async (event) => {
    // Check if this is a media task that might trigger follow-up actions
    if (!event.success) return; // Skip failed tasks

    // If a video download task completed, check if we need to extract audio
    if (event.taskType === "video_download") {
      // Check if there's a pending audio extraction task dependent on this
      // In a real implementation, this would check task dependencies
      // For this example, we'll just log the completion
      log.info(`Video download completed for task ${event.taskId}`, {
        taskId: event.taskId,
        resourceIds: event.resourceIds,
      });
    }
  },
});
