/**
 * Smoke test for Phase 4 — tests pulse generation with mock ThemeMap.
 * Run: node src/generation/testPulse.js
 */
import { generatePulse } from './pulseGenerator.js';

const mockThemeMap = {
  themes: [
    {
      label: 'High Brokerage Charges',
      sentiment: 'negative',
      urgency: 'critical',
      description: 'Users complain about high brokerage fees on F&O trades.',
      reviewCount: 15,
      representativeQuotes: [
        'high brokerage fees....more than half the profit we make...ridiculous',
        'This app have high charges and when you try to talk to agent you will get no response',
        'TOO MUCH HIDDEN SCAMS!! For mutual fund investment only few direct plans are available',
      ],
      actionInsight: 'Benchmark brokerage against Zerodha and consider a tiered pricing model.',
    },
    {
      label: 'App Stability Issues',
      sentiment: 'negative',
      urgency: 'high',
      description: 'Users report crashes, lags, and page load failures during market hours.',
      reviewCount: 10,
      representativeQuotes: [
        'very bad experience on many occasions. lags, and very slow in time',
        'Last few months this app is unusable. every time page fail to load',
        'unable to login. the web interface is good, app stopped working',
      ],
      actionInsight: 'Prioritise load testing during market open/close hours.',
    },
    {
      label: 'User-Friendly Interface',
      sentiment: 'positive',
      urgency: 'low',
      description: 'Users praise the clean, intuitive UI and easy navigation.',
      reviewCount: 20,
      representativeQuotes: [
        'Application so Easy to use, interface is Good, All Details clean and proceed smooth',
        'very user friendly & gives all informative technical data to analyze investments',
        'nice application good features easy to use and fast more option than other app',
      ],
      actionInsight: 'Continue investing in UI polish as a competitive differentiator.',
    },
  ],
  competitorMentions: ['Zerodha', 'IndMoney'],
  overallSentiment: 'mixed',
  totalReviewsAnalysed: 63,
};

// Test with local fallback (no API key)
console.log('── Testing Pulse Generation (local fallback) ──');
const result = await generatePulse(mockThemeMap, null, null);

console.log(`Word count: ${result.wordCount}`);
console.log(`Warnings: ${result.warnings.length > 0 ? result.warnings.join(', ') : 'none'}`);
console.log();
console.log('── Generated Pulse ──');
console.log(result.pulse);
console.log();
console.log('✅ Phase 4 smoke test passed.');
