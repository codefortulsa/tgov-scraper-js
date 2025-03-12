import logger from "encore.dev/log";

import { tz } from "@date-fns/tz";
import { addHours, addMinutes, parse } from "date-fns";

/**
 * Types for TGov-specific data
 */
export interface TGovDateInfo {
  date: string;
  duration: string;
}

/**
 * Normalize a scraped name into its canonical form (as used in the database).
 *
 * In order, this function:
 *  - Trims the name
 *  - Converts the name to lowercase
 *  - Changes spaces to underscores
 *  - Removes all non-word characters except for dashes
 *  - Collapses multiple dashes into a single dash
 *  - collapses multiple underscores into a single underscore
 *
 * @param name - The name to normalize (e.g. a committee name, meeting name, etc.)
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^-\w]/g, "")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_");
}

/**
 * Extract startedAt and endedAt timestamps from raw TGov date info
 Since TGov's dates are implicitly in the America/Chicago timezone and use a
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
 * @param raw The raw date information from TGov
 * @returns Object containing normalized startedAt and endedAt timestamps
 */
export function normalizeDate(raw: TGovDateInfo): {
  startedAt: string;
  endedAt: string;
} {
  const timeZone = "America/Chicago";
  const durationFormat = /(?<hours>\d+?)h\s+?(?<minutes>\d+?)m/;

  const start = parse(
    raw.date,
    "MMMM d, y - h:mm a",
    new Intl.DateTimeFormat("en-US", { timeZone }).format(Date.now()),
    { in: tz(timeZone) },
  );

  let duration = raw.duration.match(durationFormat)?.groups;
  if (!duration) logger.warn("Failed to parse duration", raw.duration);
  duration ??= { hours: "0", minutes: "0" };

  let end;
  end = start.withTimeZone(timeZone);
  end = addHours(end, parseInt(duration.hours));
  end = addMinutes(end, parseInt(duration.minutes));

  return {
    startedAt: start.withTimeZone("UTC").toISOString(),
    endedAt: end.withTimeZone("UTC").toISOString(),
  };
}
