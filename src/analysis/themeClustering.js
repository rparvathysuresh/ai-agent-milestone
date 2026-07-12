/**
 * Theme Clustering — LLM-powered review theme extraction.
 *
 * Sends sanitised reviews to Groq LLM and identifies ≤ 5 recurring themes
 * with sentiment breakdown, representative verbatim quotes, and action insights.
 *
 * Pipeline: sentimentHints → single Groq call → parse & validate → ThemeMap
 *
 * @module analysis/themeClustering
 */

import Groq from 'groq-sdk';

const MAX_THEMES = 5;
const MAX_RETRIES = 3;

// ── 3.2: Sentiment Pre-Classification ───────────────────────

const FEATURE_REQUEST_KEYWORDS = [
  'please add', 'should have', 'wish', 'would love', 'looking forward',
  'i request', 'pls add', 'need to add', 'add a', 'add an', 'introduce',
  'want to see', 'missing feature', 'if possible', 'it would be',
  'make it possible', 'bring it back', 'why not add',
];

const NEGATIVE_KEYWORDS = [
  'worst', 'terrible', 'scam', 'fraud', 'cheat', 'unusable', 'broken',
  'crash', 'bug', 'lag', 'slow', 'poor', 'bad experience', 'not working',
  'not helpful', 'unacceptable', 'ridiculous', 'disappointing', 'horrible',
  'annoying', 'frustrating', 'cheated', 'hidden charges',
];

/**
 * Assigns a sentiment hint to a review based on star rating + keyword heuristics.
 *
 * @param {object} review - Review object with `rating` and `text`.
 * @returns {string} One of: "positive", "negative", "mixed", "feature_request"
 */
export function classifySentiment(review) {
  const textLower = review.text.toLowerCase();

  // Check for feature request keywords first
  const isFeatureRequest = FEATURE_REQUEST_KEYWORDS.some((kw) => textLower.includes(kw));
  if (isFeatureRequest) return 'feature_request';

  // Check for negative keywords regardless of rating
  const hasNegativeSignal = NEGATIVE_KEYWORDS.some((kw) => textLower.includes(kw));

  if (review.rating === null) return 'mixed';

  if (review.rating >= 4 && !hasNegativeSignal) return 'positive';
  if (review.rating <= 2) return 'negative';
  if (review.rating === 3 || hasNegativeSignal) return 'mixed';

  return 'positive';
}

// ── 3.3–3.5: LLM Clustering ────────────────────────────────

/**
 * Clusters reviews into themes using Groq LLM.
 *
 * @param {object[]} reviews  - Array of sanitised Review objects.
 * @param {string}   apiKey   - Groq API key.
 * @param {string}   model    - Groq model identifier (e.g. "llama-3.3-70b-versatile").
 * @returns {Promise<object>} ThemeMap object.
 */
export async function clusterReviewsIntoThemes(reviews, apiKey, model) {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Cannot perform theme clustering.');
  }

  const groq = new Groq({ apiKey });

  // ── Tag reviews with sentiment hints ──────────────────────
  const taggedReviews = reviews.map((r) => ({
    ...r,
    sentimentHint: classifySentiment(r),
  }));

  // ── Build the prompt ──────────────────────────────────────
  const reviewTexts = taggedReviews
    .map((r, i) => `[${i + 1}] (★${r.rating || '?'}, ${r.sentimentHint}) ${r.text}`)
    .join('\n');

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(reviewTexts, reviews.length);

  // ── Call LLM with retry logic ─────────────────────────────
  let themeMap = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });

      const responseText = result.choices[0]?.message?.content || '';
      themeMap = parseAndValidate(responseText, reviews);

      if (themeMap) break;

    } catch (err) {
      lastError = err;
      console.log(`│  ⚠ Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      if (attempt < MAX_RETRIES) {
        const delay = 3000;
        console.log(`│  ⏳ Waiting ${delay / 1000}s before retry...`);
        await sleep(delay);
      }
    }
  }

  if (!themeMap) {
    throw new Error(
      `Theme clustering failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  // Attach sentiment summary
  const sentimentCounts = { positive: 0, negative: 0, mixed: 0, feature_request: 0 };
  for (const r of taggedReviews) {
    sentimentCounts[r.sentimentHint]++;
  }
  themeMap.sentimentBreakdown = sentimentCounts;

  return themeMap;
}

// ── Prompt Builders ─────────────────────────────────────────

function buildSystemPrompt() {
  return `You are a senior product analyst at a fintech company.
You are analysing user reviews of "Groww" — a stock trading and mutual fund
investment app available on the Google Play Store.

Context about this app:
- Groww is an Indian fintech platform for stocks, mutual funds, bonds, IPOs, and F&O trading.
- "Groww Prime" is their premium membership for mutual funds.
- "915 by Groww" is their stock analysis tool.
- Key competitors include Zerodha, Upstox, IndMoney, Angel One.
- Common user concerns include: brokerage charges, app stability during market
  hours, withdrawal speed, KYC process, customer support quality, and chart/UI quality.

TASK:
Given the following user reviews (each tagged with a sentiment hint),
identify the top recurring themes. Return AT MOST ${MAX_THEMES} themes.

For each theme provide:
- "label": short name (2-4 words)
- "sentiment": dominant sentiment of this theme ("positive", "negative", "mixed")
- "urgency": how urgently this needs attention ("critical", "high", "medium", "low")
- "description": one clear sentence explaining the theme
- "reviewCount": number of reviews related to this theme
- "representativeQuotes": exactly 3 verbatim quotes copied from the reviews (no edits)
- "actionInsight": one sentence suggesting what the product team should do

RULES:
- Quotes MUST be exact substrings from the provided reviews. Do not modify them.
- Sort themes by reviewCount descending.
- Do not create duplicate themes for the same underlying issue.
- If a review matches multiple themes, count it only in the most relevant one.

Return ONLY valid JSON matching this schema:
{
  "themes": [
    {
      "label": "string",
      "sentiment": "positive|negative|mixed",
      "urgency": "critical|high|medium|low",
      "description": "string",
      "reviewCount": number,
      "representativeQuotes": ["string", "string", "string"],
      "actionInsight": "string"
    }
  ],
  "competitorMentions": ["string"],
  "overallSentiment": "positive|negative|mixed",
  "totalReviewsAnalysed": number
}`;
}

function buildUserPrompt(reviewTexts, totalCount) {
  return `Here are ${totalCount} user reviews for the Groww app. Each review is tagged with a star rating and a sentiment hint. Analyse them and identify the top recurring themes.

REVIEWS:
${reviewTexts}

Identify the top themes (at most ${MAX_THEMES}) and return the JSON response.`;
}

// ── Response Parsing & Validation ───────────────────────────

/**
 * Parses and validates the LLM JSON response.
 */
function parseAndValidate(responseText, reviews) {
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.log('│  ⚠ LLM returned invalid JSON, retrying...');
    return null;
  }

  if (!parsed.themes || !Array.isArray(parsed.themes)) {
    console.log('│  ⚠ Response missing "themes" array, retrying...');
    return null;
  }

  // Enforce max themes
  if (parsed.themes.length > MAX_THEMES) {
    parsed.themes = parsed.themes.slice(0, MAX_THEMES);
  }

  // Validate each theme
  const allReviewTexts = reviews.map((r) => r.text.toLowerCase());

  for (const theme of parsed.themes) {
    theme.label = theme.label || 'Unnamed Theme';
    theme.description = theme.description || '';
    theme.sentiment = theme.sentiment || 'mixed';
    theme.urgency = theme.urgency || 'medium';
    theme.reviewCount = typeof theme.reviewCount === 'number' ? theme.reviewCount : 0;
    theme.actionInsight = theme.actionInsight || '';
    theme.representativeQuotes = Array.isArray(theme.representativeQuotes)
      ? theme.representativeQuotes
      : [];

    // Verify quotes against actual reviews
    const verifiedQuotes = [];
    for (const quote of theme.representativeQuotes) {
      if (typeof quote !== 'string' || !quote.trim()) continue;

      const quoteLower = quote.toLowerCase().trim();
      const isReal = allReviewTexts.some(
        (reviewText) =>
          reviewText.includes(quoteLower) ||
          quoteLower.includes(reviewText) ||
          fuzzyMatch(reviewText, quoteLower) >= 0.6
      );

      if (isReal) {
        verifiedQuotes.push(quote);
      } else {
        // Replace with closest matching real review
        const closest = findClosestReview(quote, reviews);
        if (closest) {
          verifiedQuotes.push(closest.text);
        }
      }
    }

    theme.representativeQuotes = verifiedQuotes.slice(0, 3);
  }

  // Remove themes with 0 verified quotes
  parsed.themes = parsed.themes.filter((t) => t.representativeQuotes.length > 0);

  if (parsed.themes.length === 0) {
    console.log('│  ⚠ No themes with verified quotes, retrying...');
    return null;
  }

  // Ensure top-level fields
  parsed.competitorMentions = parsed.competitorMentions || [];
  parsed.overallSentiment = parsed.overallSentiment || 'mixed';
  parsed.totalReviewsAnalysed = parsed.totalReviewsAnalysed || reviews.length;

  return parsed;
}

// ── Helpers ─────────────────────────────────────────────────

function fuzzyMatch(text1, text2) {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  let matches = 0;
  for (const w of words2) {
    if (words1.has(w)) matches++;
  }
  return matches / Math.max(words2.size, 1);
}

function findClosestReview(quote, reviews) {
  const quoteLower = quote.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const r of reviews) {
    const score = fuzzyMatch(r.text.toLowerCase(), quoteLower);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
