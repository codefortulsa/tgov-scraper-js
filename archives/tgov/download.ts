import puppeteer from "puppeteer";
import { launchOptions } from "./browser";
import { db, agendas, bucket_meta } from "../data";
import crypto from "crypto";
import logger from "encore.dev/log";
import { fileTypeFromBuffer } from "file-type";
import { processVideo } from "../video";

/**
 * The Video URL scraped from the TGov index is not a direct link to the
 * donloadable video. This function uses Puppeteer to navigate to the viewer
 * page and extract the actual download URLs. It also constructs the URL for
 * the agenda document.
 *
 * @param videoViewUrl The URL of the video viewer page
 * @param meetingRecordId Optional meeting record ID to associate with the video
 * @returns The downloaded video details
 */
export async function downloadVideo(
  videoViewUrl: string,
  meetingRecordId?: string
) {
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  await page.goto(videoViewUrl.toString(), { waitUntil: "domcontentloaded" });

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

  // Create a unique filename based on the URL
  const urlHash = crypto
    .createHash("sha256")
    .update(videoUrl)
    .digest("base64url")
    .substring(0, 12);
  const filename = `meeting_${urlHash}_${Date.now()}`;

  // Process the video using our video utilities with cloud storage
  logger.info(`Downloading video from ${videoUrl}`);

  const result = await processVideo(videoUrl, {
    filename,
    saveToDatabase: !!meetingRecordId,
    extractAudio: true,
    meetingRecordId,
  });

  logger.info(`Video processing completed:`, result);

  return {
    videoId: result.videoId,
    audioId: result.audioId,
    videoUrl: result.videoUrl,
    audioUrl: result.audioUrl,
  };
}

/**
 * Downloads an agenda file and saves it to the agenda bucket
 *
 * @param agendaViewUrl The URL to the agenda view page
 * @returns The agenda blob ID if successful
 */
export async function downloadAgenda(agendaViewUrl: string) {
  const response = await fetch(agendaViewUrl);
  const params = new URL(agendaViewUrl).searchParams;

  if (!response.ok) {
    logger.error(`Failed to fetch agenda: ${response.statusText}`);
    return;
  }

  const buffer = await response.arrayBuffer();
  const mimetype = await fileTypeFromBuffer(buffer).then((t) => t?.mime);
  const blob = Buffer.from(buffer);

  if (mimetype !== "application/pdf") {
    logger.error(`Expected PDF, got ${mimetype}`);
    return;
  }

  // Key by hash to avoid duplicates
  // Since this is public data, we might consider auto-deduplication
  // by using the hash alone as the object key (a-la IPFS)
  const hash = crypto.createHash("sha256").update(blob).digest("base64url");

  const { viewId, clipId } = Object.fromEntries(params.entries());
  const key = `${hash}_viewId=${viewId}_clipId=${clipId}`;
  const url = agendas.publicUrl(key);

  const result = await db.$transaction(async (tx) => {
    // Upload the file to the bucket
    await agendas.upload(key, blob);
    logger.info(`Uploaded agenda to ${url}`);

    // Create the blob record
    const agenda = await tx.blob.create({
      data: {
        key,
        mimetype,
        url,
        bucket: bucket_meta.AGENDA_BUCKET_NAME,
        srcUrl: agendaViewUrl.toString(),
      },
    });
    logger.info(`Created agenda blob record with ID: ${agenda.id}`);

    // Update any meeting records with this agenda URL
    await tx.meetingRecord.updateMany({
      where: { rawJson: { path: ["agendaViewUrl"], equals: agendaViewUrl } },
      data: { agendaId: agenda.id },
    });

    return agenda.id;
  });

  return result;
}
