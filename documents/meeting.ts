/**
 * Meeting Document Integration API
 *
 * This module provides functionality to download and link agenda documents
 * to specific meeting records from the TGov service.
 */
import { documents, tgov } from "~encore/clients";

import { api } from "encore.dev/api";
import logger from "encore.dev/log";

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
    const meetings = await tgov.listMeetings({});
    const meetingsNeedingAgendas = meetings.meetings
      .filter((m) => !m.agendaId && m.agendaViewUrl)
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
