/**
 * Download Reviews — Fetches real reviews from Play Store and App Store.
 *
 * Usage: node scripts/downloadReviews.js
 *
 * Play Store: Uses google-play-scraper (public reviews, no login)
 * App Store:  Uses Apple's public RSS feed
 *
 * Output files:
 *   data/reviews/playstore_reviews.csv
 *   data/reviews/appstore_reviews.json
 */

import gplay from 'google-play-scraper';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Configuration ───────────────────────────────────────────
const GROWW_PLAY_STORE_ID = 'com.nextbillion.groww';
const GROWW_APP_STORE_ID  = '1404855753';
const COUNTRY             = 'in'; // India
const LANG                = 'en';
const TARGET_REVIEW_COUNT = 500;  // Aim for ~500 reviews from each store
const OUTPUT_DIR          = resolve('data/reviews');

// ── Ensure output directory exists ──────────────────────────
mkdirSync(OUTPUT_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────
// PLAY STORE — google-play-scraper
// ────────────────────────────────────────────────────────────
async function downloadPlayStoreReviews() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Downloading Play Store Reviews');
  console.log(`  App: ${GROWW_PLAY_STORE_ID}`);
  console.log('═══════════════════════════════════════════════════');
  console.log();

  let allReviews = [];
  let nextToken = undefined;
  let page = 0;

  // google-play-scraper returns ~150 reviews per call; paginate to get more
  while (allReviews.length < TARGET_REVIEW_COUNT) {
    page++;
    console.log(`  Fetching page ${page}... (${allReviews.length} reviews so far)`);

    try {
      const result = await gplay.reviews({
        appId: GROWW_PLAY_STORE_ID,
        lang: LANG,
        country: COUNTRY,
        sort: gplay.sort.NEWEST,
        num: 150,
        paginate: true,
        nextPaginationToken: nextToken,
      });

      if (!result.data || result.data.length === 0) {
        console.log('  No more reviews available.');
        break;
      }

      allReviews = allReviews.concat(result.data);
      nextToken = result.nextPaginationToken;

      if (!nextToken) {
        console.log('  Reached end of available reviews.');
        break;
      }
    } catch (err) {
      console.error(`  Error fetching page ${page}: ${err.message}`);
      break;
    }
  }

  console.log(`  Total fetched: ${allReviews.length} reviews`);

  // ── Convert to CSV ──────────────────────────────────────────
  const csvHeader = 'rating,title,text,date';
  const csvRows = allReviews.map((r) => {
    const rating = r.score || '';
    const title = escapeCsv(r.title || '');
    const text = escapeCsv(r.text || '');
    const date = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
    return `${rating},${title},${text},${date}`;
  });

  const csvContent = [csvHeader, ...csvRows].join('\n');
  const outPath = resolve(OUTPUT_DIR, 'playstore_reviews.csv');
  writeFileSync(outPath, csvContent, 'utf-8');
  console.log(`  ✓ Saved to ${outPath}`);
  console.log();

  return allReviews.length;
}

// ────────────────────────────────────────────────────────────
// APP STORE — Apple RSS Feed
// ────────────────────────────────────────────────────────────
async function downloadAppStoreReviews() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Downloading App Store Reviews');
  console.log(`  App ID: ${GROWW_APP_STORE_ID}`);
  console.log('═══════════════════════════════════════════════════');
  console.log();

  const allReviews = [];

  // Apple RSS feed returns max 50 reviews per page, up to 10 pages
  for (let page = 1; page <= 10; page++) {
    const url = `https://itunes.apple.com/${COUNTRY}/rss/customerreviews/page=${page}/id=${GROWW_APP_STORE_ID}/sortby=mostrecent/json`;

    console.log(`  Fetching page ${page}...`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`  Page ${page}: HTTP ${response.status} — stopping.`);
        break;
      }

      const data = await response.json();
      const entries = data?.feed?.entry;

      if (!entries || !Array.isArray(entries)) {
        console.log(`  Page ${page}: No entries found — stopping.`);
        break;
      }

      // First entry is often the app metadata, not a review
      const reviews = entries.filter((e) => e['im:rating']);

      for (const entry of reviews) {
        allReviews.push({
          rating: parseInt(entry['im:rating']?.label, 10) || null,
          title: entry.title?.label || '',
          text: entry.content?.label || '',
          date: entry.updated?.label || '',
        });
      }

      console.log(`  Page ${page}: ${reviews.length} reviews (total: ${allReviews.length})`);

      // Small delay to be polite to Apple's servers
      await sleep(500);
    } catch (err) {
      console.error(`  Error fetching page ${page}: ${err.message}`);
      break;
    }
  }

  console.log(`  Total fetched: ${allReviews.length} reviews`);

  // ── Save as JSON ────────────────────────────────────────────
  const outPath = resolve(OUTPUT_DIR, 'appstore_reviews.json');
  writeFileSync(outPath, JSON.stringify(allReviews, null, 2), 'utf-8');
  console.log(`  ✓ Saved to ${outPath}`);
  console.log();

  return allReviews.length;
}

// ── Helpers ─────────────────────────────────────────────────
function escapeCsv(text) {
  if (!text) return '';
  // If text contains commas, quotes, or newlines, wrap in quotes and escape inner quotes
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  }
  return text.replace(/\r?\n/g, ' ');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log('🔽 Downloading real app reviews for Groww...');
  console.log();

  const playCount = await downloadPlayStoreReviews();
  const appCount = await downloadAppStoreReviews();

  console.log('═══════════════════════════════════════════════════');
  console.log('  Download Complete');
  console.log(`  Play Store: ${playCount} reviews`);
  console.log(`  App Store:  ${appCount} reviews`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});
