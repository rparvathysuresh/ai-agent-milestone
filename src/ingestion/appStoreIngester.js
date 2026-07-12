/**
 * App Store JSON Ingester
 *
 * Parses an App Store JSON export file and returns an array of raw review objects.
 * Expected JSON: array of objects with { rating, title, text, date }
 *
 * @module ingestion/appStoreIngester
 */

import { readFileSync } from 'fs';

/**
 * Loads and parses an App Store review JSON file.
 *
 * @param {string} filePath - Absolute or relative path to the JSON file.
 * @returns {{ reviews: object[], errors: string[] }}
 *          reviews: array of { rating, title, text, date } objects
 *          errors:  array of warning/error messages encountered during parsing
 */
export function ingestAppStoreReviews(filePath) {
  const errors = [];

  // ── Read file ───────────────────────────────────────────────
  let fileContent;
  try {
    fileContent = readFileSync(filePath, 'utf-8');
  } catch (err) {
    errors.push(`File not found or unreadable: ${filePath}`);
    return { reviews: [], errors };
  }

  if (!fileContent.trim()) {
    errors.push(`Review file is empty: ${filePath}`);
    return { reviews: [], errors };
  }

  // ── Parse JSON ──────────────────────────────────────────────
  let rawData;
  try {
    rawData = JSON.parse(fileContent);
  } catch (err) {
    errors.push(`Invalid JSON in ${filePath}: ${err.message}`);
    return { reviews: [], errors };
  }

  // Handle both array and { reviews: [...] } formats
  const entries = Array.isArray(rawData) ? rawData : (rawData.reviews || []);

  if (!Array.isArray(entries)) {
    errors.push(`Expected an array of reviews in ${filePath}`);
    return { reviews: [], errors };
  }

  // ── Transform & validate entries ────────────────────────────
  const reviews = [];
  let skippedEmpty = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!entry || typeof entry !== 'object') {
      errors.push(`Entry ${i}: not a valid object, skipped`);
      continue;
    }

    // Skip entries with empty or whitespace-only text
    const text = (entry.text || entry.body || entry.content || '').trim();
    if (!text) {
      skippedEmpty++;
      continue;
    }

    // Parse rating — clamp to 1-5, null if non-numeric
    let rating = parseFloat(entry.rating || entry.score || entry.stars);
    if (isNaN(rating)) {
      rating = null;
      errors.push(`Entry ${i}: non-numeric rating`);
    } else {
      rating = Math.max(1, Math.min(5, Math.round(rating)));
    }

    reviews.push({
      rating,
      title: (entry.title || '').trim(),
      text,
      date: (entry.date || entry.updated || '').trim() || null,
    });
  }

  if (skippedEmpty > 0) {
    errors.push(`Skipped ${skippedEmpty} reviews with empty text`);
  }

  return { reviews, errors };
}
