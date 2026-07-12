/**
 * Weekly App Review Pulse — Main Pipeline Entry Point
 *
 * Orchestrates the full pipeline:
 *   1. Review Ingestion & PII Stripping
 *   2. Theme Clustering (LLM)
 *   3. Pulse Generation (LLM)
 *   4. Groq LLM Finalisation
 *   5. MCP Integration (Google Docs & Gmail)
 *
 * @module index
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { getWeekLabel, getCurrentWeekMonday } from './utils/dateHelpers.js';
import { countWords, isWithinLimit } from './utils/wordCount.js';
import { ingestPlayStoreReviews } from './ingestion/playStoreIngester.js';
import { ingestAppStoreReviews } from './ingestion/appStoreIngester.js';
import { normaliseAndFilter } from './ingestion/reviewNormaliser.js';
import { stripPIIFromReviews } from './privacy/piiStripper.js';
import { clusterReviewsIntoThemes } from './analysis/themeClustering.js';
import { generatePulse } from './generation/pulseGenerator.js';
import { finalisePulse } from './generation/groqFinaliser.js';
import { appendToMasterDoc } from './integrations/docsPublisher.js';
import { sendPulseEmail } from './integrations/gmailSender.js';
import { closeMcpClient } from './integrations/mcpClient.js';

// ── Load environment variables ──────────────────────────────
dotenv.config();

// ── Pipeline configuration ──────────────────────────────────
const config = {
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  mcpServerUrl: process.env.MCP_SERVER_URL,
  mcpAuthToken: process.env.MCP_AUTH_TOKEN,
  googleDocId: process.env.GOOGLE_DOC_ID,
  pulseRecipient: process.env.PULSE_RECIPIENT,
  reviewWindowWeeks: parseInt(process.env.REVIEW_WINDOW_WEEKS, 10) || 10,
};

// ── Data file paths ─────────────────────────────────────────
const DATA_DIR = resolve('data/reviews');
const PLAY_STORE_CSV = resolve(DATA_DIR, 'playstore_reviews.csv');
const APP_STORE_JSON = resolve(DATA_DIR, 'appstore_reviews.json');

// ── Main pipeline ───────────────────────────────────────────
async function runPipeline() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════');
  console.log('  Weekly App Review Pulse — Pipeline');
  console.log(`  Week of ${getCurrentWeekMonday()}`);
  console.log('═══════════════════════════════════════════════════');
  console.log();

  // ── Phase 2: Review Ingestion & PII Stripping ─────────────
  console.log('┌─ Phase 2: Review Ingestion & PII Stripping ─────');
  console.log('│');

  // 2.1 — Ingest Play Store reviews (CSV)
  console.log('│  Loading Play Store reviews...');
  const playResult = ingestPlayStoreReviews(PLAY_STORE_CSV);
  for (const err of playResult.errors) {
    console.log(`│  ⚠ ${err}`);
  }
  console.log(`│  ✓ Play Store: ${playResult.reviews.length} reviews loaded`);

  // 2.2 — Ingest App Store reviews (JSON)
  console.log('│  Loading App Store reviews...');
  const appResult = ingestAppStoreReviews(APP_STORE_JSON);
  for (const err of appResult.errors) {
    console.log(`│  ⚠ ${err}`);
  }
  console.log(`│  ✓ App Store: ${appResult.reviews.length} reviews loaded`);

  // 2.3 / 2.4 — Normalise, deduplicate, and filter by date window
  console.log('│');
  console.log(`│  Normalising & filtering (window: ${config.reviewWindowWeeks} weeks)...`);
  const { reviews, stats } = normaliseAndFilter(
    playResult.reviews,
    appResult.reviews,
    config.reviewWindowWeeks,
  );

  console.log(`│  ✓ Total raw: ${stats.totalRaw}`);
  if (stats.duplicatesRemoved > 0) console.log(`│  ✓ Duplicates removed: ${stats.duplicatesRemoved}`);
  if (stats.filteredByDate > 0) console.log(`│  ✓ Filtered (outside window): ${stats.filteredByDate}`);
  if (stats.nullDates > 0) console.log(`│  ⚠ Reviews with null dates (included): ${stats.nullDates}`);

  // Quality filters
  const qualityTotal = stats.filteredShort + stats.filteredEmoji + stats.filteredHindi + stats.filteredRomanisedHindi + stats.filteredIndicScript;
  if (qualityTotal > 0) {
    console.log('│');
    console.log(`│  Quality filters removed ${qualityTotal} reviews:`);
    if (stats.filteredShort > 0) console.log(`│    Short (<8 words):    ${stats.filteredShort}`);
    if (stats.filteredEmoji > 0) console.log(`│    Contains emoji:      ${stats.filteredEmoji}`);
    if (stats.filteredHindi > 0) console.log(`│    Hindi (Devanagari):  ${stats.filteredHindi}`);
    if (stats.filteredRomanisedHindi > 0) console.log(`│    Romanised Hindi:     ${stats.filteredRomanisedHindi}`);
    if (stats.filteredIndicScript > 0) console.log(`│    Other Indic script:  ${stats.filteredIndicScript}`);
  }

  // Abort if zero reviews remain
  if (reviews.length === 0) {
    console.log('│');
    console.log('│  ✗ No reviews within the date window. Aborting pipeline.');
    console.log('└──────────────────────────────────────────────────');
    process.exit(1);
  }

  // 2.5 — Strip PII
  console.log('│');
  console.log('│  Stripping PII...');
  const piiStats = stripPIIFromReviews(reviews);
  console.log(`│  ✓ PII hits: ${piiStats.totalPiiHits} across ${piiStats.reviewsAffected} reviews`);
  if (Object.keys(piiStats.details).length > 0) {
    const breakdown = Object.entries(piiStats.details)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    console.log(`│    Breakdown: ${breakdown}`);
  }
  if (piiStats.fullyRedacted > 0) {
    console.log(`│  ⚠ Fully redacted (removed): ${piiStats.fullyRedacted}`);
  }

  // Low volume warning
  if (reviews.length <= 2) {
    console.log(`│  ⚠ Very low review volume (${reviews.length} reviews) — themes may not be meaningful.`);
  }

  console.log('│');
  console.log(`│  ✓ Final: ${reviews.length} sanitised reviews (Play Store: ${stats.playStore}, App Store: ${stats.appStore})`);

  // Save normalised reviews to file
  const normalisedPath = resolve(DATA_DIR, 'normalised_reviews.json');
  writeFileSync(normalisedPath, JSON.stringify(reviews, null, 2), 'utf-8');
  console.log(`│  ✓ Saved to ${normalisedPath}`);

  console.log('└──────────────────────────────────────────────────');
  console.log();

  // ── Phase 3: Theme Clustering ─────────────────────────────
  console.log('┌─ Phase 3: Theme Clustering via Groq ──────────────');
  console.log('│');
  console.log(`│  Sending ${reviews.length} reviews to ${config.groqModel}...`);

  let themeMap;
  try {
    themeMap = await clusterReviewsIntoThemes(reviews, config.groqApiKey, config.groqModel);
  } catch (err) {
    console.log(`│  ✗ Theme clustering failed: ${err.message}`);
    console.log('└──────────────────────────────────────────────────');
    process.exit(1);
  }

  // Log discovered themes
  console.log(`│  ✓ Found ${themeMap.themes.length} themes across ${themeMap.totalReviewsAnalysed} reviews`);
  console.log(`│  ✓ Overall sentiment: ${themeMap.overallSentiment}`);
  if (themeMap.competitorMentions.length > 0) {
    console.log(`│  ✓ Competitors mentioned: ${themeMap.competitorMentions.join(', ')}`);
  }
  console.log('│');

  for (let i = 0; i < themeMap.themes.length; i++) {
    const t = themeMap.themes[i];
    const icon = t.sentiment === 'negative' ? '🔴' : t.sentiment === 'positive' ? '🟢' : '🟡';
    console.log(`│  ${icon} ${i + 1}. ${t.label} (${t.reviewCount} reviews, ${t.urgency})`);
    console.log(`│     ${t.description}`);
    console.log(`│     ↳ "${t.representativeQuotes[0]?.substring(0, 80)}..."`);
  }

  // Sentiment breakdown
  if (themeMap.sentimentBreakdown) {
    const sb = themeMap.sentimentBreakdown;
    console.log('│');
    console.log(`│  Sentiment: +${sb.positive} | -${sb.negative} | ~${sb.mixed} | ✦${sb.feature_request}`);
  }

  // Save themes to file
  const analysisDir = resolve('data/analysis');
  mkdirSync(analysisDir, { recursive: true });
  const themesPath = resolve(analysisDir, 'themes.json');
  writeFileSync(themesPath, JSON.stringify(themeMap, null, 2), 'utf-8');
  console.log('│');
  console.log(`│  ✓ Saved to ${themesPath}`);
  console.log('└──────────────────────────────────────────────────');
  console.log();

  // ── Phase 4: Pulse Generation ─────────────────────────────
  console.log('┌─ Phase 4: Pulse Generation ───────────────────────');
  console.log('│');
  console.log(`│  Generating pulse from top 3 themes (≤250 words)...`);

  let pulseResult;
  try {
    pulseResult = await generatePulse(themeMap, config.groqApiKey, config.groqModel);
  } catch (err) {
    console.log(`│  ✗ Pulse generation failed: ${err.message}`);
    console.log('└──────────────────────────────────────────────────');
    process.exit(1);
  }

  const { pulse, wordCount, warnings: pulseWarnings } = pulseResult;

  // Log warnings
  for (const w of pulseWarnings) {
    console.log(`│  ⚠ ${w}`);
  }

  // Log result
  console.log(`│  ✓ Pulse generated: ${wordCount} words`);
  if (wordCount > 250) {
    console.log(`│  ⚠ Word count exceeds 250!`);
  }

  // Show preview (first 3 non-empty lines)
  console.log('│');
  const previewLines = pulse.split('\n').filter(l => l.trim()).slice(0, 4);
  for (const line of previewLines) {
    console.log(`│  ${line.substring(0, 70)}${line.length > 70 ? '...' : ''}`);
  }
  console.log('│  ...');

  // Save pulse to file
  const pulsePath = resolve('data/analysis', 'pulse.md');
  writeFileSync(pulsePath, pulse, 'utf-8');
  console.log('│');
  console.log(`│  ✓ Saved to ${pulsePath}`);
  console.log('└──────────────────────────────────────────────────');
  console.log();

  // ── Phase 5: Groq LLM Finalisation ────────────────────────
  console.log('┌─ Phase 5: Groq LLM Finalisation ──────────────────');
  console.log('│');
  console.log(`│  Finalising pulse into report and email...`);

  // Extract quotes that MUST be preserved for validation
  const originalQuotes = themeMap.themes.flatMap(t => t.representativeQuotes);

  const finalResult = await finalisePulse(
    pulse,
    originalQuotes,
    config.groqApiKey,
    config.groqModel
  );

  for (const w of finalResult.warnings) {
    console.log(`│  ⚠ ${w}`);
  }

  const { finalReport, emailBody } = finalResult;

  console.log(`│  ✓ Report generated: ${countWords(finalReport)} words`);
  console.log(`│  ✓ Email body generated: ${countWords(emailBody)} words`);

  // Save finalized outputs
  const finalReportPath = resolve('data/analysis', 'final_report.md');
  const emailBodyPath = resolve('data/analysis', 'email_body.txt');
  writeFileSync(finalReportPath, finalReport, 'utf-8');
  writeFileSync(emailBodyPath, emailBody, 'utf-8');

  console.log('│');
  console.log(`│  ✓ Saved to ${finalReportPath}`);
  console.log(`│  ✓ Saved to ${emailBodyPath}`);
  console.log('└──────────────────────────────────────────────────');
  console.log();

  // ── Phase 6: MCP Integration ──────────────────────────────
  console.log('┌─ Phase 6: MCP Integration (Docs & Gmail) ─────────');
  console.log('│');
  
  if (!config.mcpServerUrl) {
    console.log('│  ⚠ MCP_SERVER_URL not set — skipping Phase 6.');
  } else {
    try {
      console.log('│  Connecting to MCP Server...');
      console.log('│  Appending report to Google Doc...');
      const docUrl = await appendToMasterDoc(config.mcpServerUrl, config.mcpAuthToken, config.googleDocId, finalReport);
      console.log(`│  ✓ Doc updated: ${docUrl}`);

      console.log('│  Sending email...');
      const resolvedEmailBody = emailBody.replace('{docUrl}', docUrl);
      const emailSubject = `Weekly App Review Pulse — ${getWeekLabel(getCurrentWeekMonday())}`;
      
      const messageId = await sendPulseEmail(config.mcpServerUrl, config.mcpAuthToken, config.pulseRecipient, emailSubject, resolvedEmailBody);
      console.log(`│  ✓ Email sent (Message ID: ${messageId})`);

    } catch (err) {
      console.log(`│  ✗ MCP Integration failed: ${err.message}`);
      console.log(`│  ⚠ Please rely on the local files generated in Phase 5.`);
    }
  }
  console.log('└──────────────────────────────────────────────────');

  // ── Done ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Pipeline complete in ${elapsed}s`);
  console.log('═══════════════════════════════════════════════════');

  await closeMcpClient();
}

// ── Run ─────────────────────────────────────────────────────
runPipeline().catch(async (err) => {
  console.error('Pipeline failed:', err.message);
  await closeMcpClient();
  process.exit(1);
});
