import { launchOptions } from "./browser";
import { db } from "./data";
import { scrapeIndex } from "./scrape";

import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";

import puppeteer from "puppeteer";

/**
 * Scrape the Tulsa Government (TGov) index page for new meeting information.
 * This includes committee names, meeting names, dates, durations, agenda URLs, and video URLs.
 * The scraped data is then stored in the database for further processing.
 */
export const scrape = api(
  {
    auth: false,
    expose: true,
    method: "GET",
    path: "/scrape/tgov",
    tags: ["mvp", "scraper", "tgov"],
  },
  async (): Promise<{ success: boolean }> => {
    log.info("Starting TGov index scrape");

    try {
      await scrapeIndex();
      log.info("Successfully scraped TGov index");
      return { success: true };
    } catch (error) {
      log.error("Failed to scrape TGov index", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to scrape TGov index");
    }
  },
);

/**
 * Scrapes the TGov index page daily at 12:01 AM.
 */
export const dailyTgovScrape = new CronJob("daily-tgov-scrape", {
  endpoint: scrape,
  title: "TGov Daily Scrape",
  schedule: "1 0 * * *",
});

/**
 * Extracts video URL from a TGov viewer page
 *
 * The TGov website doesn't provide direct video URLs. This endpoint accepts
 * a viewer page URL and returns the actual video URL that can be downloaded.
 */
export const extractVideoUrl = api(
  {
    auth: false,
    expose: true,
    method: "POST",
    path: "/tgov/extract-video-url",
  },
  async (params: { viewerUrl: string }): Promise<{ videoUrl: string }> => {
    const { viewerUrl } = params;
    log.info("Extracting video URL", { viewerUrl });

    let browser;
    try {
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.goto(viewerUrl.toString(), { waitUntil: "domcontentloaded" });

      const videoUrl = await page.evaluate(() => {
        // May be defined in the global scope of the page
        var video_url: string | null | undefined;

        if (typeof video_url === "string") return video_url;

        const videoElement = document.querySelector("video > source");
        if (!videoElement) {
          throw new Error("No element found with selector 'video > source'");
        }

        video_url = videoElement.getAttribute("src");
        if (!video_url) {
          throw new Error("No src attribute found on element");
        }

        return video_url;
      });

      log.info("Successfully extracted video URL", {
        viewerUrl,
        videoUrl,
      });

      await browser.close();
      return { videoUrl };
    } catch (error) {
      log.error("Failed to extract video URL", {
        viewerUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      if (browser) {
        await browser.close();
      }

      throw APIError.internal("Failed to extract video URL from viewer page");
    }
  },
);

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
    limit?: number;
    offset?: number;
    committeeId?: string;
  }): Promise<{
    meetings: Array<{
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
    }>;
    total: number;
  }> => {
    const { limit = 20, offset = 0, committeeId } = params;

    try {
      const where = committeeId ? { committeeId } : {};

      const [meetings, total] = await Promise.all([
        db.meetingRecord.findMany({
          where,
          include: {
            committee: true,
          },
          take: limit,
          skip: offset,
          orderBy: { startedAt: "desc" },
        }),
        db.meetingRecord.count({ where }),
      ]);

      log.debug("Retrieved meetings", {
        count: meetings.length,
        total,
        committeeId: committeeId || "all",
      });

      return {
        meetings: meetings.map((meeting) => ({
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
        })),
        total,
      };
    } catch (error) {
      log.error("Failed to list meetings", {
        committeeId: committeeId || "all",
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to list meetings");
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

      log.debug("Retrieved committees", { count: committees.length });

      return {
        committees: committees.map((committee) => ({
          id: committee.id,
          name: committee.name,
        })),
      };
    } catch (error) {
      log.error("Failed to list committees", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw APIError.internal("Failed to list committees");
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
      rawJson: string;
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
        log.info("Meeting not found", { meetingId: id });
        throw APIError.notFound(`Meeting with ID ${id} not found`);
      }

      log.debug("Retrieved meeting details", {
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
          rawJson: JSON.stringify(meeting.rawJson),
          createdAt: meeting.createdAt,
          updatedAt: meeting.updatedAt,
        },
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error; // Rethrow API errors like NotFound
      }

      log.error("Failed to get meeting", {
        meetingId: id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to get meeting details for ID ${id}`);
    }
  },
);
