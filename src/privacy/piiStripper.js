/**
 * PII Stripper
 *
 * Removes personally identifiable information from review text fields
 * using regex-based pattern matching. Applied before any LLM processing.
 *
 * Patterns handled:
 *   - Email addresses  → [email]
 *   - Phone numbers    → [phone]
 *   - @usernames       → [user]
 *   - Device IDs (hex) → [device]
 *
 * @module privacy/piiStripper
 */

// ── PII Regex Patterns ──────────────────────────────────────

const PII_PATTERNS = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[email]',
  },
  {
    name: 'phone',
    // Matches international and domestic phone numbers:
    // +1-555-123-4567, +91 98765 43210, +44 20 7946 0958, (555) 123-4567
    regex: /(\+?\d{1,3}[\-.\s]?)?(\(?\d{2,5}\)?[\-.\s]?)?\d{3,5}[\-.\s]?\d{4,5}/g,
    replacement: '[phone]',
  },
  {
    name: 'username',
    // @handles — at least 2 chars after @
    regex: /@[a-zA-Z0-9_]{2,}/g,
    replacement: '[user]',
  },
  {
    name: 'device_id',
    // Hex strings of 8+ characters (device IDs, reference numbers, etc.)
    regex: /\b[A-Fa-f0-9]{8,}\b/g,
    replacement: '[device]',
  },
];

/**
 * Strips PII from a single text string.
 *
 * @param {string} text - The text to sanitise.
 * @returns {{ sanitised: string, piiFound: string[] }}
 *          sanitised: the cleaned text
 *          piiFound:  array of PII type names that were matched (e.g. ["email", "phone"])
 */
export function stripPII(text) {
  if (!text || typeof text !== 'string') {
    return { sanitised: text || '', piiFound: [] };
  }

  let result = text;
  const piiFound = [];

  for (const pattern of PII_PATTERNS) {
    // Reset regex lastIndex (since we use /g flag)
    pattern.regex.lastIndex = 0;

    if (pattern.regex.test(result)) {
      piiFound.push(pattern.name);
      // Reset again before replace
      pattern.regex.lastIndex = 0;
      result = result.replace(pattern.regex, pattern.replacement);
    }
  }

  return { sanitised: result, piiFound };
}

/**
 * Strips PII from all reviews in an array.
 * Modifies the `title` and `text` fields in-place and returns stats.
 *
 * @param {object[]} reviews - Array of Review objects.
 * @returns {{ totalPiiHits: number, reviewsAffected: number, fullyRedacted: number, details: Record<string, number> }}
 */
export function stripPIIFromReviews(reviews) {
  const stats = {
    totalPiiHits: 0,
    reviewsAffected: 0,
    fullyRedacted: 0,
    details: {},
  };

  const toRemove = [];

  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i];
    let reviewHadPii = false;

    // Strip from title
    const titleResult = stripPII(review.title);
    review.title = titleResult.sanitised;
    if (titleResult.piiFound.length > 0) {
      reviewHadPii = true;
      for (const type of titleResult.piiFound) {
        stats.details[type] = (stats.details[type] || 0) + 1;
        stats.totalPiiHits++;
      }
    }

    // Strip from text
    const textResult = stripPII(review.text);
    review.text = textResult.sanitised;
    if (textResult.piiFound.length > 0) {
      reviewHadPii = true;
      for (const type of textResult.piiFound) {
        stats.details[type] = (stats.details[type] || 0) + 1;
        stats.totalPiiHits++;
      }
    }

    if (reviewHadPii) {
      stats.reviewsAffected++;
    }

    // Check if review is fully redacted (only replacement tokens + whitespace remain)
    const strippedText = review.text
      .replace(/\[(email|phone|user|device)\]/g, '')
      .trim();

    if (!strippedText) {
      stats.fullyRedacted++;
      toRemove.push(i);
    }
  }

  // Remove fully redacted reviews (iterate in reverse to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    reviews.splice(toRemove[i], 1);
  }

  return stats;
}
