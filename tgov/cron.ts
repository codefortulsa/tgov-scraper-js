import { pull } from ".";

import { CronJob } from "encore.dev/cron";

/**
 * Scrapes the TGov index page daily at 12:01 AM.
 */
export const dailyTgovScrape = new CronJob("daily-tgov-scrape", {
  endpoint: pull,
  title: "TGov Daily Scrape",
  schedule: "1 0 * * *",
});
