// Credit-policy rules from the team's notes (FOIR, internal score, pricing). Product-specific checks live in the
// Loan Eligibility Check Configuration (configStore.js).
// Controlled policy configuration. Only the rules engine reads this; the AI never sees or changes it.
// Thresholds marked (notes) come from the team's case notes; the rest are illustrative for the prototype.
export const POLICY = {
  version: 'PL-BRE 2026.09',
  cb: { autoPass: 750, pass: 650, deviation: 500 }, // (notes) >750 auto-pass, 650–750 pass, 500–650 deviation, <500 fail
  foir: { pass: 40, fail: 50 },                      // (notes) <40 pass, 40–50 deviation, >50 fail
  internalMinPct: 50,                                // (notes) internal score below 50% fails
  enquiries: { pass: 3, review: 6 },
  dpd: { review: 30 },
  bounces: { review: 2 },
  incomeVariance: 1.25,
  minNetIncome: 15000,
  age: { min: 21, max: 60, maturityMax: 65 },
  rates: { auto: 13.5, pass: 15.5, deviation: 19, fail: 22 },
  rangeFloor: 0.8,
};

export const PURPOSES = ['Home renovation', 'Education', 'Medical expenses', 'Wedding', 'Debt consolidation', 'Working capital', 'Equipment purchase', 'Other'];
export const BANKS = ['State Bank of India', 'Indian Bank', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Canara Bank', 'Other'];

export const STEPS = [
  ['Applicant details', 'Individual / Business, KYC, loan'],
  ['Bank statement', 'Account Aggregator or PDF'],
  ['Financial details', 'Income, expenses, stability'],
  ['Decision', 'Rules engine + AI remarks'],
];
