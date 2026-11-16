/**
 * Formats a scheduled session timestamp with local timezone abbreviation or offset.
 * e.g., "Nov 16, 2026, 9:25 PM GMT+5:30"
 */
export function formatScheduledTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!date || Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
