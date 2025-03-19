import { normalizeDate, normalizeName } from "../scrapers/tgov/util";
import { db, Prisma } from "./db";
import { MeetingRecordDto } from "./db/models/dto";
import { TGovIndexMeetingRawJSON } from "./db/models/json";

import { scrapers } from "~encore/clients";

import { api, APIError } from "encore.dev/api";
import logger from "encore.dev/log";

type Sort =
  | { name: "asc" | "desc" }
  | { startedAt: "asc" | "desc" }
  | { committee: { name: "asc" | "desc" } };

type CursorPaginator =
  | { id?: string; next: number }
  | { id?: string; prev: number };

/**
 * Lists all meetings with optional filtering capabilities
 */
export const listMeetings = api(
  {
    auth: false,
    expose: true,
    method: "GET",
    path: "/tgov/meetings",
  },
  async (params: {
    hasUnsavedAgenda?: boolean;
    committeeId?: string;
    beforeDate?: Date;
    afterDate?: Date;
    cursor?: CursorPaginator;
    sort?: Sort | Sort[];
  }): Promise<{ meetings: MeetingRecordDto[]; total: number }> => {
    try {
      let where: Prisma.MeetingRecordWhereInput = {};

      if (params.committeeId) where.committeeId = params.committeeId;
      if (params.afterDate) where.startedAt = { gte: params.afterDate };

      if (params.hasUnsavedAgenda === false) {
        where.OR = [{ agendaViewUrl: null }, { agendaId: { not: null } }];
      }

      if (params.hasUnsavedAgenda === true) {
        where.AND = [{ agendaViewUrl: { not: null } }, { agendaId: null }];
      }

      const [meetings, total] = await Promise.all([
        db.meetingRecord
          .findMany({
            where,
            include: { committee: true },
            orderBy: params.sort,
          })
          .then((meetings) =>
            meetings.map((meeting) => ({
              ...meeting,
            })),
          ),
        db.meetingRecord.count({ where }),
      ]);

      logger.debug("Retrieved meetings", {
        count: meetings.length,
        total,
        committeeId: params.committeeId || "all",
      });

      return { meetings, total };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const msg = `Error while listing meetings: ${err.message}`;
      logger.error(err, msg, params);
      throw APIError.internal(msg, err);
    }
  },
);

/**
 * Lists all committees
 */
export const listCommittees = api(
  {
    auth: false,
    expose: true,
    method: "GET",
    path: "/tgov/committees",
  },
  async (): Promise<{
    committees: Array<{
      id: string;
      name: string;
    }>;
  }> => {
    try {
      const committees = await db.committee.findMany({
        orderBy: { name: "asc" },
      });

      logger.debug("Retrieved committees", { count: committees.length });

      return {
        committees: committees.map((committee) => ({
          id: committee.id,
          name: committee.name,
        })),
      };
    } catch (error) {
      logger.error("Failed to list committees", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to list committees");
    }
  },
);

export const pull = api(
  {
    method: "POST",
    expose: true,
    auth: false,
    path: "/tgov/pull",
  },
  async () => {
    const { data } = await scrapers.scrapeTGovIndex();
    const groups = Map.groupBy(data, (d) => normalizeName(d.committee));

    for (const committeeName of groups.keys()) {
      // Create or update the committee record
      const committee = await db.committee.upsert({
        where: { name: committeeName },
        update: {},
        create: { name: committeeName },
      });

      //TODO There isn't much consistency or convention in how things are named
      // Process each meeting for this committee
      for (const rawJson of groups.get(committeeName) || []) {
        const { startedAt, endedAt } = normalizeDate(rawJson);
        const name = normalizeName(`${rawJson.name}__${rawJson.date}`);

        // Create or update the meeting record
        await db.meetingRecord.upsert({
          where: {
            committeeId_startedAt: {
              committeeId: committee.id,
              startedAt,
            },
          },
          update: {},
          create: {
            name,
            rawJson,
            startedAt,
            endedAt,
            videoViewUrl: rawJson.videoViewUrl,
            agendaViewUrl: rawJson.agendaViewUrl,
            committee: { connect: committee },
          },
        });
      }
    }
  },
);

/**
 * Get a single meeting by ID with all related details
 */
export const getMeeting = api(
  {
    auth: false,
    expose: true,
    method: "GET",
    path: "/tgov/meetings/:id",
  },
  async (params: {
    id: string;
  }): Promise<{
    meeting: {
      id: string;
      name: string;
      startedAt: Date;
      endedAt: Date;
      committee: { id: string; name: string };
      videoViewUrl?: string;
      agendaViewUrl?: string;
      videoId?: string;
      audioId?: string;
      agendaId?: string;
      rawJson: TGovIndexMeetingRawJSON;
      createdAt: Date;
      updatedAt: Date;
    };
  }> => {
    const { id } = params;

    try {
      // Get the meeting with its committee relation
      const meeting = await db.meetingRecord.findUnique({
        where: { id },
        include: {
          committee: true,
        },
      });

      if (!meeting) {
        logger.info("Meeting not found", { meetingId: id });
        throw APIError.notFound(`Meeting with ID ${id} not found`);
      }

      logger.debug("Retrieved meeting details", {
        meetingId: id,
        committeeName: meeting.committee.name,
      });

      return {
        meeting: {
          id: meeting.id,
          name: meeting.name,
          startedAt: meeting.startedAt,
          endedAt: meeting.endedAt,
          committee: {
            id: meeting.committee.id,
            name: meeting.committee.name,
          },
          videoViewUrl: meeting.videoViewUrl || undefined,
          agendaViewUrl: meeting.agendaViewUrl || undefined,
          videoId: meeting.videoId || undefined,
          audioId: meeting.audioId || undefined,
          agendaId: meeting.agendaId || undefined,
          rawJson: meeting.rawJson,
          createdAt: meeting.createdAt,
          updatedAt: meeting.updatedAt,
        },
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error; // Rethrow API errors like NotFound
      }

      logger.error("Failed to get meeting", {
        meetingId: id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to get meeting details for ID ${id}`);
    }
  },
);
