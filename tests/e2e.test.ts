import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { db as mediaDb } from "../media/data";
import { db as tgovDb } from "../tgov/data";
import { prisma as transcriptionDb } from "../transcription/data";

// Import Encore clients
import { media, tgov, transcription } from "~encore/clients";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Constants for testing
const TEST_MEETING_INDEX = 0; // First meeting in the list
const TEST_TIMEOUT = 1200000; // 20 minutes - in case it's a long video

describe("End-to-end transcription flow", () => {
  let tempDir: string;
  let meetingId: string;
  let videoUrl: string;
  let batchId: string;
  let videoId: string;
  let audioId: string;
  let jobId: string;

  // Create temp directory for test artifacts
  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `tulsa-transcribe-test-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error("Error cleaning up temp directory:", err);
    }
  });

  test(
    "Scrape TGov website",
    async () => {
      // Trigger a scrape of the TGov website
      const result = await tgov.scrape();
      expect(result.success).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "Get meeting list and extract video URL",
    async () => {
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
      // Process the queued batch
      const processResult = await media.processNextBatch({ batchSize: 1 });
      expect(processResult?.processed).toBe(1);

      // Wait for batch to complete and check status
      let batchComplete = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!batchComplete && attempts < maxAttempts) {
        attempts++;
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
        } else if (statusResult.status === "failed") {
          throw new Error(
            `Batch processing failed: ${JSON.stringify(statusResult)}`,
          );
        } else {
          // Wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      expect(batchComplete).toBe(true);
    },
    TEST_TIMEOUT,
  );

  test(
    "Submit audio for transcription",
    async () => {
      // Submit audio for transcription
      const transcriptionRequest = await transcription.transcribe({
        audioFileId: audioId,
        meetingRecordId: meetingId,
        model: "whisper-1",
      });

      jobId = transcriptionRequest.jobId;
      expect(jobId).toBeTruthy();
      expect(transcriptionRequest.status).toBe("queued");
    },
    TEST_TIMEOUT,
  );

  test(
    "Wait for transcription to complete",
    async () => {
      // Check transcription job status until complete
      let transcriptionComplete = false;
      let attempts = 0;
      const maxAttempts = 60; // More attempts for transcription

      while (!transcriptionComplete && attempts < maxAttempts) {
        attempts++;
        const jobStatus = await transcription.getJobStatus({ jobId });

        if (jobStatus.status === "completed") {
          transcriptionComplete = true;
          expect(jobStatus.transcriptionId).toBeTruthy();

          // Get the transcription details
          const transcriptionDetails = await transcription.getTranscription({
            transcriptionId: jobStatus.transcriptionId!,
          });

          expect(transcriptionDetails).toBeTruthy();
          expect(transcriptionDetails.text).toBeTruthy();
          expect(transcriptionDetails.text.length).toBeGreaterThan(0);
          expect(transcriptionDetails.segments?.length || 0).toBeGreaterThan(0);
        } else if (jobStatus.status === "failed") {
          throw new Error(`Transcription failed: ${JSON.stringify(jobStatus)}`);
        } else {
          // Wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
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
        where: { id: videoId },
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
      expect(transcriptions[0].audioFileId).toBe(audioId);
    },
    TEST_TIMEOUT,
  );
});
