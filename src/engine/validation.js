// Field validation for the RM application. Checks that data is correct; policy (pass/fail) is the rules engine's job.
import { money, num, parseDate, ageOn, inr, TODAY } from './format.js';
import { verhoeffValid, gstinValid } from './finance.js';
import { PRODUCTS, productById, STATE_CODES } from './master.js';
import { findConfig } from './configStore.js';

const PAN_TYPES = { C: 'company', H: 'HUF', F: 'firm / LLP', A: 'association of persons', T: 'trust', B: 'body of individuals', L: 'local authority', J: 'artificial juridical person', G: 'government', P: 'individual / proprietor' };
export const productOf = (d) => productById(d.productId) || PRODUCTS[0];
export const ageOf = (d) => ageOn(d.dob);
export const isBusiness = (d) => d.applicantType === 'Business';
export const configOf = (d) => (d.applicantType && d.customerType && d.productId ? findConfig(d) : null);
export const vintageOf = (d) => (/^\d{4}$/.test(d.startYear || '') ? Math.max(0, TODAY.getFullYear() - Number(d.startYear)) : null);

export function nameMatch(d) {
  const ch = (d.pan || '')[4];
  if (isBusiness(d)) {
    const bn = (d.businessName || '').replace(/^(m\/s\.?|messrs\.?)\s+/i, '').trim();
    const sur = (d.fullName || '').trim().split(/\s+/).pop() || '';
    const ok = !!ch && (bn[0]?.toUpperCase() === ch || sur[0]?.toUpperCase() === ch);
    return { ok, sur: bn || sur, ch };
  }
  const parts = (d.fullName || '').trim().split(/\s+/);
  const sur = parts[parts.length - 1] || '';
  return { ok: !!sur && sur[0].toUpperCase() === ch, sur, ch };
}

const moneyCheck = (v, required, msg, max = 1e10) => { const n = money(v); if (n == null) return required ? msg || 'Enter an amount.' : ''; if (n > max) return 'That amount looks too large. Check the value.'; return ''; };
const nameRx = /^[A-Za-z][A-Za-z .'-]*[A-Za-z.]$/;

export const VAL = {
  applicantType: (v) => (v ? '' : 'Choose Individual or Business.'),
  customerType: (v) => (v ? '' : 'Choose new or existing customer.'),
  productId(v, d) {
    if (!v) return 'Choose the product.';
    const p = productById(v);
    if (p && d.applicantType && !p.types.includes(d.applicantType)) return `${p.id} is not offered to ${d.applicantType.toLowerCase()} applicants.`;
    return '';
  },
  configMatch(_, d) {
    if (!d.applicantType || !d.customerType || !d.productId) return '';
    return configOf(d) ? '' : `No published eligibility configuration covers ${d.applicantType} · ${d.customerType} · ${d.productId}. Ask the admin to publish one.`;
  },
  purpose: (v) => (v ? '' : 'Choose the loan purpose.'),
  amount(v, d) {
    const p = productOf(d); const n = money(v);
    if (n == null) return 'Enter the loan amount.';
    if (n < p.min || n > p.max) return `${p.id} amount must be between ${inr(p.min)} and ${inr(p.max)}.`;
    if (n % 1000) return 'Enter the amount in multiples of ₹1,000.';
    return '';
  },
  tenure(v, d) {
    const p = productOf(d);
    if (v === '' || v == null) return 'Enter the tenure in months.';
    const n = Number(v);
    if (!Number.isInteger(n)) return 'Tenure must be a whole number of months.';
    if (n < p.tmin || n > p.tmax) return `Tenure for ${p.id} is ${p.tmin}–${p.tmax} months.`;
    return '';
  },
  fullName(v, d) {
    v = (v || '').trim(); const who = isBusiness(d) ? "promoter's" : "applicant's";
    if (!v) return `Enter the ${who} full name.`;
    if (v.length < 3) return 'Name must have at least 3 letters.';
    if (!nameRx.test(v)) return 'Use letters, spaces, dots or hyphens only, as printed on the ID.';
    if (/\s{2,}/.test(v)) return 'Remove the extra spaces between words.';
    return '';
  },
  dob(v) {
    if (!v) return 'Enter the date of birth.';
    const dt = parseDate(v);
    if (!dt) return 'Enter a valid date.';
    if (dt > TODAY) return "Date of birth can't be in the future.";
    const a = ageOn(v);
    if (a < 18) return `Age is ${a}. Applicants must be at least 18.`;
    if (a > 100) return 'Check the date of birth.';
    return '';
  },
  idNumber(v, d) {
    if (isBusiness(d)) return '';
    v = (v || '').replace(/\s/g, '');
    if (d.idType === 'voter') {
      if (!v) return 'Enter the Voter ID (EPIC) number.';
      if (!/^[A-Z]{3}\d{7}$/.test(v)) return 'Voter ID is 3 letters followed by 7 digits, e.g. TNX4829173.';
      return '';
    }
    if (!v) return 'Enter the 12-digit Aadhaar number.';
    if (!/^\d+$/.test(v)) return 'Aadhaar has digits only.';
    if (v.length !== 12) return `Aadhaar has 12 digits. You entered ${v.length}.`;
    if (/^[01]/.test(v)) return 'Aadhaar numbers never start with 0 or 1.';
    if (!verhoeffValid(v)) return 'This Aadhaar number fails the checksum. Check for a mistyped digit.';
    return '';
  },
  pan(v, d) {
    v = (v || '').toUpperCase();
    if (!v) return 'Enter the PAN.';
    if (v.length !== 10) return `PAN has 10 characters. You entered ${v.length}.`;
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v)) return 'PAN format is 5 letters, 4 digits, 1 letter (e.g. ABCPK1234F).';
    if (!PAN_TYPES[v[3]]) return `The 4th character ${v[3]} isn't a valid PAN holder type.`;
    if (!isBusiness(d) && v[3] !== 'P') return `The 4th character is ${v[3]} (${PAN_TYPES[v[3]]}). An individual's PAN has P.`;
    return '';
  },
  businessName(v, d) {
    if (!isBusiness(d)) return '';
    v = (v || '').trim();
    if (!v) return 'Enter the business name.';
    if (v.length < 3 || !/^[A-Za-z0-9 .,&'()\-/]+$/.test(v)) return 'Use at least 3 letters, numbers and basic punctuation.';
    return '';
  },
  udyam(v, d) {
    if (!isBusiness(d)) return '';
    v = (v || '').toUpperCase();
    if (!v) return configOf(d)?.global.udyamRequired ? 'This product needs Udyam registration. Enter the Udyam number.' : '';
    if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(v)) return 'Udyam number format is UDYAM-XX-00-0000000.';
    return '';
  },
  gstin(v, d) {
    if (!isBusiness(d)) return '';
    v = (v || '').toUpperCase();
    if (!v) return configOf(d)?.tax.gstRequired ? 'This product needs a GST check. Enter the GSTIN.' : '';
    if (v.length !== 15) return `GSTIN has 15 characters. You entered ${v.length}.`;
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return 'GSTIN format: 2-digit state code, 10-character PAN, entity number, Z, check character.';
    if (!STATE_CODES[v.slice(0, 2)]) return `State code ${v.slice(0, 2)} isn't a valid GST state code.`;
    if (!gstinValid(v)) return 'This GSTIN fails the check-character test. Check for a typo.';
    if (d.pan && v.slice(2, 12) !== d.pan.toUpperCase()) return `GSTIN is linked to PAN ${v.slice(2, 12)}, not ${d.pan.toUpperCase()}.`;
    return '';
  },
  startYear(v, d) {
    if (!isBusiness(d)) return '';
    if (!v) return 'Enter the year the business started.';
    if (!/^\d{4}$/.test(v)) return 'Enter a 4-digit year.';
    const y = Number(v);
    if (y > TODAY.getFullYear()) return "Start year can't be in the future.";
    const dob = parseDate(d.dob);
    if (dob && y < dob.getFullYear() + 18) return `The promoter was under 18 in ${y}. Check the year.`;
    if (y < 1900) return 'Check the year.';
    return '';
  },
  pincode(v) {
    if (!v) return 'Enter the 6-digit PIN code.';
    if (!/^\d{6}$/.test(v)) return 'PIN code has 6 digits.';
    if (v[0] === '0') return "PIN codes don't start with 0.";
    return '';
  },
  address(v) { v = (v || '').trim(); if (!v) return 'Enter the address.'; if (v.length < 6) return 'Enter the full address (house number and street).'; return ''; },
  city(v) { v = (v || '').trim(); if (!v) return 'Enter the city.'; if (!/^[A-Za-z .'-]{2,}$/.test(v)) return 'Use letters only.'; return ''; },
  state(v) { v = (v || '').trim(); if (!v) return 'Enter the state.'; if (!/^[A-Za-z .'-]{2,}$/.test(v)) return 'Use letters only.'; return ''; },
  mobile(v) {
    v = v || '';
    if (!v) return 'Enter the mobile number.';
    if (!/^\d{10}$/.test(v)) return 'Mobile number has 10 digits.';
    if (!/^[6-9]/.test(v)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
    if (/^(\d)\1{9}$/.test(v)) return "This number doesn't look real.";
    return '';
  },
  email(v) {
    v = (v || '').trim();
    if (!v) return 'Enter the email address.';
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return 'Enter a valid email, e.g. name@example.com.';
    return '';
  },
  consent: (v) => (v ? '' : 'Customer consent is required before pulling bureau and bank data.'),

  // ---- financial details
  resBand: (v) => (v ? '' : 'Choose residential stability.'),
  workBand: (v) => (v ? '' : 'Choose working experience.'),
  companyBand: (v, d) => (isBusiness(d) || v ? '' : 'Choose current company stability.'),
  houseType: (v, d) => (isBusiness(d) || v ? '' : 'Choose house ownership.'),
  itrFiled: (v) => (v ? '' : 'Choose whether ITR is filed.'),
  incomeAny: (_, d) => (isBusiness(d) || ['salary', 'business', 'house', 'capital', 'other'].some((k) => num(d[k]) > 0) ? '' : 'Enter at least one income source.'),
  salary: (v) => moneyCheck(v, false, '', 1e8), business: (v) => moneyCheck(v, false, '', 1e8), house: (v) => moneyCheck(v, false, '', 1e8),
  capital: (v) => moneyCheck(v, false, '', 1e8), other: (v) => moneyCheck(v, false, '', 1e8), family: (v) => moneyCheck(v, false, '', 1e8),
  food: (v) => moneyCheck(v, false, '', 1e7), medical: (v) => moneyCheck(v, false, '', 1e7), insurance: (v) => moneyCheck(v, false, '', 1e7),
  education: (v) => moneyCheck(v, false, '', 1e7), rent: (v) => moneyCheck(v, false, '', 1e7), otherExp: (v) => moneyCheck(v, false, '', 1e7),
  industry: (v, d) => (!isBusiness(d) || v ? '' : 'Choose the type of industry.'),
  gstFiling: (v, d) => (!isBusiness(d) || v ? '' : 'Choose whether GST returns are filed.'),
  tradeLicense: (v, d) => (!isBusiness(d) || v ? '' : 'Choose whether the business has a trade license.'),
  premises: (v, d) => (!isBusiness(d) || v ? '' : 'Choose shop / factory ownership.'),
  turnover: (v, d) => (!isBusiness(d) ? '' : moneyCheck(v, true, 'Enter the annual turnover.')),
  totalIncome(v, d) {
    if (!isBusiness(d)) return '';
    const m = moneyCheck(v, true, 'Enter the total income.'); if (m) return m;
    if (money(d.turnover) != null && money(v) > money(d.turnover)) return "Total income can't be more than the annual turnover.";
    return '';
  },
  opex: (v, d) => (!isBusiness(d) ? '' : moneyCheck(v, true, 'Enter the total operating expenses.')),
  depreciation: (v, d) => (!isBusiness(d) ? '' : moneyCheck(v, false)),
  financeCost: (v, d) => (!isBusiness(d) ? '' : moneyCheck(v, false)),
  taxPaid: (v, d) => (!isBusiness(d) ? '' : moneyCheck(v, false)),
};

const COMMON0 = ['applicantType', 'customerType', 'productId', 'configMatch', 'amount', 'tenure', 'purpose', 'pincode', 'address', 'city', 'state', 'mobile', 'email', 'consent'];
export const stepFields = (n, d) => {
  if (n === 0) return isBusiness(d) ? ['businessName', 'pan', 'udyam', 'gstin', 'startYear', 'fullName', 'dob', ...COMMON0] : ['fullName', 'dob', 'idNumber', 'pan', ...COMMON0];
  if (n === 2) return isBusiness(d)
    ? ['industry', 'gstFiling', 'itrFiled', 'tradeLicense', 'premises', 'resBand', 'workBand', 'turnover', 'totalIncome', 'opex', 'depreciation', 'financeCost', 'taxPaid']
    : ['incomeAny', 'salary', 'business', 'house', 'capital', 'other', 'family', 'resBand', 'workBand', 'companyBand', 'houseType', 'itrFiled', 'food', 'medical', 'insurance', 'education', 'rent', 'otherExp'];
  return [];
};

export const LABELS = {
  applicantType: 'Applicant type', customerType: 'Customer type', productId: 'Product', configMatch: 'Configuration', amount: 'Loan amount', tenure: 'Tenure', purpose: 'Purpose',
  fullName: 'Name', dob: 'Date of birth', idNumber: 'KYC · Aadhaar / Voter ID', pan: 'PAN', businessName: 'Business name', udyam: 'Udyam', gstin: 'GST', startYear: 'Business start year',
  pincode: 'PIN', address: 'Address', city: 'City', state: 'State', mobile: 'Phone number', email: 'Email ID', consent: 'Consent',
  resBand: 'Residential stability', workBand: 'Working experience', companyBand: 'Current company stability', houseType: 'House owned', itrFiled: 'ITR filing', incomeAny: 'Income',
  salary: 'Salary', business: 'Business / profession', house: 'House property', capital: 'Capital gains', other: 'Other sources', family: 'Family income',
  food: 'Food', medical: 'Medical', insurance: 'Insurance premium', education: "Children's education", rent: 'Rent / house maintenance', otherExp: 'Other expenses',
  industry: 'Type of industry', gstFiling: 'GST filing', tradeLicense: 'Trade license', premises: 'Shop / factory ownership', turnover: 'Annual turnover', totalIncome: 'Total income', opex: 'Total operating expenses',
  depreciation: 'Depreciation', financeCost: 'Finance cost', taxPaid: 'Tax', bank: 'Bank statement',
};

export function fieldError(id, s) {
  let msg = VAL[id] ? VAL[id](s.d[id], s.d) : '';
  const biz = isBusiness(s.d);
  if (!msg && id === 'idNumber' && !biz && !s.v.id) msg = 'Verify this ID to continue.';
  if (!msg && id === 'pan' && !s.v.pan) msg = 'Verify the PAN to continue.';
  if (!msg && id === 'mobile' && !s.v.mobile) msg = 'Verify the phone number with OTP to continue.';
  if (!msg && id === 'udyam' && biz && s.d.udyam && !s.v.udyam) msg = 'Verify the Udyam number to continue.';
  if (!msg && id === 'gstin' && biz && s.d.gstin && !s.v.gstin) msg = 'Verify the GSTIN to continue.';
  return msg;
}
export function validateStep(n, s) {
  const errs = {};
  for (const id of stepFields(n, s.d)) { const m = fieldError(id, s); if (m) errs[id] = m; }
  if (n === 1 && !s.bank && !s.bankSkipped) errs.bank = 'Fetch the bank statement through the Account Aggregator, upload a statement, or choose Skip for now.';
  return errs;
}
