import { prisma } from "./data";

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";

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
      const mediaFile = await prisma.mediaFile.findUnique({
        where: { id: mediaId },
      });

      if (!mediaFile) {
        log.info(`Media file not found`, { mediaId });
        throw APIError.notFound(`Media file ${mediaId} not found`);
      }

      log.debug(`Retrieved media file`, { mediaId });

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

      log.error(`Failed to get media file`, {
        mediaId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to get media file ${mediaId}`);
    }
  },
);

// Placeholder for other APIs
// ... existing code from the original file ...
