/**
 * Video Downloader Module
 *
 * Provides functions for downloading videos from various sources, including m3u8 streams.
 */
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
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
 * Downloads a video from a viewer page URL by extracting the video source URL
 *
 * @param viewerUrl The URL of the video viewer page
 * @param outputPath The path where the video will be saved
 * @returns Promise that resolves when the download is complete
 */
export async function downloadVideoFromViewerPage(
  viewerUrl: string,
  outputPath: string
): Promise<void> {
  logger.info(`Extracting video URL from viewer page: ${viewerUrl}`);

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(viewerUrl.toString(), { waitUntil: "domcontentloaded" });

    const videoUrl = await page.evaluate(() => {
      // May be defined in the global scope of the page
      var video_url: string | null | undefined;

      if (typeof video_url === "string") return video_url;

      const videoElement = document.querySelector("video > source");
      if (!videoElement) {
        throw new Error("No element found with selector 'video > source'");
      }

      video_url = videoElement.getAttribute("src");
      if (!video_url) {
        throw new Error("No src attribute found on element");
      }

      return video_url;
    });

    logger.info(`Extracted video URL: ${videoUrl}`);
    await browser.close();

    // Download the video using the extracted URL
    return downloadVideo(videoUrl, outputPath);
  } catch (error) {
    await browser.close();
    throw error;
  }
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
  downloadVideoFromViewerPage,
  downloadVideoWithAudioExtraction,
};
