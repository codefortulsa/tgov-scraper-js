/**
 * Video Processing Utilities
 * 
 * This module provides a suite of utilities for processing videos from m3u8 streams:
 * - Downloading videos from m3u8 URLs
 * - Extracting/splitting audio and video tracks
 * - Streaming capabilities for audio/video channels
 */
import fs from "fs/promises";
import { db, agendas,bucket_meta,recordings } from "../data";
import crypto from "crypto";
import logger from "encore.dev/log";
import { fileTypeFromBuffer } from "file-type";
import { downloadVideo } from "./downloader";
import { extractAudioTrack, extractVideoTrack } from "./extractor";
import { createVideoStream, createAudioStream, createCombinedStream } from "./streamer";

export type VideoProcessingOptions = {
  filename?: string;
  saveToDatabase?: boolean;
  extractAudio?: boolean;
  meetingRecordId?: string;
};

export type ProcessedVideoResult = {
  videoId?: string;
  audioId?: string;
  videoUrl?: string;
  audioUrl?: string;
  videoMimetype?: string;
  audioMimetype?: string;
};

/**
 * Process a video from a URL, with options to download and save directly to cloud storage
 * 
 * @param url The m3u8 URL or other video URL to process
 * @param options Processing options
 * @returns Database IDs and URLs for the processed files
 */
export async function processVideo(url: string, options: VideoProcessingOptions = {}): Promise<ProcessedVideoResult> {
  const {
    filename = `video_${Date.now()}`,
    extractAudio = false,
    meetingRecordId
  } = options;

  // Generate unique keys for cloud storage
  const videoFilename = `${filename}.mp4`;
  const audioFilename = `${filename}.mp3`;
  
  // Hash the URL to use as part of the key
  const urlHash = crypto.createHash("sha256").update(url).digest("base64url").substring(0, 12);
  const videoKey = `${urlHash}_${videoFilename}`;
  const audioKey = `${urlHash}_${audioFilename}`;
  
  logger.info(`Processing video from ${url}`);
  logger.info(`Video key: ${videoKey}`);
  if (extractAudio) logger.info(`Audio key: ${audioKey}`);
  
  // Create a temporary directory for processing if needed
  const tempDir = `/tmp/${Date.now()}_${urlHash}`;
  const videoTempPath = `${tempDir}/${videoFilename}`;
  const audioTempPath = extractAudio ? `${tempDir}/${audioFilename}` : undefined;

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
): Promise<ProcessedVideoResult> {
  logger.info(`Uploading video and audio files to storage`);
  
  // Read video file and detect its mimetype
  const videoBuffer = await fs.readFile(videoPath);
  const videoTypeResult = await fileTypeFromBuffer(videoBuffer);
  const videoMimetype = videoTypeResult?.mime || "application/octet-stream";
  logger.info(`Detected video mimetype: ${videoMimetype}`);
  
  // Upload video to bucket
  await recordings.upload(videoKey, videoBuffer, { contentType: videoMimetype });
  const videoUrl = recordings.publicUrl(videoKey);
  logger.info(`Uploaded video to ${videoUrl}`);
  
  let videoBlob;
  let audioBlob;
  let audioUrl: string | undefined;
  let audioMimetype: string | undefined;
  let audioBuffer: Buffer | undefined;
  
  // Read audio file if it exists
  if (audioPath) {
    audioBuffer = await fs.readFile(audioPath);
    const audioTypeResult = await fileTypeFromBuffer(audioBuffer);
    audioMimetype = audioTypeResult?.mime || "application/octet-stream";
    logger.info(`Detected audio mimetype: ${audioMimetype}`);
    
    // Upload audio to bucket
    await recordings.upload(audioKey, audioBuffer, { contentType: audioMimetype });
    audioUrl = recordings.publicUrl(audioKey);
    logger.info(`Uploaded audio to ${audioUrl}`);
  }
  
  // Save to database in a transaction
  const result = await db.$transaction(async (tx) => {
    // Create video blob record
    videoBlob = await tx.blob.create({
      data: {
        key: videoKey,
        mimetype: videoMimetype,
        url: videoUrl,
        bucket: bucket_meta.RECORDINGS_BUCKET_NAME,
        srcUrl: sourceUrl
      }
    });
    logger.info(`Created video blob record with ID: ${videoBlob.id}`);

    let audioBlob = undefined;
    
    // If audio was extracted, save it too
    if (audioPath && audioBuffer && audioMimetype && audioUrl) {
      audioBlob = await tx.blob.create({
        data: {
          key: audioKey,
          mimetype: audioMimetype,
          url: audioUrl,
          bucket: bucket_meta.RECORDINGS_BUCKET_NAME,
          srcUrl: sourceUrl
        }
      });
      logger.info(`Created audio blob record with ID: ${audioBlob.id}`);
    }
    
    // If meeting record ID provided, update it
    if (meetingRecordId) {
      await tx.meetingRecord.update({
        where: { id: meetingRecordId },
        data: { 
          videoId: videoBlob.id,
          ...(audioBlob ? { audioId: audioBlob.id } : {})
        }
      });
      logger.info(`Updated meeting record ${meetingRecordId} with video and audio IDs`);
    }
    
    return {
      videoId: videoBlob.id,
      audioId: audioBlob?.id,
      videoUrl,
      audioUrl,
      videoMimetype: videoBlob.mimetype,
      audioMimetype: audioBlob?.mimetype
    };
  });
  
  return result;
}

export {
  downloadVideo,
  extractAudioTrack,
  extractVideoTrack,
  createVideoStream,
  createAudioStream,
  createCombinedStream
};