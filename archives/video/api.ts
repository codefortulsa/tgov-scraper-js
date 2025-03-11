/**
 * Video Processing API Endpoints
 *
 * Provides HTTP endpoints for video acquisition, processing, and retrieval:
 * - Scrape video links from source pages
 * - Download videos to cloud storage
 * - Retrieve processed videos and audio
 */
import { api } from "encore.dev/api";
import logger from "encore.dev/log";
import crypto from "crypto";
import { db } from "../data";
import { processVideo } from "./index";

// Interface for scraping video URLs endpoints
interface ScrapeVideosRequest {
  viewerUrls: string[];
  limit?: number;
}

interface ScrapeVideosResponse {
  results: {
    viewerUrl: string;
    downloadUrl: string;
    error?: string;
  }[];
}

// Interface for downloading videos endpoints
interface DownloadVideosRequest {
  downloadUrls: string[];
  extractAudio?: boolean;
  limit?: number;
  meetingRecordIds?: string[]; // Optional association with meeting records
}

interface DownloadVideosResponse {
  results: {
    downloadUrl: string;
    videoId?: string;
    audioId?: string;
    videoUrl?: string;
    audioUrl?: string;
    error?: string;
  }[];
}

// Interface for retrieving video/audio endpoints
interface GetMediaRequest {
  blobId: string;
  type: "video" | "audio";
}

/**
 * Scrape video download URLs from viewer pages
 *
 * This endpoint accepts an array of viewer page URLs and returns
 * the extracted download URLs for each video.
 */
export const scrapeVideos = api(
  {
    method: "POST",
    path: "/api/videos/scrape",
    expose: true,
  },
  async (req: ScrapeVideosRequest): Promise<ScrapeVideosResponse> => {
    const limit = req.limit || 1;
    const limitedUrls = req.viewerUrls.slice(0, limit);
    const results = [];

    for (const viewerUrl of limitedUrls) {
      try {
        logger.info(`Scraping video URL from viewer page: ${viewerUrl}`);

        // Use puppeteer to extract the actual video URL
        const downloadUrl = await extractVideoUrl(viewerUrl);
        results.push({
          viewerUrl,
          downloadUrl,
        });
      } catch (error: any) {
        logger.error(`Error scraping video URL: ${error.message}`);
        results.push({
          viewerUrl,
          downloadUrl: "",
          error: error.message,
        });
      }
    }

    return { results };
  }
);

/**
 * Download videos to cloud storage
 *
 * This endpoint accepts an array of direct video URLs, downloads each video,
 * optionally extracts audio, and stores both in the cloud storage bucket.
 */
export const downloadVideos = api(
  {
    method: "POST",
    path: "/api/videos/download",
    expose: true,
  },
  async (req: DownloadVideosRequest): Promise<DownloadVideosResponse> => {
    const limit = req.limit || 1;
    const limitedUrls = req.downloadUrls.slice(0, limit);
    const results = [];

    for (let i = 0; i < limitedUrls.length; i++) {
      const downloadUrl = limitedUrls[i];
      const meetingRecordId = req.meetingRecordIds?.[i];

      try {
        logger.info(`Processing video from URL: ${downloadUrl}`);

        // Create a unique filename based on the URL
        const urlHash = crypto
          .createHash("sha256")
          .update(downloadUrl)
          .digest("base64url")
          .substring(0, 12);
        const filename = `video_${urlHash}_${Date.now()}`;

        // Process the video (download, extract audio if requested, save to cloud)
        const result = await processVideo(downloadUrl, {
          filename,
          extractAudio: req.extractAudio ?? true,
          meetingRecordId,
        });

        results.push({
          downloadUrl,
          videoId: result.videoId,
          audioId: result.audioId,
          videoUrl: result.videoUrl,
          audioUrl: result.audioUrl,
        });
      } catch (error: any) {
        logger.error(`Error processing video: ${error.message}`);
        results.push({
          downloadUrl,
          error: error.message,
        });
      }
    }

    return { results };
  }
);

/**
 * Get information about stored media files
 */
export const getMediaInfo = api(
  {
    method: "GET",
    path: "/api/videos/:blobId/info",
    expose: true,
  },
  async ({ blobId }: { blobId: string }) => {
    const blob = await db.blob.findUnique({
      where: { id: blobId },
    });

    if (!blob) {
      throw new Error(`Media with ID ${blobId} not found`);
    }

    return {
      id: blob.id,
      url: blob.url,
      mimetype: blob.mimetype,
      key: blob.key,
      bucket: blob.bucket,
      createdAt: blob.createdAt,
    };
  }
);

/**
 * Get all media files for a meeting
 */
export const getMeetingMedia = api(
  {
    method: "GET",
    path: "/api/meetings/:meetingId/media",
    expose: true,
  },
  async ({ meetingId }: { meetingId: string }) => {
    const meeting = await db.meetingRecord.findUnique({
      where: { id: meetingId },
      include: {
        agenda: true,
        video: true,
        audio: true,
      },
    });

    if (!meeting) {
      throw new Error(`Meeting with ID ${meetingId} not found`);
    }

    return {
      meetingId: meeting.id,
      meetingName: meeting.name,
      startedAt: meeting.startedAt,
      agenda: meeting.agenda
        ? {
            id: meeting.agenda.id,
            url: meeting.agenda.url,
            mimetype: meeting.agenda.mimetype,
          }
        : null,
      video: meeting.video
        ? {
            id: meeting.video.id,
            url: meeting.video.url,
            mimetype: meeting.video.mimetype,
          }
        : null,
      audio: meeting.audio
        ? {
            id: meeting.audio.id,
            url: meeting.audio.url,
            mimetype: meeting.audio.mimetype,
          }
        : null,
    };
  }
);

/**
 * List all stored videos
 */
export const listVideos = api(
  {
    method: "GET",
    path: "/api/videos",
    expose: true,
  },
  async ({ limit = 10, offset = 0 }: { limit?: number; offset?: number }) => {
    const videos = await db.blob.findMany({
      where: { mimetype: { startsWith: "video/" } },
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    });

    return videos.map((video) => ({
      id: video.id,
      url: video.url,
      mimetype: video.mimetype,
      key: video.key,
      bucket: video.bucket,
      createdAt: video.createdAt,
    }));
  }
);

/**
 * List all stored audio files
 */
export const listAudio = api(
  {
    method: "GET",
    path: "/api/audio",
    expose: true,
  },
  async ({ limit = 10, offset = 0 }: { limit?: number; offset?: number }) => {
    const audioFiles = await db.blob.findMany({
      where: { mimetype: { startsWith: "audio/" } },
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    });

    return audioFiles.map((audio) => ({
      id: audio.id,
      url: audio.url,
      mimetype: audio.mimetype,
      key: audio.key,
      bucket: audio.bucket,
      createdAt: audio.createdAt,
    }));
  }
);

/**
 * Internal helper function to extract video URL from viewer page
 */
async function extractVideoUrl(viewerUrl: string): Promise<string> {
  // This reuses our existing logic from downloadVideoFromViewerPage but only returns the URL
  // Implementation is extracted from tgov/download.ts
  const browser = await import("puppeteer").then((p) =>
    p.default.launch({
      args: ["--disable-features=HttpsFirstBalancedModeAutoEnable"],
    })
  );

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
  return videoUrl;
}
