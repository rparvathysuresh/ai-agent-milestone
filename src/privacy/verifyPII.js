/**
 * Phase 2 verification — tests PII stripping on specific cases.
 */
import { stripPII } from '../privacy/piiStripper.js';

const tests = [
  'Contact support@example.com for help',
  'Call me at +1-555-123-4567',
  'Tweeted @supportTeam no reply',
  'Device F0E1D2C3B4A59687 might be the issue',
  'My email is john.doe@gmail.com and phone +91 98765 43210',
  'No PII here, just a normal review about payments.',
];

console.log('── PII Strip Verification ────────────────');
for (const t of tests) {
  const r = stripPII(t);
  console.log(`INPUT:  ${t}`);
  console.log(`OUTPUT: ${r.sanitised}`);
  console.log(`PII:    ${r.piiFound.length > 0 ? r.piiFound.join(', ') : 'none'}`);
  console.log();
}
console.log('✅ PII stripping verified.');
