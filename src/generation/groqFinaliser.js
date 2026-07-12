/**
 * Groq Finaliser — Polishes the raw pulse into final stakeholder-ready outputs.
 *
 * Uses Groq LLM to generate a final report and a concise email body,
 * validating word counts and ensuring verbatim quotes are preserved.
 *
 * @module generation/groqFinaliser
 */

import Groq from 'groq-sdk';
import { countWords } from '../utils/wordCount.js';
import { stripPII } from '../privacy/piiStripper.js';

const MAX_RETRIES = 3;
const REPORT_WORD_LIMIT = 250;
const EMAIL_WORD_LIMIT = 150;

/**
 * Finalises the raw pulse into a polished report and email body.
 *
 * @param {string} rawPulse - The raw markdown pulse from Phase 4.
 * @param {string[]} originalQuotes - Array of quotes that must be preserved.
 * @param {string} apiKey - Groq API key.
 * @param {string} model - Groq model identifier.
 * @returns {Promise<{ finalReport: string, emailBody: string, warnings: string[] }>}
 */
export async function finalisePulse(rawPulse, originalQuotes, apiKey, model) {
  const warnings = [];

  if (!apiKey) {
    warnings.push('GROQ_API_KEY not set — using raw pulse as fallback');
    return getFallbackOutput(rawPulse, warnings);
  }

  const groq = new Groq({ apiKey });

  // 1. Generate Final Report
  const finalReport = await generateWithRetry(
    groq,
    model,
    buildReportPrompt(rawPulse),
    REPORT_WORD_LIMIT,
    originalQuotes,
    warnings,
    'Report'
  );

  // 2. Generate Email Body
  const emailBody = await generateWithRetry(
    groq,
    model,
    buildEmailPrompt(rawPulse),
    EMAIL_WORD_LIMIT,
    [], // Email might not have all quotes, don't strictly enforce quote preservation here if they drop it for brevity
    warnings,
    'Email'
  );

  if (!finalReport && !emailBody) {
    warnings.push('Both Groq generations failed. Using fallback.');
    return getFallbackOutput(rawPulse, warnings);
  }

  return {
    finalReport: finalReport || rawPulse,
    emailBody: emailBody || `Hi team,\n\nHere is this week's app review pulse:\n\n{docUrl}\n\nBest,\nAutomated Pulse`,
    warnings
  };
}

/**
 * Helper to call Groq with retry logic and validation.
 */
async function generateWithRetry(groq, model, prompt, wordLimit, requiredQuotes, warnings, context) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tighterInstruction = attempt > 1
        ? `\n\nIMPORTANT: Your previous attempt was too long. Be MORE concise. Target ${Math.floor(wordLimit * 0.8)} words maximum.`
        : '';

      const result = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: prompt.system + tighterInstruction },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      });

      let content = (result.choices[0]?.message?.content || '').trim();

      // Enforce Word Limit
      const wc = countWords(content);
      if (wc > wordLimit) {
        if (attempt < MAX_RETRIES) {
          warnings.push(`${context} attempt ${attempt} exceeded word limit (${wc} > ${wordLimit}). Retrying...`);
          await sleep(2000);
          continue;
        } else {
          warnings.push(`${context} exceeded word limit after all retries. Truncating.`);
          content = truncateToWordLimit(content, wordLimit);
        }
      }

      // Validate Quotes (only for report)
      let quotesValid = true;
      for (const quote of requiredQuotes) {
        if (!content.includes(quote)) {
          quotesValid = false;
          warnings.push(`${context} attempt ${attempt} failed to preserve exact quote: "${quote.substring(0, 30)}..."`);
          break;
        }
      }

      if (!quotesValid && attempt < MAX_RETRIES) {
         await sleep(2000);
         continue;
      } else if (!quotesValid) {
         warnings.push(`${context} failed to preserve all quotes after all retries.`);
         // We'll still return it, but warning is logged
      }

      // PII Check
      const piiResult = stripPII(content);
      if (piiResult.piiFound.length > 0) {
        warnings.push(`PII found in ${context} generation: ${piiResult.piiFound.join(', ')} — redacted`);
        content = piiResult.sanitised;
      }

      return content;

    } catch (err) {
      warnings.push(`${context} attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(2000);
    }
  }
  return null;
}

// ── Prompts ──────────────────────────────────────────────────

function buildReportPrompt(rawPulse) {
  return {
    system: `You are a professional report writer. Given a raw weekly app review
pulse in markdown, rewrite it into a polished, stakeholder-ready report.

Rules:
- Keep it under ${REPORT_WORD_LIMIT} words.
- Preserve ALL verbatim user quotes exactly as provided — do not rephrase them in any way.
- Improve readability, tone, and structure.
- Do not add information that is not in the source.
- Do not include any personally identifiable information (PII).`,
    user: rawPulse
  };
}

function buildEmailPrompt(rawPulse) {
  return {
    system: `You are writing a brief email to a product team. Summarise the weekly
app review pulse in a scannable, action-oriented email body.

Rules:
- Keep it under ${EMAIL_WORD_LIMIT} words.
- Include a placeholder {docUrl} exactly as written, where the link to the full report should go.
- Highlight the top themes and key action items.
- Tone: friendly-professional.
- Do not include any personally identifiable information (PII).`,
    user: rawPulse
  };
}

// ── Helpers ──────────────────────────────────────────────────

function getFallbackOutput(rawPulse, warnings) {
  warnings.push('Returning raw pulse as fallback report.');
  return {
    finalReport: rawPulse,
    emailBody: `Hi team,\n\nHere is this week's app review pulse:\n\n{docUrl}\n\nBest,\nAutomated Pulse`,
    warnings
  };
}

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
