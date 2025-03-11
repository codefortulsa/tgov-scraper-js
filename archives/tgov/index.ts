import { CronJob } from "encore.dev/cron";
import { api } from "encore.dev/api";
import logger from 'encore.dev/log';

import { scrapeIndex } from "./scrape";

/**
 * Scrape the Tulsa Government (TGov) index page for new meeting information.
 * This includes committee names, meeting names, dates, durations, agenda URLs, and video URLs.
 * The scraped data is then stored in the database for further processing.
 */
export const scrape_tgov = api(
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
  endpoint: scrape_tgov,
  title: "TGov Daily Scrape",
  schedule: "1 0 * * *",
});
