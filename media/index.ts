import { api } from 'encore.dev';
import { prisma } from './data';

// Existing interfaces from the repo
export interface DownloadRequest {
  downloadUrls: string[];
  extractAudio?: boolean;
  limit?: number;
  meetingRecordIds?: string[]; // Optional association with meeting records
}

export interface DownloadResponse {
  results: {
    downloadUrl: string;
    videoId?: string;
    audioId?: string;
    videoUrl?: string;
    audioUrl?: string;
    error?: string;
  }[];
}

// New interfaces for media file operations
export interface MediaFileRequest {
  mediaId: string;
}

export interface MediaFileResponse {
  id: string;
  bucket: string;
  key: string;
  mimetype: string;
  url?: string;
  srcUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  meetingRecordId?: string;
  title?: string;
  description?: string;
  fileSize?: number;
}

/**
 * API to get a media file by ID
 */
export const getMediaFile = api.get<MediaFileRequest, MediaFileResponse>(
  '/files/:mediaId',
  async (req) => {
    const { mediaId } = req;

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!mediaFile) {
      throw new Error(`Media file ${mediaId} not found`);
    }

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
  }
);

// Placeholder for other APIs
// ... existing code from the original file ...