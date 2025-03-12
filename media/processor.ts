/**
 * Media Processor Module
 *
 * Provides high-level functions for downloading, processing, and storing media files
 */
import fs from "fs/promises";
import crypto from "crypto";
import logger from "encore.dev/log";

import { downloadVideo } from "./downloader";
import { extractAudioTrack } from "./extractor";
import { db, recordings, bucket_meta } from "./data";
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
  options: ProcessingOptions = {}
): Promise<ProcessedMediaResult> {
  const {
    filename = `video_${Date.now()}`,
    extractAudio = false,
    meetingRecordId,
  } = options;

  // Generate unique keys for cloud storage
  const videoFilename = `${filename}_video`;
  const audioFilename = `${filename}_audio`;

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

  // Create a temporary directory for processing if needed
  const tempDir = `/tmp/${Date.now()}_${urlHash}`;
  const videoTempPath = `${tempDir}/${videoFilename}`;
  const audioTempPath = extractAudio
    ? `${tempDir}/${audioFilename}`
    : undefined;

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Step 1: Download the video to temporary location
    logger.info(`Downloading video to temp location: ${videoTempPath}`);
    await downloadVideo(url, videoTempPath);

    // Step 2: Extract audio if requested
    if (extractAudio && audioTempPath) {
      logger.info(`Extracting audio to temp location: ${audioTempPath}`);
      await extractAudioTrack(videoTempPath, audioTempPath);
    }

    // Step 3: Upload files to storage and save to database
    const result = await uploadAndSaveToDb(
      videoTempPath,
      audioTempPath,
      videoKey,
      audioKey,
      url,
      meetingRecordId
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
  meetingRecordId?: string
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

  // Upload to cloud storage
  const [videoAttrs, audioAttrs] = await Promise.all([
    recordings.upload(videoKey, videoBuffer, { contentType: videoType }),
    audioBuffer && audioType
      ? recordings.upload(audioKey, audioBuffer, { contentType: audioType })
      : Promise.resolve(null),
  ]);

  // Save metadata to database
  const videoBlob = await db.blob.create({
    data: {
      bucket: "recordings",
      key: videoKey,
      mimetype: videoType,
      url: recordings.publicUrl(videoKey),
      srcUrl: sourceUrl,
      meetingRecordId,
      size: videoAttrs.size,
    },
  });

  let audioBlob;
  if (audioBuffer && audioType) {
    audioBlob = await db.blob.create({
      data: {
        bucket: "recordings",
        key: audioKey,
        mimetype: audioType,
        url: audioAttrs ? recordings.publicUrl(audioKey) : undefined,
        srcUrl: sourceUrl,
        meetingRecordId,
        size: audioAttrs?.size,
      },
    });
  }

  return {
    videoId: videoBlob.id,
    audioId: audioBlob?.id,
    videoUrl: videoBlob.url || undefined,
    audioUrl: audioBlob?.url || undefined,
    videoMimetype: videoBlob.mimetype,
    audioMimetype: audioBlob?.mimetype,
  };
}