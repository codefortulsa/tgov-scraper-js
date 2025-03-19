import { TGovIndexMeetingRawJSON } from "../../tgov/db/models/json";
import { scrapeIndexPage } from "./scrapeIndexPage";
import { scrapeMediaPage } from "./scrapeMediaPage";

import { api, APIError } from "encore.dev/api";
import logger from "encore.dev/log";

type TgovScrapeResponse = { data: TGovIndexMeetingRawJSON[] };

/**
 * Scrape the Tulsa Government (TGov) index page for new meeting information.
 * This includes committee names, meeting names, dates, durations, agenda URLs, and video URLs.
 * The scraped data is then stored in the database for further processing.
 */
export const scrapeTGovIndex = api(
  {
    auth: false,
    expose: true,
    method: "GET",
    path: "/scrape/tgov",
    tags: ["mvp", "scraper", "tgov"],
    
  },
  async (): Promise<TgovScrapeResponse> => {
    try {
      logger.info("Starting TGov index scrape");
      const data = await scrapeIndexPage();
      return { data };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const msg = `Error while scraping TGov index: ${err.message}`;
      logger.error(err, msg);
      throw APIError.internal(msg, err);
    }
  },
);

type TgovScrapeVideoParams = {
  hint: { meetingId: string } | { clipId: string } | { url: string };
};

type TgovScrapeVideoResponse = { videoUrl: string };

/**
 * Extracts video URL from a TGov viewer page
 *
 * The TGov website doesn't provide direct video URLs. This endpoint accepts
 * a viewer page URL and returns the actual video URL that can be downloaded.
 */
export const scrapeVideoDownloadUrl = api(
  {
    auth: false,
    expose: true,
    method: "POST",
    path: "/scrape/tgov/video-url",
  },
  async (params: TgovScrapeVideoParams): Promise<TgovScrapeVideoResponse> => {
    try {
      logger.info("Extracting video download URL from viewer", params);
      const videoUrl = await scrapeMediaPage(params.hint);
      return { videoUrl };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const msg = `Error while extracting video URL: ${err.message}`;
      logger.error(err, msg, params);
      throw APIError.internal(msg, err);
    }
  },
);
