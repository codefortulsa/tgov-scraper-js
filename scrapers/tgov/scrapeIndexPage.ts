import { TGovIndexMeetingRawJSON } from "../../tgov/db/models/json";
import { launchOptions } from "../browser";
import { TGOV } from "./constants";

import logger from "encore.dev/log";

import puppeteer from "puppeteer";

/**
 * This particular scraper is only suited for view 4, currently, but apparently
 * there are others (view 1, view 2, view 3). Is the data the same?
 */
const VIEW_ID = "4";

/**
 * Scrapes the TGov index page for meeting information
 *
 * This function is responsible for extracting committee names,
 * meeting dates, durations, agenda URLs, and video URLs from
 * the TGov website and storing them in the database.
 *
 *
 * @returns A promise that resolves when scraping is complete
 */
export async function scrapeIndexPage(): Promise<TGovIndexMeetingRawJSON[]> {
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  const url = new URL(TGOV.INDEX_PATHNAME, TGOV.BASE_URL);

  url.searchParams.set("view_id", VIEW_ID);

  await page.goto(url.href, { waitUntil: "networkidle0" });

  const data = await page.evaluate(async (VIEW_ID) => {
    const results = [];

    const yearsContent = Array.from(
      document.querySelectorAll(
        ".TabbedPanelsContentGroup .TabbedPanelsContent",
      ),
    );

    for (const contentDiv of yearsContent) {
      const collapsibles = Array.from(
        contentDiv.querySelectorAll(".CollapsiblePanel"),
      );

      for (const panel of collapsibles) {
        const committee =
          panel.querySelector(".CollapsiblePanelTab")?.textContent?.trim() ||
          "Unknown Committee";

        if (committee === "Unknown Committee") {
          logger.warn("Unknown Committee found", panel);
        }

        const rows = Array.from(
          panel.querySelectorAll(".listingTable tbody .listingRow"),
        );

        for (const row of rows) {
          const columns = row.querySelectorAll("td");
          const name = columns[0]?.textContent?.trim() || "";
          const date =
            columns[1]?.textContent?.replace(/\s+/g, " ").trim() || "";

          const duration = columns[2]?.textContent?.trim() || "";

          const agendaEl = columns[3]?.querySelector("a");
          const videoEl = columns[4]?.querySelector("a");

          /**
           * This complex regex aims for a fully "correct" parsing of the `window.open`
           * expression to extract the first parameter (the URL). It handles cases where:
           *
           *  - The URL is wrapped in either single or double quotes
           *  - Escaped quotes are used within the URL
           *
           * ? For a detailed breakdown, or to change/debug, see: https://regex101.com/r/mdvRB3/1
           */
          const parser =
            /^window\.open\((?<quot>['"])(?<url>.+?)(?<!\\)\k<quot>.*\)$/;

          const base = new URL(window.location.href).origin;

          let videoViewUrl;
          videoViewUrl = parser.exec(videoEl?.getAttribute("onclick") || "");
          videoViewUrl = videoViewUrl?.groups?.url;
          videoViewUrl ||= videoEl?.getAttribute("href");
          videoViewUrl &&= new URL(videoViewUrl, base).href;
          videoViewUrl ??= undefined;

          let agendaViewUrl;
          agendaViewUrl = agendaEl?.getAttribute("href");
          agendaViewUrl &&= new URL(agendaViewUrl, base).href;
          agendaViewUrl ??= undefined;

          let clipId;

          try {
            const parsedUrl = new URL(videoViewUrl || agendaViewUrl || "");
            const clipIdParam = parsedUrl.searchParams.get("clip_id");
            if (clipIdParam) clipId = clipIdParam;
          } catch {}

          results.push({
            viewId: VIEW_ID,
            clipId,
            committee,
            name,
            date,
            duration,
            videoViewUrl,
            agendaViewUrl,
          });
        }
      }
    }

    return results;
  }, VIEW_ID);

  logger.info("Successfully scraped TGov index", data);

  return data;
}
