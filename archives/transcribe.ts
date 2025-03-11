// TODO
import { api } from "encore.dev/api";

import { db } from "./data";

type AudioTask = { audio: string; meetingId: string; video: string };

const LIMIT_LAST_NUMBER_OF_DAYS = 2;

export const transcribe = api(
  { method: "GET", path: "/api/transcribe" },
  async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - LIMIT_LAST_NUMBER_OF_DAYS);

    const meetings = db.meetingRecord.findMany({
      where: {
        AND: [{ videoUrl: null }, { startedAt: { gte: lastWeek } }],
      },
    });
  }
);
