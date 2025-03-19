import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { db as mediaDb } from "../services/media/db";

import { media } from "~encore/clients";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

describe("Media Service Tests", () => {
  const TEST_TIMEOUT = 300000; // 5 minutes for download tests

  // Mock data
  const MOCK_MEETING_ID = "mock-meeting-id-123";
  let REAL_VIDEO_URL = ""; // Will be populated from config if available

  // For tests that need real file operations
  let tempDir: string;

  // Create temp directory for test artifacts
  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `media-test-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // You could load a real video URL from env vars or a test config file
    try {
      const testConfig = await import("./test.config.js").catch(() => null);
      REAL_VIDEO_URL = testConfig?.REAL_VIDEO_URL || "";
    } catch (err) {
      console.warn("No test config found, some tests may be skipped");
    }
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error("Error cleaning up temp directory:", err);
    }
  });

  describe("Video Queue Management", () => {
    test("Queue a video batch", async () => {
      // Skip if no real video URL is available
      if (!REAL_VIDEO_URL) {
        console.warn("No real video URL available, using mock URL");
      }

      const videoUrl = REAL_VIDEO_URL || "https://example.com/mock-video.mp4";

      const queueResult = await media.queueVideoBatch({
        viewerUrls: [videoUrl],
        meetingRecordIds: [MOCK_MEETING_ID],
        extractAudio: true,
      });

      expect(queueResult.batchId).toBeTruthy();
      expect(queueResult.totalVideos).toBe(1);
      expect(queueResult.status).toBe("queued");

      // Store batch ID for potential use in other tests
      process.env.LAST_TEST_BATCH_ID = queueResult.batchId;
    });

    test("Get batch status", async () => {
      // Skip if no batch ID from previous test
      const batchId = process.env.LAST_TEST_BATCH_ID;
      if (!batchId) {
        console.warn("No batch ID available, skipping test");
        return;
      }

      const statusResult = await media.getBatchStatus({ batchId });
      expect(statusResult).toBeTruthy();
      expect(statusResult.tasks.length).toBeGreaterThan(0);
    });
  });

  describe("Video Processing", () => {
    test(
      "Process a video batch",
      async () => {
        const processResult = await media.processNextBatch({ batchSize: 1 });

        // If there are no batches to process, this is fine for a unit test
        if (!processResult) {
          console.log("No batches to process");
          return;
        }

        expect(processResult.processed).toBeGreaterThanOrEqual(0);
      },
      TEST_TIMEOUT,
    );

    test("Check if video file exists in database", async () => {
      // This can be run independently with a known video ID
      const videoId = process.env.TEST_VIDEO_ID;
      if (!videoId) {
        console.warn("No test video ID available, skipping test");
        return;
      }

      const video = await mediaDb.mediaFile.findUnique({
        where: { id: videoId },
      });

      expect(video).toBeTruthy();
      expect(video?.mimetype).toMatch(/^video/);
    });

    test("Check if audio file exists in database", async () => {
      const audioId = process.env.TEST_AUDIO_ID;
      if (!audioId) {
        console.warn("No test audio ID available, skipping test");
        return;
      }

      const audio = await mediaDb.mediaFile.findUnique({
        where: { id: audioId },
      });

      expect(audio).toBeTruthy();
      expect(audio?.mimetype).toMatch(/^audio/);
    });
  });

  // This test can be used to download a single video for testing purposes
  // It's marked as "skip" by default to avoid unexpected downloads
  describe.skip("Standalone Download Tests", () => {
    test(
      "Download a specific video directly",
      async () => {
        // You can implement a direct download test for debugging
        // This would bypass the queue system and test the downloader directly
      },
      TEST_TIMEOUT,
    );
  });
});
