/**
 * Date Helpers — Week labelling and date-window filtering.
 *
 * @module utils/dateHelpers
 */

/**
 * Returns the ISO 8601 week label for a given date.
 * Example: "2026-W24"
 *
 * @param {Date|string} date - A Date object or a date string parseable by `new Date()`.
 * @returns {string} ISO week label in the format "YYYY-WNN", or "unknown" if the date is invalid.
 */
export function getWeekLabel(date) {
  if (date === null || date === undefined) {
    return 'unknown';
  }

  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return 'unknown';
  }

  // ISO 8601: week starts on Monday.
  // The week containing January 4th is always week 1.
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);

  // Set to nearest Thursday (current date + 4 - current day number,
  // where Sunday = 7 for ISO purposes).
  const dayNum = target.getDay() || 7; // Convert Sunday (0) to 7
  target.setDate(target.getDate() + 4 - dayNum);

  // January 1st of that Thursday's year
  const yearStart = new Date(target.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);

  return `${target.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Checks whether a given date falls within the last N weeks from today.
 *
 * @param {Date|string} date  - A Date object or a date string.
 * @param {number}      weeks - Number of weeks to look back (default: 10).
 * @returns {boolean} `true` if the date is within the window, `false` otherwise.
 *                    Returns `true` for null/invalid dates (include them with a warning upstream).
 */
export function isWithinWindow(date, weeks = 10) {
  if (date === null || date === undefined) {
    // Null dates are included by convention (caller logs a warning).
    return true;
  }

  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    // Unparseable dates are treated as "include" (same as null).
    return true;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

  return d >= cutoff;
}

/**
 * Returns the Monday of the current ISO week as a formatted string.
 * Useful for pulse titles: "Week of July 7, 2026"
 *
 * @returns {string} Formatted date string.
 */
export function getCurrentWeekMonday() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(now.setDate(diff));

  return monday.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
