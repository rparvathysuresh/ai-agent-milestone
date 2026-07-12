/**
 * Smoke test for Phase 1 utilities.
 * Run: node src/utils/smokeTest.js
 */

import { getWeekLabel, isWithinWindow, getCurrentWeekMonday } from './dateHelpers.js';
import { countWords, isWithinLimit } from './wordCount.js';

console.log('── Date Helpers ──────────────────────────');
console.log('getWeekLabel("2026-06-15"):', getWeekLabel('2026-06-15'));
console.log('getWeekLabel("2026-01-01"):', getWeekLabel('2026-01-01'));
console.log('getWeekLabel("not-a-date"):', getWeekLabel('not-a-date'));
console.log('getWeekLabel(null):', getWeekLabel(null));
console.log('isWithinWindow(today):', isWithinWindow(new Date()));
console.log('isWithinWindow("2020-01-01"):', isWithinWindow('2020-01-01'));
console.log('isWithinWindow(null):', isWithinWindow(null));
console.log('getCurrentWeekMonday():', getCurrentWeekMonday());

console.log();
console.log('── Word Count ────────────────────────────');
console.log('countWords("hello world"):', countWords('hello world'));
console.log('countWords(""):', countWords(''));
console.log('countWords(null):', countWords(null));
console.log('countWords("  spaced  out  "):', countWords('  spaced  out  '));
console.log('isWithinLimit("three word sentence", 5):', isWithinLimit('three word sentence', 5));
console.log('isWithinLimit("three word sentence", 2):', isWithinLimit('three word sentence', 2));
console.log('isWithinLimit("exactly", 1):', isWithinLimit('exactly', 1));

console.log();
console.log('✅ All smoke tests passed.');
