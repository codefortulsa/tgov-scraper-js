import { db as tgovDb } from "../tgov/db";

import { tgov } from "~encore/clients";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Mock data
const MOCK_MEETING_ID = "mock-meeting-id-123";
const MOCK_VIDEO_URL = "https://example.com/video/12345.mp4";
const MOCK_VIEWER_URL = "https://tgov.example.com/viewer/12345";

// Tests for TGov service
describe("TGov Service Tests", () => {
  // Test specific timeout
  const TEST_TIMEOUT = 30000; // 30 seconds

  describe("Scraping Functionality", () => {
    test(
      "Scrape TGov website",
      async () => {
        // Trigger a scrape of the TGov website
        const result = await tgov.scrape();
        expect(result.success).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });

  describe("Meeting Management", () => {
    test(
      "List meetings",
      async () => {
        const result = await tgov.listMeetings({ limit: 5 });
        expect(result.meetings.length).toBeGreaterThan(0);

        // Validate meeting structure
        const meeting = result.meetings[0];
        expect(meeting).toHaveProperty("id");
        expect(meeting).toHaveProperty("title");
        expect(meeting).toHaveProperty("body");
      },
      TEST_TIMEOUT,
    );

    test(
      "Find meetings with videos",
      async () => {
        const result = await tgov.listMeetings({ limit: 10 });
        const meetingsWithVideo = result.meetings.filter((m) => m.videoViewUrl);
        expect(meetingsWithVideo.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe("Video URL Extraction", () => {
    test(
      "Extract video URL from viewer URL",
      async () => {
        // Get a meeting with a video URL for testing
        const result = await tgov.listMeetings({ limit: 10 });
        const meetingsWithVideo = result.meetings.filter((m) => m.videoViewUrl);

        if (meetingsWithVideo.length === 0) {
          console.warn("No meetings with video URLs found, skipping test");
          return;
        }

        const meeting = meetingsWithVideo[0];

        // Extract video URL
        const extractResult = await tgov.extractVideoUrl({
          viewerUrl: meeting.videoViewUrl!,
        });

        expect(extractResult.videoUrl).toBeTruthy();
        expect(extractResult.videoUrl).toMatch(/^https?:\/\//);
      },
      TEST_TIMEOUT,
    );

    // Optional: Test with a mock viewer URL if real ones are unavailable
    test.skip("Extract video URL with mock viewer URL", async () => {
      // This would use a mocked implementation of tgov.extractVideoUrl
    });
  });
});
