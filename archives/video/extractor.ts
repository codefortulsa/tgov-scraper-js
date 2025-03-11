/**
 * Video Extractor Module
 *
 * Provides functions for extracting and splitting audio and video tracks from video files.
 */
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import logger from "encore.dev/log";

/**
 * Extracts the audio track from a video file
 *
 * @param videoPath Path to the input video file
 * @param outputPath Path where the audio file will be saved
 * @param format Audio format (default: 'mp3')
 * @param bitrate Audio bitrate (default: '128k')
 * @param useOriginalCodec Whether to copy the original audio codec (default: true)
 * @returns Promise that resolves when extraction is complete
 */
export async function extractAudioTrack(
  videoPath: string,
  outputPath: string
): Promise<void> {
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions("-vn -c:a copy") // No video
      .output(outputPath)
      .on("start", (commandLine) => {
        logger.info(`Audio extraction started: ${commandLine}`);
      })
      .on("progress", (progress) => {
        logger.info(
          `Audio extraction progress: ${progress.percent?.toFixed(2)}% complete`
        );
      })
      .on("end", () => {
        logger.info(`Audio extraction completed: ${outputPath}`);
        resolve();
      })
      .on("error", (err) => {
        logger.error(`Error extracting audio: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Extracts the video track from a video file (removes audio)
 *
 * @param videoPath Path to the input video file
 * @param outputPath Path where the video-only file will be saved
 * @param format Video format (default: 'mp4')
 * @param useOriginalCodec Whether to copy the original video codec (default: true)
 * @returns Promise that resolves when extraction is complete
 */
export async function extractVideoTrack(
  videoPath: string,
  outputPath: string
): Promise<void> {
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions("-an -c:v copy") // No audio, copy video codec
      .output(outputPath)
      .on("start", (commandLine) => {
        logger.info(`Video extraction started: ${commandLine}`);
      })
      .on("progress", (progress) => {
        logger.info(
          `Video extraction progress: ${progress.percent?.toFixed(2)}% complete`
        );
      })
      .on("end", () => {
        logger.info(`Video extraction completed: ${outputPath}`);
        resolve();
      })
      .on("error", (err) => {
        logger.error(`Error extracting video: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Extracts both audio and video tracks in a single operation
 *
 * @param inputPath Path to the input video file
 * @param videoOutputPath Path where the video-only file will be saved
 * @param audioOutputPath Path where the audio-only file will be saved
 * @param useOriginalCodecs Whether to copy the original codecs (default: true)
 */
export async function extractAudioAndVideo(
  inputPath: string,
  videoOutputPath: string,
  audioOutputPath: string
): Promise<void> {
  // Ensure output directories exist
  await fs.mkdir(path.dirname(videoOutputPath), { recursive: true });
  await fs.mkdir(path.dirname(audioOutputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath);

    // Output 1: Video-only file

    command.output(videoOutputPath).outputOptions([
      "-an", // No audio
      "-c:v copy", // Copy video codec (no re-encoding)
    ]);

    // Output 2: Audio-only file
    command.output(audioOutputPath).outputOptions([
      "-vn", // No video
      "-c:a copy", // Copy audio codec (no re-encoding)
    ]);

    command
      .on("start", (commandLine) => {
        logger.info(`Extraction started: ${commandLine}`);
      })
      .on("progress", (progress) => {
        logger.info(
          `Extraction progress: ${progress.percent?.toFixed(2)}% complete`
        );
      })
      .on("end", () => {
        logger.info(`Extraction completed`);
        logger.info(`Video saved to: ${videoOutputPath}`);
        logger.info(`Audio saved to: ${audioOutputPath}`);
        resolve();
      })
      .on("error", (err) => {
        logger.error(`Error during extraction: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

export default {
  extractAudioTrack,
  extractVideoTrack,
  extractAudioAndVideo,
};
