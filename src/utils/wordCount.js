/**
 * Word Count Utilities — Enforce the ≤250-word pulse constraint.
 *
 * @module utils/wordCount
 */

/**
 * Counts the number of words in a text string.
 * Words are defined as sequences of non-whitespace characters.
 *
 * @param {string} text - The text to count words in.
 * @returns {number} The word count (0 for empty/null/undefined input).
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

/**
 * Checks whether a text is within a given word-count limit.
 *
 * @param {string} text - The text to check.
 * @param {number} max  - Maximum allowed word count (default: 250).
 * @returns {boolean} `true` if word count ≤ max, `false` otherwise.
 */
export function isWithinLimit(text, max = 250) {
  return countWords(text) <= max;
}
