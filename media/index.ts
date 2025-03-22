/**
 * Media Service API Endpoints
 *
 * Provides HTTP endpoints for video acquisition, processing, and retrieval:
 * - Download videos to cloud storage
 * - Process videos (extract audio)
 * - Retrieve processed videos and audio
 */
import crypto from "crypto";

import { db } from "./data";
import { ProcessedMediaResult, processMedia } from "./processor";

import { api, APIError } from "encore.dev/api";
import logger from "encore.dev/log";

/**
 * Request parameters for initiating file downloads
 */
export interface DownloadRequest {
  /** Array of URLs to download */
  downloadUrls: string[];
  /** Whether to extract audio from video files */
  extractAudio?: boolean;
  /** Maximum number of files to download in one request */
  limit?: number;
  /** Optional association with meeting records */
  meetingRecordIds?: string[];
}

/**
 * Response structure for download operations
 */
export interface DownloadResponse {
  /** Results for each download request */
  results: {
    /** Original URL that was requested for download */
    downloadUrl: string;
    /** ID of the stored video file (if successful) */
    videoId?: string;
    /** ID of the extracted audio file (if requested and successful) */
    audioId?: string;
    /** URL to access the stored video */
    videoUrl?: string;
    /** URL to access the extracted audio */
    audioUrl?: string;
    /** Error message if download failed */
    error?: string;
  }[];
}

/**
 * Request parameters for media file retrieval
 */
export interface MediaFileRequest {
  /** ID of the media file to retrieve */
  mediaId: string;
}

/**
 * Media file metadata and access information
 */
export interface MediaFileResponse {
  /** Unique identifier for the media file */
  id: string;
  /** Storage bucket name */
  bucket: string;
  /** Storage key/path */
  key: string;
  /** MIME type of the file */
  mimetype: string;
  /** URL to access the file */
  url?: string;
  /** Original source URL */
  srcUrl?: string;
  /** When the file record was created */
  createdAt: Date;
  /** When the file record was last updated */
  updatedAt: Date;
  /** Associated meeting record ID */
  meetingRecordId?: string;
  /** Title of the media */
  title?: string;
  /** Description of the media */
  description?: string;
  /** Size of the file in bytes */
  fileSize?: number;
}

/**
 * API to get a media file by ID
 *
 * Returns metadata and access information for a specific media file
 */
export const getMediaFile = api(
  {
    method: "GET",
    path: "/files/:mediaId",
    expose: true,
  },
  async (req: MediaFileRequest): Promise<MediaFileResponse> => {
    const { mediaId } = req;

    try {
      const mediaFile = await db.mediaFile.findUnique({
        where: { id: mediaId },
      });

      if (!mediaFile) {
        logger.info(`Media file not found`, { mediaId });
        throw APIError.notFound(`Media file ${mediaId} not found`);
      }

      logger.debug(`Retrieved media file`, { mediaId });

      return {
        id: mediaFile.id,
        bucket: mediaFile.bucket,
        key: mediaFile.key,
        mimetype: mediaFile.mimetype,
        url: mediaFile.url || undefined,
        srcUrl: mediaFile.srcUrl || undefined,
        createdAt: mediaFile.createdAt,
        updatedAt: mediaFile.updatedAt,
        meetingRecordId: mediaFile.meetingRecordId || undefined,
        title: mediaFile.title || undefined,
        description: mediaFile.description || undefined,
        fileSize: mediaFile.fileSize || undefined,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      logger.error(`Failed to get media file`, {
        mediaId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to get media file ${mediaId}`);
    }
  },
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
  },
);

/**
 * Get information about stored media files


 */
export const getMediaInfo = api(
  {
    method: "GET",
    path: "/api/media/:mediaFileId/info",
    expose: true,
  },
  async ({ mediaFileId }: { mediaFileId: string }) => {
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaFileId },
    });

    if (!mediaFile) {
      throw new Error(`Media with ID ${mediaFileId} not found`);
    }

    return {
      id: mediaFile.id,
      url: mediaFile.url,
      mimetype: mediaFile.mimetype,
      key: mediaFile.key,
      bucket: mediaFile.bucket,
      createdAt: mediaFile.createdAt,
      title: mediaFile.title,
      description: mediaFile.description,
      fileSize: mediaFile.fileSize,
    };
  },
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
    const videos = await db.mediaFile.findMany({
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
      title: video.title,
      description: video.description,
      fileSize: video.fileSize,
    }));
  },
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
    const audioFiles = await db.mediaFile.findMany({
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
      title: audio.title,
      description: audio.description,
      fileSize: audio.fileSize,
    }));
  },
);
