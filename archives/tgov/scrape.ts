import logger from "encore.dev/log";
import puppeteer from "puppeteer";

import { tgov_urls } from "../constants";
import { normalizeDate, normalizeName } from "./util";
import { db } from "../data";
import { launchOptions } from "./browser";

export async function scrapeIndex() {
  // TODO: Apparently there are other "views" (namely, 2 and 3 work) — but do they have different data?
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
        ".TabbedPanelsContentGroup .TabbedPanelsContent"
      )
    );

    for (const contentDiv of yearsContent) {
      const collapsibles = Array.from(
        contentDiv.querySelectorAll(".CollapsiblePanel")
      );

      for (const panel of collapsibles) {
        const committee =
          panel.querySelector(".CollapsiblePanelTab")?.textContent?.trim() ||
          "Unknown Committee";

        if (committee === "Unknown Committee") {
          logger.warn("Unknown Committee found", panel);
        }

        const rows = Array.from(
          panel.querySelectorAll(".listingTable tbody .listingRow")
        );

        for (const row of rows) {
          const columns = row.querySelectorAll("td");
          const name = columns[0]?.textContent?.trim() || "";
          const date =
            columns[1]?.textContent?.replace(/\s+/g, " ").trim() || "";

          const duration = columns[2]?.textContent?.trim() || "";

          const agendaEl = columns[3]?.querySelector("a");
          const videoEl = columns[4]?.querySelector("a");

          const agendaViewUrl = agendaEl?.getAttribute("href") || undefined;
          const videoClickHandler = videoEl?.getAttribute("onclick") || "";

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

          const videoViewUrl =
            parser.exec(videoClickHandler)?.groups?.url ||
            videoEl?.getAttribute("href") ||
            undefined;

          results.push({
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
    const committee = await db.committee.upsert({
      where: { name: committeeName },
      update: {},
      create: { name: committeeName },
    });

    for (const rawJson of groups.get(committeeName) || []) {
      const { startedAt, endedAt } = normalizeDate(rawJson);
      const name = normalizeName(`${rawJson.name}__${rawJson.date}`);

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
          committee: { connect: committee },
        },
      });
    }
  }
}
