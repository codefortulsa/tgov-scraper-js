/**
 * Media Service API Endpoints
 *
 * Provides HTTP endpoints for video acquisition, processing, and retrieval:
 * - Download videos to cloud storage
 * - Process videos (extract audio)
 * - Retrieve processed videos and audio
 */
import { api } from "encore.dev/api";
import logger from "encore.dev/log";
import crypto from "crypto";
import { db } from "./data";
import { processMedia, ProcessedMediaResult } from "./processor";

// Interface for downloading videos endpoints
interface DownloadRequest {
  downloadUrls: string[];
  extractAudio?: boolean;
  limit?: number;
  meetingRecordIds?: string[]; // Optional association with meeting records
}

interface DownloadResponse {
  results: {
    downloadUrl: string;
    videoId?: string;
    audioId?: string;
    videoUrl?: string;
    audioUrl?: string;
    error?: string;
  }[];
}

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
  async (req: DownloadRequest): Promise<DownloadResponse> => {
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
        const result = await processMedia(downloadUrl, {
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
    path: "/api/media/:blobId/info",
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