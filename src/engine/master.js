// Master data shared by the admin console and the RM app. One source of truth for every dropdown.

export const APPLICANT_TYPES = ['Individual', 'Business'];
export const CUSTOMER_TYPES = ['New', 'Existing'];

// Loan type is a property of the product, so it is never captured separately.
export const PRODUCTS = [
  { id: 'Personal Loan', loanType: 'Unsecured', types: ['Individual'], min: 50000, max: 2500000, tmin: 12, tmax: 60 },
  { id: 'Business Loan', loanType: 'Unsecured', types: ['Business'], min: 100000, max: 5000000, tmin: 12, tmax: 60 },
  { id: 'Business Enhancement Loan', loanType: 'Unsecured', types: ['Individual', 'Business'], min: 100000, max: 2500000, tmin: 12, tmax: 60 },
  { id: 'Enterprise Loan Monthly', loanType: 'Secured', types: ['Individual', 'Business'], min: 100000, max: 5000000, tmin: 12, tmax: 84 },
  { id: 'MSME Term Loan', loanType: 'Secured', types: ['Business'], min: 200000, max: 10000000, tmin: 12, tmax: 120 },
];
export const productById = (id) => PRODUCTS.find((p) => p.id === id);

export const PURPOSES = ['Home renovation', 'Education', 'Medical expenses', 'Wedding', 'Debt consolidation', 'Working capital', 'Business expansion', 'Equipment purchase', 'Other'];

export const BUREAUS = [
  { key: 'cibil', label: 'CIBIL', thirdLabel: 'Max CMR rank allowed', third: 'maxCmrRank' },
  { key: 'equifax', label: 'Equifax', thirdLabel: 'Min business credit score', third: 'businessMin' },
  { key: 'highmark', label: 'CRIF High Mark', thirdLabel: 'Min business credit score', third: 'businessMin' },
  { key: 'experian', label: 'Experian', thirdLabel: 'Min business credit score', third: 'businessMin' },
];

// Bureau report & questionnaire parameters, merged into one list (no duplicates).
export const CB_PARAMS = [
  { key: 'overdue', label: 'Overdue accounts', unit: 'count' },
  { key: 'dpd', label: 'Current days past due (DPD)', unit: 'days' },
  { key: 'enquiries90', label: 'Credit enquiries · last 90 days', unit: 'count' },
  { key: 'inquiries6m', label: 'Credit enquiries · last 6 months', unit: 'count' },
  { key: 'activeLoans', label: 'Number of active loans', unit: 'count' },
  { key: 'newAccounts6m', label: 'New accounts · last 6 months', unit: 'count' },
  { key: 'newDelinquent6m', label: 'New delinquent accounts · last 6 months', unit: 'count' },
  { key: 'writtenOffAccounts', label: 'Written-off accounts', unit: 'count' },
  { key: 'settledAccounts', label: 'Settled accounts', unit: 'count' },
  { key: 'writtenOffAmount', label: 'Written-off amount', unit: 'inr' },
  { key: 'settledAmount', label: 'Settled amount', unit: 'inr' },
  { key: 'totalObligations', label: 'Total monthly obligations (EMIs)', unit: 'inr' },
  { key: 'totalCurrentBalance', label: 'Total current balance', unit: 'inr' },
];
export const ASSET_CLASSES = ['SMA', 'Sub Standard', 'Doubtful (DBT)', 'Loss'];
export const NEGATIVE_STATUSES = ['Suit Filed', 'Wilful Defaulter'];

export const LOAN_BANDS = [
  { key: 'all', label: 'All loan amounts' },
  { key: 'upto5', label: 'Up to ₹5,00,000', test: (a) => a <= 500000 },
  { key: '5to10', label: '₹5,00,000 – ₹10,00,000', test: (a) => a > 500000 && a <= 1000000 },
  { key: 'above10', label: 'Above ₹10,00,000', test: (a) => a > 1000000 },
];
export const bandApplies = (band, amount) => band === 'all' || !!LOAN_BANDS.find((b) => b.key === band)?.test?.(amount);

// Stability bands (case notes): >5 years = 5, 3–5 = 4, 1–3 = 3, <1 = 0
export const STABILITY_BANDS = [
  { key: 'lt1', label: 'Less than 1 year', years: 0, pts: 0 },
  { key: '1to3', label: '1–3 years', years: 1, pts: 3 },
  { key: '3to5', label: '3–5 years', years: 3, pts: 4 },
  { key: 'gt5', label: 'More than 5 years', years: 5, pts: 5 },
];
export const bandInfo = (k) => STABILITY_BANDS.find((b) => b.key === k);
export const yearsToBand = (y) => (y == null || isNaN(y) ? '' : y > 5 ? 'gt5' : y >= 3 ? '3to5' : y >= 1 ? '1to3' : 'lt1');

export const HOUSE_TYPES = ['Owned', 'Rented', 'Family owned', 'Company provided'];
export const PREMISES = ['Owned', 'Rented', 'Leased'];
export const YES_NO = ['Yes', 'No'];
export const INDUSTRIES = ['Textiles & Apparel', 'Wholesale & Retail Trade', 'Food Processing', 'Manufacturing', 'Services', 'Transport & Logistics', 'Construction', 'Agriculture & Allied', 'Healthcare', 'Other'];
export const ACCOUNT_AGGREGATORS = ['Ignosis', 'Finvu', 'OneMoney', 'CAMS Finserv', 'Anumati'];

export const ITR_HEADS = [
  { key: 'salary', label: 'Income from salary' },
  { key: 'business', label: 'Income from business / profession' },
  { key: 'house', label: 'Income from house property (rent)' },
  { key: 'capital', label: 'Capital gains' },
  { key: 'other', label: 'Income from other sources' },
];
export const EXPENSE_HEADS = [
  { key: 'food', label: 'Food' },
  { key: 'medical', label: 'Medical' },
  { key: 'insurance', label: 'Insurance premium' },
  { key: 'education', label: "Children's education" },
  { key: 'rent', label: 'Rent / house maintenance' },
  { key: 'otherExp', label: 'Other expenses' },
];

// Fields a custom global rule can test. "cat" decides which result box the rule appears in.
export const RULE_FIELDS = [
  { key: 'foir', label: 'FOIR (%)', cat: 'Obligations' },
  { key: 'internalScore', label: 'Internal stability score (%)', cat: 'Customer' },
  { key: 'netIncome', label: 'Net monthly income (₹)', cat: 'Income' },
  { key: 'cbScore', label: 'Lowest bureau score', cat: 'Bureau' },
  { key: 'resYears', label: 'Residential stability (years)', cat: 'Customer' },
  { key: 'workYears', label: 'Work experience (years)', cat: 'Customer' },
  { key: 'companyYears', label: 'Current company stability (years)', cat: 'Customer' },
  { key: 'loanAmount', label: 'Loan amount (₹)', cat: 'Obligations' },
];
export const RULE_OPS = [
  { key: 'gte', label: '≥', test: (a, b) => a >= b },
  { key: 'gt', label: '>', test: (a, b) => a > b },
  { key: 'lte', label: '≤', test: (a, b) => a <= b },
  { key: 'lt', label: '<', test: (a, b) => a < b },
  { key: 'eq', label: '=', test: (a, b) => a === b },
];

export const STATE_CODES = { '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UK', '06': 'HR', '07': 'DL', '08': 'RJ', '09': 'UP', '10': 'BR', '18': 'AS', '19': 'WB', '20': 'JH', '21': 'OD', '22': 'CG', '23': 'MP', '24': 'GJ', '27': 'MH', '29': 'KA', '30': 'GA', '32': 'KL', '33': 'TN', '34': 'PY', '36': 'TS', '37': 'AP' };

// PIN code → city/state for auto-fill (the RM can still edit).
const PIN_CITY = { '560': ['Bengaluru', 'Karnataka'], '600': ['Chennai', 'Tamil Nadu'], '625': ['Madurai', 'Tamil Nadu'], '641': ['Coimbatore', 'Tamil Nadu'], '400': ['Mumbai', 'Maharashtra'], '411': ['Pune', 'Maharashtra'], '110': ['New Delhi', 'Delhi'], '500': ['Hyderabad', 'Telangana'], '700': ['Kolkata', 'West Bengal'], '380': ['Ahmedabad', 'Gujarat'], '682': ['Kochi', 'Kerala'], '302': ['Jaipur', 'Rajasthan'] };
const PIN_STATE = [[11, 11, 'Delhi'], [30, 34, 'Rajasthan'], [36, 39, 'Gujarat'], [40, 44, 'Maharashtra'], [50, 50, 'Telangana'], [51, 53, 'Andhra Pradesh'], [56, 59, 'Karnataka'], [60, 64, 'Tamil Nadu'], [67, 69, 'Kerala'], [70, 74, 'West Bengal'], [75, 77, 'Odisha'], [80, 85, 'Bihar'], [20, 28, 'Uttar Pradesh']];
export function pinLookup(pin) {
  if (!/^[1-9]\d{5}$/.test(pin || '')) return null;
  const c = PIN_CITY[pin.slice(0, 3)];
  if (c) return { city: c[0], state: c[1] };
  const two = Number(pin.slice(0, 2));
  const st = PIN_STATE.find(([a, b]) => two >= a && two <= b);
  return st ? { city: '', state: st[2] } : null;
}
