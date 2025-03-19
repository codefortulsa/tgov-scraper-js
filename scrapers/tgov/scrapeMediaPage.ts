import { launchOptions } from "../browser";
import { TGOV } from "./constants";

import { tgov } from "~encore/clients";

import { APIError } from "encore.dev/api";
import logger from "encore.dev/log";

import puppeteer from "puppeteer";

type ViewerMeta =
  | {
      url: string | URL;
      clipId?: string;
      meetingId?: string;
    }
  | {
      clipId: string;
      url?: string | URL;
      meetingId?: string;
    }
  | {
      meetingId: string;
      url?: string | URL;
      clipId?: string;
    };

/**
 * Scrapes a TGov MediaPlayer viewer page for the download URL of the video.
 *
 * @param viewer - An object with at least one of:
 *  - url: The URL of the viewer page
 *  - clipId: The clip ID of the video
 *  - meetingId: The meeting ID of the video
 *
 * The order above indicates the order of precedence. If the URL is provided or
 * can be derived from the clip ID it is used, otherwise the TGov service is
 * invoked and an additional DB query is made to get the URL.
 */
export async function scrapeMediaPage(viewer: ViewerMeta): Promise<string> {
  if (!viewer.url && !viewer.clipId && viewer.meetingId) {
    const { meeting } = await tgov.getMeeting({ id: viewer.meetingId });
    viewer.url = meeting?.videoViewUrl;
    viewer.clipId = meeting?.rawJson.clipId;
  }

  if (!viewer.url && viewer.clipId) {
    viewer.url = new URL(TGOV.PLAYER_PATHNAME, TGOV.BASE_URL);
    viewer.url.searchParams.set("clip_id", viewer.clipId);
  }

  if (viewer.url) logger.info("Extracting video URL", viewer);
  else throw APIError.notFound("Failed to resolve Video viewer URL");

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.goto(new URL(viewer.url).href, { waitUntil: "domcontentloaded" });

  const videoUrl = await page.evaluate(() => {
    // May be defined in the global scope of the page
    var video_url: string | null | undefined;

    if (typeof video_url === "string") return video_url;

    const videoEl = document.querySelector("video > source");
    if (!videoEl) throw new Error("Selector 'video > source' found no element");

    video_url = videoEl.getAttribute("src");
    if (!video_url) throw new Error("No src attribute found on element");

    return video_url;
  });

  logger.info("Successfully extracted video URL", { ...viewer, videoUrl });

  await browser.close();
  return videoUrl;
}
