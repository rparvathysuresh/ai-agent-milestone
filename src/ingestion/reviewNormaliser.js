/**
 * Review Normaliser
 *
 * Merges reviews from multiple sources into a unified Review[] schema,
 * assigns UUIDs and week labels, deduplicates, and filters by date window.
 *
 * @module ingestion/reviewNormaliser
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { getWeekLabel, isWithinWindow } from '../utils/dateHelpers.js';

/**
 * @typedef {Object} Review
 * @property {string}      id        - UUID v4
 * @property {string}      source    - "play_store" | "app_store"
 * @property {number|null} rating    - 1–5 or null
 * @property {string}      title     - Review title
 * @property {string}      text      - Review body text
 * @property {string|null} date      - ISO date string or null
 * @property {string}      weekLabel - ISO week label e.g. "2026-W24"
 */

/**
 * Normalises and merges raw reviews from multiple ingesters into a unified Review[].
 *
 * @param {object[]} playStoreRaw - Raw reviews from Play Store ingester.
 * @param {object[]} appStoreRaw  - Raw reviews from App Store ingester.
 * @param {number}   windowWeeks  - Number of weeks to look back (default: 10).
 * @returns {{ reviews: Review[], stats: object }}
 */
export function normaliseAndFilter(playStoreRaw, appStoreRaw, windowWeeks = 10) {
  const stats = {
    totalRaw: 0,
    duplicatesRemoved: 0,
    filteredByDate: 0,
    filteredShort: 0,
    filteredEmoji: 0,
    filteredHindi: 0,
    filteredRomanisedHindi: 0,
    filteredIndicScript: 0,
    nullDates: 0,
    playStore: 0,
    appStore: 0,
    final: 0,
  };

  // ── Step 1: Tag with source & create Review objects ────────
  const allReviews = [];

  for (const raw of playStoreRaw) {
    allReviews.push(createReview(raw, 'play_store'));
  }
  for (const raw of appStoreRaw) {
    allReviews.push(createReview(raw, 'app_store'));
  }

  stats.totalRaw = allReviews.length;

  // ── Step 2: Deduplicate by content hash ────────────────────
  const seen = new Set();
  const deduped = [];

  for (const review of allReviews) {
    const hash = contentHash(review);
    if (seen.has(hash)) {
      stats.duplicatesRemoved++;
      continue;
    }
    seen.add(hash);
    deduped.push(review);
  }

  // ── Step 3: Filter by date window ─────────────────────────
  const dateFiltered = [];

  for (const review of deduped) {
    if (review.date === null) {
      stats.nullDates++;
      // Include reviews with null dates (as per edge-cases.md)
      dateFiltered.push(review);
      continue;
    }

    if (isWithinWindow(review.date, windowWeeks)) {
      dateFiltered.push(review);
    } else {
      stats.filteredByDate++;
    }
  }

  // ── Step 4: Quality filters ───────────────────────────────
  const filtered = [];

  for (const review of dateFiltered) {
    // 4a — Skip short reviews (< 8 words)
    const wordCount = review.text.trim().split(/\s+/).length;
    if (wordCount < 8) {
      stats.filteredShort++;
      continue;
    }

    // 4b — Skip reviews containing emoji
    if (containsEmoji(review.text)) {
      stats.filteredEmoji++;
      continue;
    }

    // 4c — Skip Hindi-language reviews (Devanagari script)
    if (containsHindi(review.text)) {
      stats.filteredHindi++;
      continue;
    }

    // 4d — Skip romanised Hindi/Hinglish reviews (word-list heuristic)
    if (isRomanisedHindi(review.text)) {
      stats.filteredRomanisedHindi++;
      continue;
    }

    // 4e — Skip reviews in other Indic scripts (Tamil, Telugu, Kannada, etc.)
    if (containsIndicScript(review.text)) {
      stats.filteredIndicScript++;
      continue;
    }

    filtered.push(review);
  }

  // ── Step 5: Count by source ───────────────────────────────
  for (const review of filtered) {
    if (review.source === 'play_store') stats.playStore++;
    if (review.source === 'app_store') stats.appStore++;
  }
  stats.final = filtered.length;

  return { reviews: filtered, stats };
}

/**
 * Creates a normalised Review object from raw ingester data.
 *
 * @param {object} raw    - Raw review from an ingester.
 * @param {string} source - "play_store" | "app_store"
 * @returns {Review}
 */
function createReview(raw, source) {
  const dateStr = raw.date || null;

  return {
    id: randomUUID(),
    source,
    rating: raw.rating,
    title: raw.title || '',
    text: raw.text || '',
    date: dateStr,
    weekLabel: getWeekLabel(dateStr),
  };
}

/**
 * Creates a content hash for deduplication (text + date + source).
 *
 * @param {Review} review
 * @returns {string} SHA-256 hex digest (truncated to 16 chars)
 */
function contentHash(review) {
  const payload = `${review.text}|${review.date}|${review.source}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Checks whether text contains emoji characters.
 *
 * @param {string} text
 * @returns {boolean}
 */
function containsEmoji(text) {
  // Matches common emoji Unicode ranges
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/u;
  return emojiRegex.test(text);
}

/**
 * Checks whether text contains Hindi (Devanagari script) characters.
 *
 * @param {string} text
 * @returns {boolean}
 */
function containsHindi(text) {
  const devanagariRegex = /[\u0900-\u097F]/;
  return devanagariRegex.test(text);
}

/**
 * Detects romanised Hindi/Hinglish using a word-list heuristic.
 * If ≥ 3 Hindi indicator words appear in the text, it's classified as Hinglish.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isRomanisedHindi(text) {
  const hindiWords = new Set([
    'hai', 'nahi', 'karo', 'kya', 'bahut', 'achha', 'acha', 'bhi',
    'mujhe', 'aur', 'iske', 'yeh', 'mein', 'lekin', 'bohot', 'koi',
    'kyuki', 'laga', 'abhi', 'jata', 'hota', 'kuch', 'wala', 'raha',
    'tha', 'thi', 'hoon', 'hun', 'kar', 'mat', 'sab', 'apna', 'apni',
    'agar', 'toh', 'phir', 'accha', 'achhe', 'bahot', 'paisa', 'paise',
    'chahiye', 'deta', 'dete', 'liya', 'liye', 'kaafi', 'bilkul',
    'zyada', 'jyada', 'kam', 'bekar', 'bakwas', 'chutiya', 'ghatiya',
    'gatiya', 'chor', 'dhoka', 'fraud', 'milta', 'milti', 'dikha',
    'huwa', 'huyi', 'hota', 'leke', 'wahi', 'sabse', 'isliye',
    'jaisa', 'jaise', 'matlab', 'samajh', 'chalana', 'chalao',
  ]);

  const words = text.toLowerCase().split(/\s+/);
  let matches = 0;

  for (const word of words) {
    // Strip punctuation for matching
    const clean = word.replace(/[^a-z]/g, '');
    if (hindiWords.has(clean)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

/**
 * Checks whether text contains non-Latin Indic script characters
 * (Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Oriya).
 *
 * @param {string} text
 * @returns {boolean}
 */
function containsIndicScript(text) {
  const indicRegex = /[\u0B80-\u0BFF]|[\u0C00-\u0C7F]|[\u0C80-\u0CFF]|[\u0980-\u09FF]|[\u0A80-\u0AFF]|[\u0D00-\u0D7F]|[\u0B00-\u0B7F]/;
  return indicRegex.test(text);
}
