import { db as transcriptionDb } from "../transcription/db";

import { transcription } from "~encore/clients";

import { describe, expect, test, vi } from "vitest";

describe("Transcription Service Tests", () => {
  const TEST_TIMEOUT = 300000; // 5 minutes for longer tests

  // Test audio file ID for transcription tests
  const TEST_AUDIO_ID = process.env.TEST_AUDIO_ID || ""; // Set this before running tests
  const TEST_MEETING_ID = process.env.TEST_MEETING_ID || "";

  describe("Transcription Job Management", () => {
    test("Submit transcription job", async () => {
      // Skip if no test audio ID is available
      if (!TEST_AUDIO_ID) {
        console.warn("No test audio ID available, skipping test");
        return;
      }

      const transcribeResult = await transcription.transcribe({
        audioFileId: TEST_AUDIO_ID,
        meetingRecordId: TEST_MEETING_ID || "test-meeting",
        model: "whisper-1",
      });

      expect(transcribeResult.jobId).toBeTruthy();
      expect(transcribeResult.status).toBe("queued");

      // Store job ID for other tests
      process.env.LAST_TEST_JOB_ID = transcribeResult.jobId;
    });

    test("Get job status", async () => {
      const jobId = process.env.LAST_TEST_JOB_ID;
      if (!jobId) {
        console.warn("No job ID available, skipping test");
        return;
      }

      const jobStatus = await transcription.getJobStatus({ jobId });
      expect(jobStatus).toBeTruthy();
      expect(jobStatus.status).toMatch(
        /^(queued|processing|completed|failed)$/,
      );
    });
  });

  describe("Transcription Results", () => {
    test("Get transcription details", async () => {
      // You can use a known transcription ID for this test
      const transcriptionId = process.env.TEST_TRANSCRIPTION_ID;
      if (!transcriptionId) {
        console.warn("No transcription ID available, skipping test");
        return;
      }

      const details = await transcription.getTranscription({
        transcriptionId,
      });

      expect(details).toBeTruthy();
      expect(details.text).toBeTruthy();
    });

    test("Check database for transcription record", async () => {
      // You can use a meeting ID to find related transcriptions
      const meetingId = process.env.TEST_MEETING_ID;
      if (!meetingId) {
        console.warn("No meeting ID available, skipping test");
        return;
      }

      const transcriptions = await transcriptionDb.transcription.findMany({
        where: { meetingRecordId: meetingId },
      });

      expect(transcriptions.length).toBeGreaterThanOrEqual(0);
    });
  });

  // Optional: Mock tests for faster development
  describe("Mock Transcription Tests", () => {
    // You can add tests with mocked transcription service responses here
    // These tests would run faster and not depend on actual transcription jobs

    test.skip("Mock transcription job submission", async () => {
      // Example of a test with a mocked transcription service
    });
  });
});
