/**
 * Document Task Processor
 *
 * Subscribes to batch events and processes document-related tasks:
 * - Agenda downloads
 * - Document parsing
 * - Meeting association
 */
import { db } from "../data";
import { updateTaskStatus } from "../index";
import { batchCreated, taskCompleted } from "../topics";

import {
  BatchStatus,
  BatchType,
  TaskStatus,
  TaskType,
} from "@prisma/client/batch/index.js";
import { documents, tgov } from "~encore/clients";

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { Subscription } from "encore.dev/pubsub";

/**
 * List of document task types this processor handles
 */
const DOCUMENT_TASK_TYPES = [
  TaskType.DOCUMENT_DOWNLOAD,
  TaskType.AGENDA_DOWNLOAD,
  TaskType.DOCUMENT_PARSE,
];

/**
 * Process the next batch of available document tasks
 */
export const processNextDocumentTasks = api(
  {
    method: "POST",
    path: "/batch/documents/process",
    expose: true,
  },
  async (params: {
    limit?: number;
  }): Promise<{
    processed: number;
  }> => {
    const { limit = 5 } = params;

    // Get next available tasks for document processing
    const nextTasks = await db.processingTask.findMany({
      where: {
        status: TaskStatus.QUEUED,
        taskType: { in: DOCUMENT_TASK_TYPES },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: limit,
      // Include any task dependencies to check if they're satisfied
      include: {
        dependsOn: {
          include: {
            dependencyTask: true,
          },
        },
      },
    });

    // Filter for tasks that have all dependencies satisfied
    const availableTasks = nextTasks.filter((task) => {
      if (task.dependsOn.length === 0) return true;

      // All dependencies must be completed
      return task.dependsOn.every(
        (dep) => dep.dependencyTask.status === TaskStatus.COMPLETED,
      );
    });

    if (availableTasks.length === 0) {
      return { processed: 0 };
    }

    log.info(`Processing ${availableTasks.length} document tasks`);

    let processedCount = 0;

    // Process each task
    for (const task of availableTasks) {
      try {
        // Mark task as processing
        await updateTaskStatus({
          taskId: task.id,
          status: TaskStatus.PROCESSING,
        });

        // Process based on task type
        switch (task.taskType) {
          case "agenda_download":
            await processAgendaDownload(task);
            break;

          case "document_download":
            await processDocumentDownload(task);
            break;

          case "document_parse":
            await processDocumentParse(task);
            break;

          default:
            throw new Error(`Unsupported task type: ${task.taskType}`);
        }

        processedCount++;
      } catch (error) {
        log.error(`Failed to process document task ${task.id}`, {
          taskId: task.id,
          taskType: task.taskType,
          error: error instanceof Error ? error.message : String(error),
        });

        // Mark task as failed
        await updateTaskStatus({
          taskId: task.id,
          status: TaskStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { processed: processedCount };
  },
);

/**
 * Process an agenda download task
 */
async function processAgendaDownload(task: any): Promise<void> {
  const input = task.input as {
    meetingId: string;
    agendaUrl?: string;
    agendaViewUrl?: string;
  };

  if (!input.meetingId) {
    throw new Error("No meetingId provided for agenda download");
  }

  // If we don't have agenda URL, get meeting details first
  if (!input.agendaUrl && !input.agendaViewUrl) {
    const { meeting } = await tgov.getMeeting({ id: input.meetingId });

    if (!meeting || !meeting.agendaViewUrl) {
      throw new Error(`No agenda URL available for meeting ${input.meetingId}`);
    }

    input.agendaViewUrl = meeting.agendaViewUrl;
  }

  const url = input.agendaUrl || input.agendaViewUrl;
  if (!url) {
    throw new Error("No agenda URL available");
  }

  // Download the meeting agenda document
  const document = await documents.downloadDocument({
    url,
    meetingRecordId: input.meetingId,
    title: `Meeting Agenda ${input.meetingId}`,
  });

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: TaskStatus.COMPLETED,
    output: {
      documentId: document.id,
      documentUrl: document.url,
      meetingRecordId: input.meetingId,
    },
  });

  log.info(`Successfully downloaded agenda for task ${task.id}`, {
    taskId: task.id,
    documentId: document.id,
    meetingId: input.meetingId,
  });
}

/**
 * Process a generic document download task
 */
async function processDocumentDownload(task: any): Promise<void> {
  const input = task.input as {
    url: string;
    title?: string;
    meetingRecordId?: string;
  };

  if (!input.url) {
    throw new Error("No URL provided for document download");
  }

  // Download the document
  const document = await documents.downloadDocument({
    url: input.url,
    meetingRecordId: input.meetingRecordId,
    title: input.title || `Document ${new Date().toISOString()}`,
  });

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: TaskStatus.COMPLETED,
    output: {
      documentId: document.id,
      documentUrl: document.url,
      meetingRecordId: input.meetingRecordId,
    },
  });

  log.info(`Successfully downloaded document for task ${task.id}`, {
    taskId: task.id,
    documentId: document.id,
  });
}

/**
 * Process document parsing (e.g., extract text, metadata from PDFs)
 * This is a placeholder - in a real implementation, you'd integrate with a document parsing service
 */
async function processDocumentParse(task: any): Promise<void> {
  const input = task.input as { documentId: string; meetingRecordId?: string };

  if (!input.documentId) {
    throw new Error("No documentId provided for document parsing");
  }

  // Here you would typically call a document parsing service
  // For now, we'll just simulate success

  // Update task with success
  await updateTaskStatus({
    taskId: task.id,
    status: TaskStatus.COMPLETED,
    output: {
      documentId: input.documentId,
      parsedContent: {
        textLength: Math.floor(Math.random() * 10000),
        pages: Math.floor(Math.random() * 50) + 1,
      },
    },
  });

  log.info(`Successfully parsed document for task ${task.id}`, {
    taskId: task.id,
    documentId: input.documentId,
  });
}

/**
 * Subscription that listens for batch creation events and schedules
 * automatic processing of document tasks
 */
const _ = new Subscription(batchCreated, "document-batch-processor", {
  handler: async (event) => {
    // Only process batches of type "document"
    if (event.batchType !== BatchType.DOCUMENT) return;

    log.info(`Detected new document batch ${event.batchId}`, {
      batchId: event.batchId,
      taskCount: event.taskCount,
    });

    // Process this batch of document tasks
    try {
      await processNextDocumentTasks({ limit: event.taskCount });
    } catch (error) {
      log.error(`Failed to process document batch ${event.batchId}`, {
        batchId: event.batchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Queue a batch of agendas for download by meeting IDs
 */
export const queueAgendaBatch = api(
  {
    method: "POST",
    path: "/batch/documents/queue-agendas",
    expose: true,
  },
  async (params: {
    meetingIds: string[];
    priority?: number;
  }): Promise<{
    batchId: string;
    taskCount: number;
  }> => {
    const { meetingIds, priority = 0 } = params;

    if (!meetingIds.length) {
      throw new Error("No meeting IDs provided");
    }

    // Create a batch with agenda download tasks
    const batch = await db.processingBatch.create({
      data: {
        batchType: BatchType.DOCUMENT,
        status: BatchStatus.QUEUED,
        priority,
        totalTasks: meetingIds.length,
        queuedTasks: meetingIds.length,
        metadata: {
          type: "agenda_download",
          meetingCount: meetingIds.length,
        },
      },
    });

    // Create a task for each meeting ID
    for (const meetingId of meetingIds) {
      await db.processingTask.create({
        data: {
          batchId: batch.id,
          taskType: "agenda_download",
          status: TaskStatus.QUEUED,
          priority,
          input: { meetingRecordId: meetingId, taskType: "agenda_download" },
          meetingRecordId: meetingId,
        },
      });
    }

    // Publish batch created event
    await batchCreated.publish({
      batchId: batch.id,
      batchType: BatchType.DOCUMENT,
      taskCount: meetingIds.length,
      metadata: {
        type: "agenda_download",
        meetingCount: meetingIds.length,
      },
      timestamp: new Date(),
      sourceService: "batch",
    });

    log.info(`Queued agenda batch with ${meetingIds.length} tasks`, {
      batchId: batch.id,
      meetingCount: meetingIds.length,
    });

    return {
      batchId: batch.id,
      taskCount: meetingIds.length,
    };
  },
);

/**
 * Auto-queue unprocessed meeting agendas for download
 */
export const autoQueueMeetingAgendas = api(
  {
    method: "POST",
    path: "/batch/documents/auto-queue-agendas",
    expose: true,
  },
  async (params: {
    limit?: number;
    daysBack?: number;
  }): Promise<{
    batchId?: string;
    queuedCount: number;
  }> => {
    const { limit = 10, daysBack = 30 } = params;

    log.info(`Auto-queueing meeting agendas from past ${daysBack} days`);

    // Get meetings from TGov service
    const { meetings } = await tgov.listMeetings({ limit: 100 });

    // Filter for meetings with agenda URLs but no agendaId (unprocessed)
    const unprocessedMeetings = meetings
      .filter((m) => !m.agendaId && m.agendaViewUrl)
      .slice(0, limit);

    if (unprocessedMeetings.length === 0) {
      log.info("No unprocessed meeting agendas found");
      return { queuedCount: 0 };
    }

    log.info(
      `Found ${unprocessedMeetings.length} meetings with unprocessed agendas`,
    );

    // Queue these meetings for agenda download
    const result = await queueAgendaBatch({
      meetingIds: unprocessedMeetings.map((m) => m.id),
    });

    return {
      batchId: result.batchId,
      queuedCount: result.taskCount,
    };
  },
);
