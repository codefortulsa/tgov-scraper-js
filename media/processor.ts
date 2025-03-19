/**
 * Media Processor Module
 *
 * Provides high-level functions for downloading, processing, and storing media files
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "node:path";

import env from "../env";
import { bucket_meta, db, recordings } from "./db";
import { downloadVideo, downloadVideoWithAudioExtraction } from "./downloader";

import logger from "encore.dev/log";

import { fileTypeFromBuffer } from "file-type";

export interface ProcessingOptions {
  filename?: string;
  extractAudio?: boolean;
  meetingRecordId?: string;
}

export interface ProcessedMediaResult {
  videoId: string;
  audioId?: string;
  videoUrl?: string;
  audioUrl?: string;
  videoMimetype?: string;
  audioMimetype?: string;
}

/**
 * Process a video from a URL, with options to download and save directly to cloud storage
 *
 * @param url The m3u8 URL or other video URL to process
 * @param options Processing options
 * @returns Database IDs and URLs for the processed files
 */
export async function processMedia(
  url: string,
  options: ProcessingOptions = {},
): Promise<ProcessedMediaResult> {
  const {
    filename = `video_${Date.now()}`,
    extractAudio = true,
    meetingRecordId,
  } = options;

  // Generate unique keys for cloud storage
  const videoFilename = `${filename}.mp4`;
  const audioFilename = `${filename}.mp3`;

  // Hash the URL to use as part of the key
  const urlHash = crypto
    .createHash("sha256")
    .update(url)
    .digest("base64url")
    .substring(0, 12);
  const videoKey = `${urlHash}_${videoFilename}`;
  const audioKey = `${urlHash}_${audioFilename}`;

  logger.info(`Processing media from ${url}`);
  logger.info(`Video key: ${videoKey}`);
  if (extractAudio) logger.info(`Audio key: ${audioKey}`);

  const tempDir = await fs.mkdtemp(
    env.TMP_DIR + path.sep + `media-processor-${filename}-`,
  );

  try {
    // Create a temporary directory for processing if needed
    await fs.mkdir(env.TMP_DIR, { recursive: true });

    const videoPath = path.join(`${tempDir}`, `${videoFilename}`);
    const audioPath =
      extractAudio ? path.join(`${tempDir}`, `${audioFilename}`) : undefined;
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Step 1: Download the video/audio to temporary location
    logger.info(`Downloading video to temp location: ${videoPath}`);
    if (!audioPath) await downloadVideo(url, videoPath);
    else await downloadVideoWithAudioExtraction(url, videoPath, audioPath);

    // Step 2: Upload files to storage and save to database
    const result = await uploadAndSaveToDb(
      videoPath,
      audioPath,
      videoKey,
      audioKey,
      url,
      meetingRecordId,
    );

    return result;
  } finally {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.info(`Cleaned up temporary directory: ${tempDir}`);
    } catch (err) {
      logger.error(`Failed to clean up temporary directory: ${err}`);
    }
  }
}

/**
 * Upload files to storage bucket and update database
 */
async function uploadAndSaveToDb(
  videoPath: string,
  audioPath: string | undefined,
  videoKey: string,
  audioKey: string,
  sourceUrl: string,
  meetingRecordId?: string,
): Promise<ProcessedMediaResult> {
  // Read files and get their content types
  const videoBuffer = await fs.readFile(videoPath);
  // Use file-type to detect the actual mimetype of the video
  const videoTypeResult = await fileTypeFromBuffer(videoBuffer);
  const videoType = videoTypeResult?.mime || "application/octet-stream";
  logger.info(`Detected video mimetype: ${videoType}`);

  let audioBuffer: Buffer | undefined;
  let audioType: string | undefined;

  if (audioPath) {
    audioBuffer = await fs.readFile(audioPath);
    // Use file-type to detect the actual mimetype of the audio
    const audioTypeResult = await fileTypeFromBuffer(audioBuffer);
    audioType = audioTypeResult?.mime || "application/octet-stream";
    logger.info(`Detected audio mimetype: ${audioType}`);
  }

  try {
    // First upload files to storage before creating database records
    const [videoAttrs, audioAttrs] = await Promise.all([
      recordings.upload(videoKey, videoBuffer, { contentType: videoType }),
      audioBuffer && audioType ?
        recordings.upload(audioKey, audioBuffer, { contentType: audioType })
      : Promise.resolve(null),
    ]);

    // Now use a transaction to create database records
    // This ensures that either all records are created or none are
    return await db.$transaction(async (tx) => {
      const videoFile = await tx.mediaFile.create({
        data: {
          bucket: "recordings",
          key: videoKey,
          mimetype: videoType,
          url: recordings.publicUrl(videoKey),
          srcUrl: sourceUrl,
          meetingRecordId,
          fileSize: videoAttrs.size,
          title: `Video ${new Date().toISOString().split("T")[0]}`,
          description: `Video processed from ${sourceUrl}`,
        },
      });

      let audioFile;
      if (audioBuffer && audioType && audioAttrs) {
        audioFile = await tx.mediaFile.create({
          data: {
            bucket: "recordings",
            key: audioKey,
            mimetype: audioType,
            url: recordings.publicUrl(audioKey),
            srcUrl: sourceUrl,
            meetingRecordId,
            fileSize: audioAttrs.size,
            title: `Audio ${new Date().toISOString().split("T")[0]}`,
            description: `Audio extracted from ${sourceUrl}`,
          },
        });
      }

      return {
        videoId: videoFile.id,
        audioId: audioFile?.id,
        videoUrl: videoFile.url || undefined,
        audioUrl: audioFile?.url || undefined,
        videoMimetype: videoFile.mimetype,
        audioMimetype: audioFile?.mimetype,
      };
    });
  } catch (error) {
    // If anything fails, attempt to clean up any uploaded files
    logger.error(`Failed to process media: ${error}`);

    try {
      // Try to remove uploaded files if they exist
      const cleanupPromises = [];
      cleanupPromises.push(
        recordings.exists(videoKey).then((exists) => {
          if (exists) return recordings.remove(videoKey);
        }),
      );

      if (audioBuffer && audioType) {
        cleanupPromises.push(
          recordings.exists(audioKey).then((exists) => {
            if (exists) return recordings.remove(audioKey);
          }),
        );
      }

      await Promise.allSettled(cleanupPromises);
      logger.info("Cleaned up uploaded files after transaction failure");
    } catch (cleanupError) {
      logger.error(`Failed to clean up files after error: ${cleanupError}`);
    }

    throw error; // Re-throw the original error
  }
}
