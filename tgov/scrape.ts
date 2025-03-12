import { launchOptions } from "./browser";
import { tgov_urls } from "./constants";
import { db } from "./data";
import { normalizeDate, normalizeName } from "./util";

import logger from "encore.dev/log";

import puppeteer from "puppeteer";

/**
 * Scrapes the TGov index page for meeting information
 *
 * This function is responsible for extracting committee names,
 * meeting dates, durations, agenda URLs, and video URLs from
 * the TGov website and storing them in the database.
 *
 * ! — this particular scraper is only suited for view 4, currently
 *
 * @returns {Promise<void>} A promise that resolves when scraping is complete
 */
export async function scrapeIndex(): Promise<void> {
  // Specify the view ID for the TGov index page
  const VIEW_ID = "4";

  const url = new URL(tgov_urls.TGOV_INDEX_PATHNAME, tgov_urls.TGOV_BASE_URL);
  url.searchParams.set("view_id", VIEW_ID);

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  await page.goto(url.href, { waitUntil: "networkidle0" });

  const data = await page.evaluate(async () => {
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
          const videoViewUrl =
            /^window\.open\((?<quot>['"])(?<url>.+?)(?<!\\)\k<quot>.*\)$/.exec(
              videoEl?.getAttribute("onclick") || "",
            )?.groups?.url ||
            videoEl?.getAttribute("href") ||
            undefined;
          const agendaViewUrl = agendaEl?.getAttribute("href") || undefined;

          let clipId;

          try {
            const parsedUrl = new URL(videoViewUrl || agendaViewUrl || "");
            const clipIdParam = parsedUrl.searchParams.get("clip_id");
            if (clipIdParam) clipId = clipIdParam;
          } catch {}

          results.push({
            clipId,
            committee,
            name,
            date,
            duration,
            agendaViewUrl,
            videoViewUrl,
          });
        }
      }
    }

    return results;
  });

  await browser.close();

  /* 
    Debugging inside the browser context is difficult, so we do minimal processing
    in the browser context and do the rest here.
  */
  const groups = Map.groupBy(data, ({ committee }) => normalizeName(committee));

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
          rawJson: {
            ...rawJson,
            viewId: VIEW_ID,
          },
          startedAt,
          endedAt,
          videoViewUrl: rawJson.videoViewUrl,
          agendaViewUrl: rawJson.agendaViewUrl,
          committee: { connect: committee },
        },
      });
    }
  }
}
