/**
 * @fileoverview
 * !! This file is 100% generated via the Copilot YOLO button. !!
 * It has not been reviewed or tested. Don't use it until you understand it. 
 */

/**
 * Video Streamer Module
 *
 * Provides functions for streaming audio, video, or combined content from files.
 */
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import { Readable, PassThrough } from "stream";
import { stat } from "fs/promises";
import path from "path";

export interface StreamOptions {
  start?: number; // Start time in seconds
  duration?: number; // Duration in seconds
  quality?: string; // Quality settings (e.g., "low", "medium", "high")
}

/**
 * Create a stream for a video file
 *
 * @param filePath Path to the video file
 * @param options Streaming options
 * @returns Readable stream of video content
 */
export function createVideoStream(
  filePath: string,
  options: StreamOptions = {}
): Readable {
  const outputStream = new PassThrough();

  const ffmpegCommand = ffmpeg(filePath);

  // Apply time options if provided
  if (options.start !== undefined) {
    ffmpegCommand.seekInput(options.start);
  }

  if (options.duration !== undefined) {
    ffmpegCommand.duration(options.duration);
  }

  // Apply quality settings
  if (options.quality) {
    applyQualitySettings(ffmpegCommand, options.quality, "video");
  }

  ffmpegCommand
    .format("mp4")
    .outputOptions("-movflags", "frag_keyframe+empty_moov") // Enable streaming
    .pipe(outputStream, { end: true });

  return outputStream;
}

/**
 * Create a stream for an audio file
 *
 * @param filePath Path to the audio file
 * @param options Streaming options
 * @returns Readable stream of audio content
 */
export function createAudioStream(
  filePath: string,
  options: StreamOptions = {}
): Readable {
  const outputStream = new PassThrough();

  const ffmpegCommand = ffmpeg(filePath);

  // Apply time options if provided
  if (options.start !== undefined) {
    ffmpegCommand.seekInput(options.start);
  }

  if (options.duration !== undefined) {
    ffmpegCommand.duration(options.duration);
  }

  // Apply quality settings
  if (options.quality) {
    applyQualitySettings(ffmpegCommand, options.quality, "audio");
  }

  ffmpegCommand.format("mp3").pipe(outputStream, { end: true });

  return outputStream;
}

/**
 * Create a combined stream from separate audio and video files
 *
 * @param videoPath Path to the video file
 * @param audioPath Path to the audio file
 * @param options Streaming options
 * @returns Readable stream of combined content
 */
export function createCombinedStream(
  videoPath: string,
  audioPath: string,
  options: StreamOptions = {}
): Readable {
  const outputStream = new PassThrough();

  const ffmpegCommand = ffmpeg();

  // Add input streams
  ffmpegCommand.input(videoPath);
  ffmpegCommand.input(audioPath);

  // Apply time options if provided
  if (options.start !== undefined) {
    ffmpegCommand.seekInput(options.start);
  }

  if (options.duration !== undefined) {
    ffmpegCommand.duration(options.duration);
  }

  // Apply quality settings
  if (options.quality) {
    applyQualitySettings(ffmpegCommand, options.quality, "both");
  }

  ffmpegCommand
    .outputOptions([
      "-c:v copy", // Copy the video codec
      "-c:a aac", // Convert audio to AAC
      "-map 0:v:0", // Map the first video stream from first input
      "-map 1:a:0", // Map the first audio stream from second input
      "-movflags frag_keyframe+empty_moov", // Enable streaming
    ])
    .format("mp4")
    .pipe(outputStream, { end: true });

  return outputStream;
}

/**
 * Create an HLS stream from a video file
 *
 * @param filePath Path to the video file
 * @param outputDir Directory to store HLS files
 * @param segmentDuration Duration of each segment in seconds
 * @returns Path to the master playlist file
 */
export async function createHLSStream(
  filePath: string,
  outputDir: string,
  segmentDuration: number = 10
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const masterPlaylist = path.join(outputDir, "master.m3u8");
  const variantPlaylist = path.join(outputDir, "playlist.m3u8");
  const segmentPattern = path.join(outputDir, "segment_%03d.ts");

  return new Promise<string>((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([
        "-c:v libx264", // Video codec
        "-c:a aac", // Audio codec
        "-hls_time " + segmentDuration, // Segment duration
        "-hls_list_size 0", // Keep all segments in the playlist
        "-hls_segment_filename " + segmentPattern, // Segment naming pattern
        "-f hls", // HLS format
      ])
      .output(variantPlaylist)
      .on("end", () => {
        // Create a simple master playlist that references the variant playlist
        fs.writeFile(
          masterPlaylist,
          "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nplaylist.m3u8"
        )
          .then(() => resolve(masterPlaylist))
          .catch(reject);
      })
      .on("error", reject)
      .run();
  });
}

/**
 * Create a DASH stream from a video file
 *
 * @param filePath Path to the video file
 * @param outputDir Directory to store DASH files
 * @param segmentDuration Duration of each segment in seconds
 * @returns Path to the manifest file
 */
export async function createDASHStream(
  filePath: string,
  outputDir: string,
  segmentDuration: number = 10
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, "manifest.mpd");

  return new Promise<string>((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([
        "-c:v libx264", // Video codec
        "-c:a aac", // Audio codec
        "-b:v:0 2000k", // Video bitrate
        "-b:a:0 128k", // Audio bitrate
        "-f dash", // DASH format
        `-seg_duration ${segmentDuration}`, // Segment duration
        "-use_timeline 1", // Use timeline
        "-use_template 1", // Use template
      ])
      .output(manifestPath)
      .on("end", () => {
        resolve(manifestPath);
      })
      .on("error", reject)
      .run();
  });
}

/**
 * Apply quality settings to an FFmpeg command
 *
 * @param command The FFmpeg command to modify
 * @param quality Quality setting: "low", "medium", or "high"
 * @param type The type of stream: "audio", "video", or "both"
 */
function applyQualitySettings(
  command: any,
  quality: string,
  type: "audio" | "video" | "both"
): void {
  switch (quality.toLowerCase()) {
    case "low":
      if (type === "audio" || type === "both") {
        command.audioQuality(8); // Lower quality (higher value = lower quality)
        command.audioBitrate("64k");
      }
      if (type === "video" || type === "both") {
        command.videoQuality(28); // Lower quality (higher value = lower quality)
        command.videoBitrate("500k");
        command.size("640x?");
      }
      break;

    case "medium":
      if (type === "audio" || type === "both") {
        command.audioQuality(5);
        command.audioBitrate("128k");
      }
      if (type === "video" || type === "both") {
        command.videoQuality(23);
        command.videoBitrate("1000k");
        command.size("1280x?");
      }
      break;

    case "high":
      if (type === "audio" || type === "both") {
        command.audioQuality(3);
        command.audioBitrate("192k");
      }
      if (type === "video" || type === "both") {
        command.videoQuality(18);
        command.videoBitrate("2500k");
        command.size("1920x?");
      }
      break;

    default:
      // Default to medium quality
      if (type === "audio" || type === "both") {
        command.audioQuality(5);
        command.audioBitrate("128k");
      }
      if (type === "video" || type === "both") {
        command.videoQuality(23);
        command.videoBitrate("1000k");
        command.size("1280x?");
      }
  }
}

/**
 * Helper function to get file size and basic metadata
 *
 * @param filePath Path to the file
 * @returns Object with file size and metadata
 */
export async function getFileInfo(
  filePath: string
): Promise<{ size: number; metadata: any }> {
  const fileStats = await stat(filePath);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          size: fileStats.size,
          metadata: metadata,
        });
      }
    });
  });
}

export default {
  createVideoStream,
  createAudioStream,
  createCombinedStream,
  createHLSStream,
  createDASHStream,
  getFileInfo,
};
