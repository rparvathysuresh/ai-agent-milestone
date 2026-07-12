/**
 * Play Store CSV Ingester
 *
 * Parses a Play Store CSV export file and returns an array of raw review objects.
 * Expected CSV columns: rating, title, text, date
 *
 * @module ingestion/playStoreIngester
 */

import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

/**
 * Loads and parses a Play Store review CSV file.
 *
 * @param {string} filePath - Absolute or relative path to the CSV file.
 * @returns {{ reviews: object[], errors: string[] }}
 *          reviews: array of { rating, title, text, date } objects
 *          errors:  array of warning/error messages encountered during parsing
 */
export function ingestPlayStoreReviews(filePath) {
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

  // ── Parse CSV ───────────────────────────────────────────────
  let records;
  try {
    records = parse(fileContent, {
      columns: true,          // Use first row as header
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Handle mismatched column counts
    });
  } catch (err) {
    errors.push(`CSV parse error in ${filePath}: ${err.message}`);
    return { reviews: [], errors };
  }

  // ── Transform & validate rows ───────────────────────────────
  const reviews = [];
  let skippedEmpty = 0;
  let skippedMalformed = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];

    // Skip rows with empty or whitespace-only text
    if (!row.text || !row.text.trim()) {
      skippedEmpty++;
      continue;
    }

    // Parse rating — clamp to 1-5, null if non-numeric
    let rating = parseFloat(row.rating);
    if (isNaN(rating)) {
      rating = null;
      errors.push(`Row ${i + 2}: non-numeric rating "${row.rating}"`);
    } else {
      rating = Math.max(1, Math.min(5, Math.round(rating)));
    }

    reviews.push({
      rating,
      title: (row.title || '').trim(),
      text: row.text.trim(),
      date: (row.date || '').trim() || null,
    });
  }

  if (skippedEmpty > 0) {
    errors.push(`Skipped ${skippedEmpty} reviews with empty text`);
  }
  if (skippedMalformed > 0) {
    errors.push(`Skipped ${skippedMalformed} malformed rows`);
  }

  return { reviews, errors };
}
