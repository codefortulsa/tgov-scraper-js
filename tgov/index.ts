import { CronJob } from "encore.dev/cron";
import { api } from "encore.dev/api";
import logger from 'encore.dev/log';
import puppeteer from "puppeteer";

import { launchOptions } from "./browser";
import { scrapeIndex } from "./scrape";
import { db } from "./data";

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
    const result = await scrapeIndex()
      .then(() => {
        logger.info("Scraped TGov index");
        return { success: true };
      })
      .catch((e) => {
        logger.error(e);
        return { success: false };
      });

    return result;
  }
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
    logger.info(`Extracting video URL from: ${viewerUrl}`);

    const browser = await puppeteer.launch(launchOptions);
    try {
      const page = await browser.newPage();
      await page.goto(viewerUrl.toString(), { waitUntil: "domcontentloaded" });

      const videoUrl = await page.evaluate(() => {
        // May be defined in the global scope of the page
        var video_url: string | null | undefined;

        if (typeof video_url === "string") return video_url;

        const videoElement = document.querySelector("video > source");
        if (!videoElement)
          throw new Error("No element found with selector 'video > source'");

        video_url = videoElement.getAttribute("src");
        if (!video_url) throw new Error("No src attribute found on element");

        return video_url;
      });

      await browser.close();
      logger.info(`Extracted video URL: ${videoUrl}`);
      return { videoUrl };
    } catch (error) {
      await browser.close();
      logger.error(`Failed to extract video URL: ${error}`);
      throw error;
    }
  }
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

    return {
      meetings: meetings.map(meeting => ({
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
  }
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
    const committees = await db.committee.findMany({
      orderBy: { name: "asc" },
    });

    return {
      committees: committees.map(committee => ({
        id: committee.id,
        name: committee.name,
      })),
    };
  }
);