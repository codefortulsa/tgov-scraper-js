/**
 * Video Downloader Module
 *
 * Provides functions for downloading videos from various sources, including m3u8 streams.
 */
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import logger from "encore.dev/log";

// The types for progress and codec data from fluent-ffmpeg
export interface ProgressData {
  frames: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
  percent?: number;
}

/**
 * Downloads a video from a URL to a local file
 *
 * @param url The URL of the video to download (supports m3u8 and other formats)
 * @param outputPath The path where the video will be saved
 * @param progressCallback Optional callback to report download progress
 * @returns Promise that resolves when the download is complete
 */
export async function downloadVideo(
  url: string,
  outputPath: string,
  progressCallback?: (progress: ProgressData) => void
): Promise<void> {
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(url)
      .inputOptions("-protocol_whitelist", "file,http,https,tcp,tls,crypto")
      .outputOptions("-c", "copy")
      .output(outputPath);

    if (progressCallback) {
      command.on("progress", progressCallback);
    } else {
      command.on("progress", (progress) => {
        logger.info(
          `Download progress: ${progress.percent?.toFixed(2)}% complete`
        );
      });
    }

    command
      .on("codecData", (data) => {
        logger.info(`Input codec: ${data.video} video / ${data.audio} audio`);
      })
      .on("end", () => {
        logger.info(`Video download completed: ${outputPath}`);
        resolve();
      })
      .on("error", (err) => {
        logger.error(`Error downloading video: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Downloads a video while simultaneously extracting the audio track
 *
 * @param url The URL of the video to download
 * @param videoOutputPath The path where the video will be saved
 * @param audioOutputPath The path where the audio will be saved
 * @returns Promise that resolves when both downloads are complete
 */
export async function downloadVideoWithAudioExtraction(
  url: string,
  videoOutputPath: string,
  audioOutputPath: string
): Promise<void> {
  // Ensure output directories exist
  await fs.mkdir(path.dirname(videoOutputPath), { recursive: true });
  await fs.mkdir(path.dirname(audioOutputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ffmpeg(url)
      .inputOptions("-protocol_whitelist", "file,http,https,tcp,tls,crypto")
      // Output 1: Video file with video and audio
      .output(videoOutputPath)
      .outputOptions("-c", "copy")

      // Output 2: Audio file with just audio
      .output(audioOutputPath)
      .outputOptions("-vn") // No video
      .outputOptions("-acodec", "libmp3lame") // Use MP3 codec
      .outputOptions("-ab", "128k") // Audio bitrate

      .on("progress", (progress) => {
        logger.info(
          `Download progress: ${progress.percent?.toFixed(2)}% complete`
        );
      })
      .on("end", () => {
        logger.info(`Video and audio extraction completed`);
        logger.info(`Video saved to: ${videoOutputPath}`);
        logger.info(`Audio saved to: ${audioOutputPath}`);
        resolve();
      })
      .on("error", (err) => {
        logger.error(`Error processing video: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

export default {
  downloadVideo,
  downloadVideoWithAudioExtraction,
};
