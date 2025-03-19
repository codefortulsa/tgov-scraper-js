import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { db as mediaDb } from "../media/db";
import { db as tgovDb } from "../tgov/db";
import { db as transcriptionDb } from "../transcription/db";
// Optional: Import test config
import * as testConfig from "./test.config";

// Import Encore clients
import { media, tgov, transcription } from "~encore/clients";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Constants for testing
const TEST_MEETING_INDEX = 0; // First meeting in the list
const TEST_TIMEOUT = 1200000; // 20 minutes - in case it's a long video
const AUTO_UPDATE_CONFIG = false; // Whether to update test.config.ts with results

// Helper function to update test config with new values (for development)
async function updateTestConfig(updates: Record<string, string>) {
  if (!AUTO_UPDATE_CONFIG) return;

  try {
    // Read current config file
    const configPath = path.join(__dirname, "test.config.ts");
    const content = await fs.readFile(configPath, "utf-8");

    // Update each value
    let updatedContent = content;
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`export const ${key} = ".*";`, "g");
      updatedContent = updatedContent.replace(
        regex,
        `export const ${key} = "${value}";`,
      );
    }

    // Write back to file
    await fs.writeFile(configPath, updatedContent);
    console.log("Updated test.config.ts with new values");
  } catch (err) {
    console.error("Failed to update test config:", err);
  }
}

describe("End-to-end transcription flow", () => {
  let tempDir: string;
  let meetingId: string;
  let videoUrl: string;
  let batchId: string;
  let videoId: string;
  let audioId: string;
  let jobId: string;
  let transcriptionId: string;

  // Create temp directory for test artifacts
  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `tulsa-transcribe-test-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Optionally load values from test config
    meetingId = testConfig.TEST_MEETING_ID || "";
    videoId = testConfig.TEST_VIDEO_ID || "";
    audioId = testConfig.TEST_AUDIO_ID || "";
    jobId = testConfig.TEST_JOB_ID || "";
    transcriptionId = testConfig.TEST_TRANSCRIPTION_ID || "";
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });

      // Update test config with new IDs for future test runs
      if (meetingId && videoId && audioId && jobId && transcriptionId) {
        await updateTestConfig({
          TEST_MEETING_ID: meetingId,
          TEST_VIDEO_ID: videoId,
          TEST_AUDIO_ID: audioId,
          TEST_JOB_ID: jobId,
          TEST_TRANSCRIPTION_ID: transcriptionId,
        });
      }
    } catch (err) {
      console.error("Error cleaning up temp directory:", err);
    }
  });

  test(
    "Scrape TGov website",
    async () => {
      // Skip if meeting ID is already provided
      if (meetingId) {
        console.log(`Using existing meeting ID: ${meetingId}`);
        return;
      }

      // Trigger a scrape of the TGov website
      const result = await tgov.scrape();
      expect(result.success).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "Get meeting list and extract video URL",
    async () => {
      // Skip if both meeting ID and video URL are already available
      if (meetingId && testConfig.REAL_VIDEO_URL) {
        console.log(`Using existing meeting ID: ${meetingId} and video URL`);
        videoUrl = testConfig.REAL_VIDEO_URL;
        return;
      }

      // Get list of meetings
      const result = await tgov.listMeetings({ limit: 10 });
      expect(result.meetings.length).toBeGreaterThan(0);

      // Get a meeting with a video URL for testing
      const meetingsWithVideo = result.meetings.filter((m) => m.videoViewUrl);
      expect(meetingsWithVideo.length).toBeGreaterThan(0);

      // Save the first meeting with a video for further testing
      const meeting = meetingsWithVideo[TEST_MEETING_INDEX];
      meetingId = meeting.id;
      expect(meetingId).toBeTruthy();

      // Extract video URL from meeting view URL
      if (meeting.videoViewUrl) {
        const extractResult = await tgov.extractVideoUrl({
          viewerUrl: meeting.videoViewUrl,
        });
        videoUrl = extractResult.videoUrl;
        expect(videoUrl).toBeTruthy();
        expect(videoUrl).toMatch(/^https?:\/\//);
      } else {
        throw new Error("No meeting with video URL found");
      }
    },
    TEST_TIMEOUT,
  );

  test(
    "Queue video for download and processing",
    async () => {
      // Skip if we already have video and audio IDs
      if (videoId && audioId) {
        console.log(
          `Using existing video ID: ${videoId} and audio ID: ${audioId}`,
        );
        return;
      }

      // Queue a video batch with our test video
      const queueResult = await media.queueVideoBatch({
        viewerUrls: [videoUrl],
        meetingRecordIds: [meetingId],
        extractAudio: true,
      });

      batchId = queueResult.batchId;
      expect(batchId).toBeTruthy();
      expect(queueResult.totalVideos).toBe(1);
      expect(queueResult.status).toBe("queued");
    },
    TEST_TIMEOUT,
  );

  test(
    "Process the video batch",
    async () => {
      // Skip if we already have video and audio IDs
      if (videoId && audioId) {
        console.log(
          `Using existing video ID: ${videoId} and audio ID: ${audioId}`,
        );
        return;
      }

      // Process the queued batch
      const processResult = await media.processNextBatch({ batchSize: 1 });
      expect(processResult?.processed).toBe(1);

      // Wait for batch to complete and check status
      let batchComplete = false;

      console.log("Waiting for batch processing to complete...");
      while (!batchComplete) {
        const statusResult = await media.getBatchStatus({ batchId });

        if (
          statusResult.status === "completed" ||
          statusResult.completedTasks === statusResult.totalTasks
        ) {
          batchComplete = true;

          // Get the processed media IDs
          const task = statusResult.tasks[0];
          expect(task).toBeTruthy();
          videoId = task.videoId!;
          audioId = task.audioId!;

          expect(videoId).toBeTruthy();
          expect(audioId).toBeTruthy();

          console.log(
            `Video processing complete. Video ID: ${videoId}, Audio ID: ${audioId}`,
          );
        } else if (statusResult.status === "failed") {
          throw new Error(
            `Batch processing failed: ${JSON.stringify(statusResult)}`,
          );
        } else {
          // Show progress
          console.log(
            `Batch status: ${statusResult.status}, Completed: ${statusResult.completedTasks}/${statusResult.totalTasks}`,
          );

          // Wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 30 * 1000)); // check every 30 seconds
        }
      }

      expect(batchComplete).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "Submit audio for transcription",
    async () => {
      // Skip if we already have a job ID or transcription ID
      if (jobId || transcriptionId) {
        console.log(
          `Using existing job ID: ${jobId} or transcription ID: ${transcriptionId}`,
        );
        return;
      }

      // Submit audio for transcription
      const transcriptionRequest = await transcription.transcribe({
        audioFileId: audioId,
        meetingRecordId: meetingId,
        model: "whisper-1",
      });

      jobId = transcriptionRequest.jobId;
      expect(jobId).toBeTruthy();
      expect(transcriptionRequest.status).toBe("queued");

      console.log(`Submitted transcription job with ID: ${jobId}`);
    },
    TEST_TIMEOUT,
  );

  test(
    "Wait for transcription to complete",
    async () => {
      // Skip if we already have a transcription ID
      if (transcriptionId) {
        console.log(`Using existing transcription ID: ${transcriptionId}`);
        return;
      }

      // If no job ID, try to get one from test config
      if (!jobId && testConfig.TEST_JOB_ID) {
        jobId = testConfig.TEST_JOB_ID;
        console.log(`Using job ID from config: ${jobId}`);
      }

      expect(jobId).toBeTruthy();

      // Check transcription job status until complete
      let transcriptionComplete = false;
      let attempts = 0;
      const maxAttempts = 120; // More attempts for transcription (10 minutes with 5-second checks)

      console.log("Waiting for transcription to complete...");
      while (!transcriptionComplete && attempts < maxAttempts) {
        attempts++;
        const jobStatus = await transcription.getJobStatus({ jobId });

        if (jobStatus.status === "completed") {
          transcriptionComplete = true;
          expect(jobStatus.transcriptionId).toBeTruthy();
          transcriptionId = jobStatus.transcriptionId!;

          console.log(
            `Transcription complete. Transcription ID: ${transcriptionId}`,
          );

          // Get the transcription details
          const transcriptionDetails = await transcription.getTranscription({
            transcriptionId: transcriptionId,
          });

          expect(transcriptionDetails).toBeTruthy();
          expect(transcriptionDetails.text).toBeTruthy();
          expect(transcriptionDetails.text.length).toBeGreaterThan(0);
          expect(transcriptionDetails.segments?.length || 0).toBeGreaterThan(0);
        } else if (jobStatus.status === "failed") {
          throw new Error(`Transcription failed: ${JSON.stringify(jobStatus)}`);
        } else {
          // Show progress
          if (attempts % 12 === 0) {
            // Log every minute
            console.log(
              `Transcription status: ${jobStatus.status}, attempt ${attempts}/${maxAttempts}`,
            );
          }

          // Wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      if (!transcriptionComplete) {
        throw new Error(
          `Transcription did not complete after ${maxAttempts} attempts`,
        );
      }

      expect(transcriptionComplete).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "Verify database records for meeting",
    async () => {
      // Check that meeting record has been updated with media and transcription info
      const meeting = await tgovDb.meetingRecord.findUnique({
        where: { id: meetingId },
      });

      expect(meeting).toBeTruthy();

      // Check that media files exist in database
      const video = await mediaDb.mediaFile.findUnique({
        where: { id: meeting?.videoId || videoId },
      });
      expect(video).toBeTruthy();
      expect(video?.meetingRecordId).toBe(meetingId);

      const audio = await mediaDb.mediaFile.findUnique({
        where: { id: audioId },
      });
      expect(audio).toBeTruthy();
      expect(audio?.meetingRecordId).toBe(meetingId);

      // Check that transcription is linked to the meeting
      const transcriptions = await transcriptionDb.transcription.findMany({
        where: { meetingRecordId: meetingId },
      });
      expect(transcriptions.length).toBeGreaterThan(0);

      // At least one transcription should be linked to our audio file
      const matchingTranscription = transcriptions.find(
        (t) => t.audioFileId === audioId,
      );
      expect(matchingTranscription).toBeTruthy();
    },
    TEST_TIMEOUT,
  );
});
