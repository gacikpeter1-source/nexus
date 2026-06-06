/**
 * Format a Date as YYYY-MM-DD using LOCAL time (not UTC).
 * Using toISOString() instead would return the UTC date, causing off-by-one
 * errors for users in UTC+ timezones (e.g. UTC+2 midnight = UTC previous day).
 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
