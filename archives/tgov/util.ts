import logger from "encore.dev/log";
import { tz } from "@date-fns/tz";
import { addHours, addMinutes, parse } from "date-fns";

/**
 * Normalize a scraped name into it's canonical form (as used in the database).
 * - Removes all non-word characters except for dashes "-"
 * - Converts to lowercase
 * - Replaces each group of contiguous spaces with a single dash
 * @param name - The name to normalize (e.g. a committee name, meeting name, etc.)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^-\w]+/g, "");
}

type TGovDateInfo = Pick<
  PrismaJson.TGovIndexMeetingRawJSON,
  "date" | "duration"
>;

/**
 * Since TGov's dates are implicitly in the America/Chicago timezone and use a
 * non-standard format, special care must be taken to parse them correctly.
 *
 * The date format is "MMMM d, y - h:mm a" (e.g. "June 1, 2021 - 10:00 AM").
 * The duration format is "{hours}h {minutes}m" (e.g. "1h 30m").
 *
 * This function handles:
 * - parsing the duration and date
 * - implied timezone
 * - implied daylight savings changes //! TODO: Revisit this if the OK Gov't decides to stop using DST 💀
 * - calculating end time from the inputs
 * - converting to UTC and formatting as ISO 8601
 *
 * @param raw - The raw date and duration information from TGov.
 * @returns An object with the normalized start and end times.
 */
export function normalizeDate(raw: TGovDateInfo): {
  startedAt: string;
  endedAt: string;
} {
  const timeZone = "America/Chicago";
  const durationFormat = /(?<hours>\d+?h)\s+?(?<minutes>\d+?)m/;

  /**
   *Times on TGov's website are implicitly in the America/Chicago timezone
   */
  const start = parse(
    raw.date,
    "MMMM d, y - h:mm a",
    new Intl.DateTimeFormat("en-US", { timeZone }).format(Date.now()),
    { in: tz(timeZone) }
  );

  let end;
  let duration;

  duration = raw.duration.match(durationFormat)?.groups;

  if (!duration) {
    logger.warn("Failed to parse duration", raw.duration);
    duration = { hours: "0", minutes: "0" };
  }

  end = start.withTimeZone(timeZone);
  end = addHours(end, parseInt(duration.hours));
  end = addMinutes(end, parseInt(duration.minutes));

  return {
    startedAt: start.withTimeZone("UTC").toISOString(),
    endedAt: end.withTimeZone("UTC").toISOString(),
  };
}
