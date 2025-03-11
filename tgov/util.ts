import { parse, addHours, addMinutes } from "date-fns";
import { tz } from "@date-fns/tz";

/**
 * Types for TGov-specific data
 */
export interface TGovDateInfo {
  date: string;
  duration: string;
}

/**
 * Normalize a scraped name into its canonical form (as used in the database).
 * - Removes all non-word characters except for dashes "-"
 * - Converts to lowercase
 * - Replaces each group of contiguous spaces with a single dash
 * @param name - The name to normalize (e.g. a committee name, meeting name, etc.)
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Extract startedAt and endedAt timestamps from raw TGov date info
 * Times on TGov's website are implicitly in the America/Chicago timezone
 * 
 * @param raw The raw date information from TGov
 * @returns Object containing normalized startedAt and endedAt timestamps
 */
export function normalizeDate(raw: TGovDateInfo): {
  startedAt: Date;
  endedAt: Date;
} {
  const timeZone = "America/Chicago";
  const durationFormat = /(?<hours>\d+?h)\s+?(?<minutes>\d+?)m/;

  const start = parse(
    raw.date,
    "MMMM d, y - h:mm a",
    new Intl.DateTimeFormat("en-US", { timeZone }).format(Date.now()),
    { in: tz(timeZone) }
  );

  let end;
  let { groups: duration } = raw.duration.match(durationFormat) || {};

  if (!duration) console.warn("Failed to parse duration", raw.duration);
  duration ??= { hours: "0h", minutes: "0m" };

  // Extract just the number from "5h" -> 5
  const hours = parseInt(duration.hours);
  const minutes = parseInt(duration.minutes);
  
  // Calculate the end time by adding the duration to the start time
  end = new Date(start);
  end = addHours(end, hours);
  end = addMinutes(end, minutes);

  return { startedAt: start, endedAt: end };
}
