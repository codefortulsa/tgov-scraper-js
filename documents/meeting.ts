/**
 * Meeting Document Integration API
 *
 * This module provides functionality to download and link agenda documents
 * to specific meeting records from the TGov service.
 */
import { documents, media, tgov } from "~encore/clients";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import logger from "encore.dev/log";

import { subDays } from "date-fns";

interface MeetingDocumentResponse {
  documentId?: string;
  documentUrl?: string;
  meetingId: string;
  success: boolean;
  error?: string;
}

/**
 * Download and link meeting agenda documents based on meeting record IDs
 */
export const downloadMeetingDocuments = api(
  {
    method: "POST",
    path: "/api/meeting-documents",
    expose: true,
  },
  async (params: {
    meetingIds: string[];
    limit?: number;
  }): Promise<{
    results: MeetingDocumentResponse[];
  }> => {
    const { meetingIds, limit = 10 } = params;
    const limitedIds = meetingIds.slice(0, limit);
    const results: MeetingDocumentResponse[] = [];

    // Get meeting details with agenda view URLs from TGov service
    for (const meetingId of limitedIds) {
      try {
        // Fetch the meeting details
        const { meeting } = await tgov.getMeeting({ id: meetingId });

        if (!meeting || !meeting.agendaViewUrl) {
          results.push({
            meetingId,
            success: false,
            error: meeting ? "No agenda URL available" : "Meeting not found",
          });
          continue;
        }

        // Download the agenda document
        const document = await documents.downloadDocument({
          url: meeting.agendaViewUrl,
          meetingRecordId: meetingId,
          title: `${meeting.committee.name} - ${meeting.name} Agenda`,
        });

        results.push({
          documentId: document.id,
          documentUrl: document.url,
          meetingId,
          success: true,
        });
      } catch (error: any) {
        logger.error(
          `Error processing meeting document for ${meetingId}: ${error.message}`,
        );
        results.push({
          meetingId,
          success: false,
          error: error.message,
        });
      }
    }

    return { results };
  },
);

/**
 * Download agendas for all recent meetings without linked agenda documents
 */
export const processPendingAgendas = api(
  {
    method: "POST",
    path: "/api/meeting-documents/process-pending",
    expose: true,
  },
  async (params: {
    limit?: number;
    daysBack?: number;
  }): Promise<{
    processed: number;
    successful: number;
    failed: number;
  }> => {
    const { limit = 10, daysBack = 30 } = params;

    // Get meetings from the last X days that don't have agendas
    const { meetings } = await tgov.listMeetings({});
    const startAfterDate = subDays(new Date(), daysBack);
    const meetingsNeedingAgendas = meetings
      .filter(
        (m) =>
          !m.agendaId &&
          m.agendaViewUrl &&
          m.startedAt.getTime() > startAfterDate.getTime(),
      )
      .slice(0, limit);

    let successful = 0;
    let failed = 0;

    if (meetingsNeedingAgendas.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    // Process each meeting
    const results = await downloadMeetingDocuments({
      meetingIds: meetingsNeedingAgendas.map((m) => m.id),
    });

    // Count successes and failures
    for (const result of results.results) {
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      processed: results.results.length,
      successful,
      failed,
    };
  },
);

/**
 * Comprehensive automation endpoint that processes both documents and media for meetings
 *
 * This endpoint can be used to:
 * 1. Find unprocessed meeting documents (agendas)
 * 2. Optionally queue corresponding videos for processing
 * 3. Coordinates the relationship between meetings, documents, and media
 */
export const autoProcessMeetingDocuments = api(
  {
    method: "POST",
    path: "/api/meeting-documents/auto-process",
    expose: true,
  },
  async (params: {
    limit?: number;
    daysBack?: number;
    queueVideos?: boolean;
    transcribeAudio?: boolean;
  }): Promise<{
    processedAgendas: number;
    successfulAgendas: number;
    failedAgendas: number;
    queuedVideos?: number;
    videoBatchId?: string;
  }> => {
    const {
      limit = 10,
      daysBack = 30,
      queueVideos = false,
      transcribeAudio = false,
    } = params;

    logger.info(`Auto-processing meeting documents with options:`, {
      limit,
      daysBack,
      queueVideos,
      transcribeAudio,
    });

    try {
      // Step 1: Get meetings from the TGov service that need processing
      const { meetings } = await tgov.listMeetings({
        hasUnsavedAgenda: true,
        cursor: { next: 100 },
      });

      // Filter for meetings with missing agendas but have agenda URLs
      const meetingsNeedingAgendas = meetings
        .filter((m) => !m.agendaId && m.agendaViewUrl)
        .slice(0, limit);

      logger.info(
        `Found ${meetingsNeedingAgendas.length} meetings needing agendas`,
      );

      // Step 2: Process agendas first
      let agendaResults = { processed: 0, successful: 0, failed: 0 };

      if (meetingsNeedingAgendas.length > 0) {
        // Download and associate agenda documents
        agendaResults = await processPendingAgendas({
          limit: meetingsNeedingAgendas.length,
        });

        logger.info(
          `Processed ${agendaResults.processed} agendas, ${agendaResults.successful} successful`,
        );
      }

      // Step 3: If requested, also queue videos for processing
      let queuedVideos = 0;
      let videoBatchId: string | undefined;

      if (queueVideos) {
        // Find meetings with video URLs but no processed videos
        const meetingsNeedingVideos = meetings
          .filter((m) => !m.videoId && m.videoViewUrl)
          .slice(0, limit);

        if (meetingsNeedingVideos.length > 0) {
          logger.info(
            `Found ${meetingsNeedingVideos.length} meetings needing video processing`,
          );

          // Queue video batch processing
          const videoResult = await media.autoQueueNewMeetings({
            limit: meetingsNeedingVideos.length,
            autoTranscribe: transcribeAudio,
          });

          queuedVideos = videoResult.queuedMeetings;
          videoBatchId = videoResult.batchId;

          logger.info(`Queued ${queuedVideos} videos for processing`, {
            batchId: videoBatchId,
            transcriptionJobs: videoResult.transcriptionJobs,
          });
        } else {
          logger.info("No meetings need video processing");
        }
      }

      return {
        processedAgendas: agendaResults.processed,
        successfulAgendas: agendaResults.successful,
        failedAgendas: agendaResults.failed,
        queuedVideos: queueVideos ? queuedVideos : undefined,
        videoBatchId: videoBatchId,
      };
    } catch (error) {
      logger.error("Failed to auto-process meeting documents", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to auto-process meeting documents");
    }
  },
);

/**
 * Auto process meeting documents without parameters - wrapper for cron job
 * // TODO: TEST THIS
 */
export const autoProcessMeetingDocumentsCronTarget = api(
  {
    method: "POST",
    path: "/documents/auto-process/cron",
    expose: false,
  },
  async () => {
    // Call with default parameters
    return autoProcessMeetingDocuments({
      daysBack: 30,
      queueVideos: true,
      limit: 10,
    });
  },
);

/**
 * Cron job to automatically process pending meeting documents
 * Runs daily at 2:30 AM to check for new unprocessed agendas and videos
 */
export const autoProcessDocumentsCron = new CronJob("auto-process-documents", {
  title: "Auto-Process Meeting Documents",
  schedule: "30 2 * * *", // Daily at 2:30 AM
  endpoint: autoProcessMeetingDocumentsCronTarget,
});
