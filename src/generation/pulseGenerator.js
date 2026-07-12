/**
 * Pulse Generator — Produces the weekly ≤250-word pulse document.
 *
 * Takes the ThemeMap from Phase 3, selects the top 3 themes,
 * generates a structured markdown pulse via Groq, validates word count,
 * and runs a final PII safety check.
 *
 * @module generation/pulseGenerator
 */

import Groq from 'groq-sdk';
import { getCurrentWeekMonday } from '../utils/dateHelpers.js';
import { countWords, isWithinLimit } from '../utils/wordCount.js';
import { stripPII } from '../privacy/piiStripper.js';

const MAX_RETRIES = 3;
const WORD_LIMIT = 250;
const TOP_THEMES = 3;

/**
 * Generates a weekly pulse markdown document from the ThemeMap.
 *
 * @param {object}   themeMap - ThemeMap from Phase 3 (themes, competitorMentions, etc.)
 * @param {string}   apiKey   - Groq API key.
 * @param {string}   model    - Groq model identifier.
 * @returns {Promise<{ pulse: string, wordCount: number, warnings: string[] }>}
 */
export async function generatePulse(themeMap, apiKey, model) {
  const warnings = [];

  // ── 4.1: Select top 3 themes by reviewCount ───────────────
  const sortedThemes = [...themeMap.themes]
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, TOP_THEMES);

  if (sortedThemes.length < TOP_THEMES) {
    warnings.push(`Only ${sortedThemes.length} themes available (expected ${TOP_THEMES})`);
  }

  // ── 4.2: Generate pulse via LLM ───────────────────────────
  if (!apiKey) {
    // Fallback: generate pulse locally without LLM
    warnings.push('GROQ_API_KEY not set — generating pulse locally (no LLM polish)');
    const pulse = buildLocalPulse(sortedThemes);
    return { pulse, wordCount: countWords(pulse), warnings };
  }

  const groq = new Groq({ apiKey });

  const weekLabel = getCurrentWeekMonday();
  const systemPrompt = buildPulseSystemPrompt(weekLabel);
  const userPrompt = buildPulseUserPrompt(sortedThemes, themeMap);

  let pulse = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tighterInstruction = attempt > 1
        ? `\n\nIMPORTANT: Your previous attempt was ${attempt > 2 ? 'still ' : ''}too long. Be MORE concise. Use shorter sentences. Target 200 words maximum.`
        : '';

      const result = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `${systemPrompt}${tighterInstruction}` },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2048,
      });

      const responseText = (result.choices[0]?.message?.content || '').trim();

      // Clean up potential markdown code block wrappers
      pulse = responseText
        .replace(/^```(?:markdown)?\s*\n?/, '')
        .replace(/\n?\s*```$/, '')
        .trim();

      // ── 4.3: Enforce word limit ─────────────────────────────
      const wc = countWords(pulse);
      if (wc > WORD_LIMIT) {
        warnings.push(`Attempt ${attempt}: pulse was ${wc} words (limit: ${WORD_LIMIT})`);
        if (attempt < MAX_RETRIES) continue; // Retry with tighter prompt
        // On last attempt, truncate gracefully
        pulse = truncateToWordLimit(pulse, WORD_LIMIT);
        warnings.push(`Truncated pulse to ${WORD_LIMIT} words on final attempt`);
      }

      break; // Success

    } catch (err) {
      lastError = err;
      warnings.push(`Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  if (!pulse) {
    // Fallback to local generation if LLM fails
    warnings.push(`LLM pulse generation failed after ${MAX_RETRIES} attempts, using local template`);
    pulse = buildLocalPulse(sortedThemes);
  }

  // ── 4.5: Final PII safety check ───────────────────────────
  const piiResult = stripPII(pulse);
  if (piiResult.piiFound.length > 0) {
    warnings.push(`PII found in generated pulse: ${piiResult.piiFound.join(', ')} — redacted`);
    pulse = piiResult.sanitised;
  }

  const wordCount = countWords(pulse);
  return { pulse, wordCount, warnings };
}

// ── Prompt Builders ─────────────────────────────────────────

function buildPulseSystemPrompt(weekLabel) {
  return `You are a product communications writer at a fintech company.
Your task is to produce a concise, stakeholder-ready "Weekly App Review Pulse" document.

FORMAT (use this exact markdown structure):

# Weekly App Review Pulse — Week of ${weekLabel}

## Top Themes
1. **{Theme Label}** — {one-liner description}
2. **{Theme Label}** — {one-liner description}
3. **{Theme Label}** — {one-liner description}

## What Users Are Saying
> "{verbatim quote 1}" — Play Store, ★{rating}
> "{verbatim quote 2}" — Play Store, ★{rating}
> "{verbatim quote 3}" — Play Store, ★{rating}

## Recommended Actions
1. {Actionable recommendation grounded in Theme 1}
2. {Actionable recommendation grounded in Theme 2}
3. {Actionable recommendation grounded in Theme 3}

RULES:
- MUST be ≤ 250 words total.
- MUST include EXACTLY 3 themes, 3 quotes, and 3 actions.
- Quotes MUST be copied VERBATIM from the provided data — do NOT rephrase them.
- Actions must be specific, actionable, and grounded in the corresponding theme.
- Tone: professional, concise, scannable.
- Do NOT include any personally identifiable information.`;
}

function buildPulseUserPrompt(topThemes, themeMap) {
  let prompt = `Generate the Weekly App Review Pulse from these themes:\n\n`;

  prompt += `Overall sentiment: ${themeMap.overallSentiment}\n`;
  prompt += `Total reviews analysed: ${themeMap.totalReviewsAnalysed}\n`;
  if (themeMap.competitorMentions?.length > 0) {
    prompt += `Competitors mentioned: ${themeMap.competitorMentions.join(', ')}\n`;
  }
  prompt += '\n---\n\n';

  for (let i = 0; i < topThemes.length; i++) {
    const t = topThemes[i];
    prompt += `THEME ${i + 1}: "${t.label}"\n`;
    prompt += `Sentiment: ${t.sentiment}\n`;
    prompt += `Urgency: ${t.urgency}\n`;
    prompt += `Description: ${t.description}\n`;
    prompt += `Review Count: ${t.reviewCount}\n`;
    prompt += `Action Insight: ${t.actionInsight}\n`;
    prompt += `Representative Quotes:\n`;
    for (const q of t.representativeQuotes) {
      prompt += `  - "${q}"\n`;
    }
    prompt += '\n';
  }

  prompt += `Now generate the pulse document. Keep it under 250 words.`;
  return prompt;
}

// ── Local Fallback ──────────────────────────────────────────

/**
 * Builds a pulse using a local template (no LLM needed).
 * Used as fallback when the LLM is unavailable.
 */
function buildLocalPulse(themes) {
  const weekLabel = getCurrentWeekMonday();
  let md = `# Weekly App Review Pulse — Week of ${weekLabel}\n\n`;

  md += `## Top Themes\n`;
  for (let i = 0; i < themes.length; i++) {
    md += `${i + 1}. **${themes[i].label}** — ${themes[i].description}\n`;
  }
  md += '\n';

  md += `## What Users Are Saying\n`;
  for (const t of themes) {
    if (t.representativeQuotes.length > 0) {
      const q = t.representativeQuotes[0];
      md += `> "${q}" — Play Store\n`;
    }
  }
  md += '\n';

  md += `## Recommended Actions\n`;
  for (let i = 0; i < themes.length; i++) {
    const action = themes[i].actionInsight || `Address "${themes[i].label}" based on user feedback.`;
    md += `${i + 1}. ${action}\n`;
  }

  return md;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Truncates markdown text to a word limit, preserving complete lines.
 */
function truncateToWordLimit(text, limit) {
  const lines = text.split('\n');
  const result = [];
  let totalWords = 0;

  for (const line of lines) {
    const lineWords = countWords(line);
    if (totalWords + lineWords > limit && result.length > 0) {
      break;
    }
    result.push(line);
    totalWords += lineWords;
  }

  return result.join('\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
