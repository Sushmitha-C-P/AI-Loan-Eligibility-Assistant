// Offline fallbacks so the demo never breaks: no key, no internet, rate limit or a guardrail rejection.
import { lakh, inr, joinList, num } from '../engine/format.js';
import { productById, bandInfo, BUREAUS } from '../engine/master.js';
import { vintageOf, ageOf } from '../engine/validation.js';

/* ---------------- Template AI remarks ---------------- */
const rank = (id) => {
  if (/^B0[1-4]$/.test(id)) return 0;
  if (id === 'O01') return 1;
  if (/^G/.test(id)) return 2;
  if (/^K0/.test(id)) return 3;
  if (id === 'B07' || id === 'B08' || /^P-/.test(id)) return 4;
  if (/^I0/.test(id)) return 5;
  if (/^C0[3-6]$/.test(id)) return 6;
  return 9;
};
const byPriority = (l) => l.slice().sort((x, y) => rank(x.id) - rank(y.id));
// [customer-friendly positive, customer-friendly concern]
const CUST_FIELD = {
  foir: ['low monthly commitments compared to your income', 'your monthly commitments are high compared to your income'],
  internalScore: ['a stable residence and work history', 'residence and work history are shorter than our policy asks for'],
  netIncome: ['a steady monthly income', 'monthly income after expenses is below our minimum'],
  cbScore: ['a good credit score', 'your credit score is below what this product needs'],
  resYears: ['a stable residence', 'you have lived at your address for a short time'],
  workYears: ['good work experience', 'work experience is shorter than this product needs'],
  companyYears: ['a stable job', 'time in your current job is shorter than this product needs'],
  loanAmount: [null, 'the amount is outside what this product allows'],
};
const CUST = {
  C02: [null, "the name doesn't match PAN records"],
  C03: [null, 'your age is outside the range for this product'],
  C04: ['a well-established business', "the business vintage doesn't meet this product's requirement"],
  C05: ['your MSME registration', 'MSME (Udyam) registration is needed for this product'],
  C06: [null, 'this product is not available at your location'],
  I01: ['your income tax filings', 'income tax returns are needed for this loan'],
  I02: ['your declared annual income', 'annual income is below the minimum for this product'],
  I03: ['good GST filing history', 'GST return filing needs to be more regular'],
  I04: ['healthy business margins', 'business margins are thin'],
  I05: ['healthy profits', 'profit after tax is low'],
  I06: ['income that matches your bank statements', 'the income declared is higher than what your bank statements show'],
  K01: ['a healthy bank balance', 'the average bank balance is below what this amount needs'],
  K02: ['no bounced payments', 'some payments bounced recently'],
  B01: ['a good credit score', 'your credit score is below what this product needs'],
  B02: ['a good credit score', 'your credit score is below what this product needs'],
  B03: ['a good credit score', 'your credit score is below what this product needs'],
  B04: ['a good credit score', 'your credit score is below what this product needs'],
  B07: ['all loans in good standing', 'a loan on your credit record is marked as overdue'],
  B08: [null, 'your credit record shows a suit filed or wilful default'],
  O01: ['the amount fits what your income supports', 'the amount you asked for is higher than your income currently supports'],
};
const custOf = (x) => CUST[x.id] || (x.field && CUST_FIELD[x.field]) || (/^P-/.test(x.id) ? ['a clean credit report', 'your credit report shows items above our limits'] : null);

export function templateExplanation(r, d) {
  const first = (d.fullName || 'there').trim().split(/\s+/)[0];
  const pos = byPriority(r.rules.filter((x) => x.status === 'pass' && x.pos && !['C01', 'C02', 'C03'].includes(x.id)));
  const con = byPriority(r.rules.filter((x) => x.status === 'fail')).concat(byPriority(r.rules.filter((x) => x.status === 'review')));
  const next = [...new Set(con.map((x) => x.fix).filter(Boolean))].slice(0, 2);
  if (r.missing.length) next.push(`Collect: ${r.missing.map((m) => m[0].toLowerCase()).join(', ')}.`);
  const missingDocs = r.docs.filter((x) => !x[1]).map((x) => x[0]);
  if (next.length < 3 && missingDocs.length) next.push(`Upload ${joinList(missingDocs.map((x) => x.toLowerCase()))} before sending to sanction.`);
  if (!next.length) next.push('Collect KYC and income documents and send the file to sanction.');
  const custPos = [...new Set(pos.map((x) => custOf(x)?.[0]).filter(Boolean))].slice(0, 3);
  const custCon = [...new Set(con.map((x) => custOf(x)?.[1]).filter(Boolean))];
  let msg;
  if (r.key === 'fail') {
    msg = `Hi ${first}, thank you for sharing your details. Based on what we have today, we're not able to offer this loan right now. The main reasons are ${joinList(custCon.slice(0, 3)) || 'some of our lending checks'}. This isn't permanent, and you're welcome to apply again once these change.`;
  } else {
    msg = `Hi ${first}, based on the details you shared, you appear likely to qualify for a loan of about ${lakh(r.minAmt)} to ${lakh(r.maxAmt)} over ${r.tenure} months.` +
      (custPos.length ? ` Working in your favour: ${joinList(custPos)}.` : '') +
      (custCon.length ? ` Before we confirm, our credit team will take a closer look at ${joinList(custCon.slice(0, 2))}.` : '') +
      (r.missing.length ? ` To complete the check, please share ${joinList(r.missing.map((m) => m[0].toLowerCase()))}.` : '') +
      ' This is a preliminary assessment, not a loan approval.';
  }
  return {
    headline: r.label,
    summary: `Configuration ${r.config.id} v${r.config.version}: ${r.evaluated} rules evaluated, ${r.cnt.pass} passed, ${r.cnt.review} need review, ${r.cnt.fail} failed${r.cnt.na ? `, ${r.cnt.na} not evaluated` : ''}${r.cnt.skip ? ` (${r.cnt.skip} not required for this product)` : ''}. Eligibility score ${r.score}%.` +
      (r.key !== 'fail' ? ` Indicative amount is ${lakh(r.minAmt)} to ${lakh(r.maxAmt)} at about ${r.rate}% for ${r.tenure} months.` : ''),
    positives: pos.slice(0, 4).map((x) => `${x.pos} (${x.id})`),
    concerns: con.slice(0, 4).map((x) => `${x.con} (${x.id})`),
    next_steps: next.slice(0, 3),
    customer_message: msg,
  };
}

/* ---------------- Offline keyword parser (no AI key) ---------------- */
const NUM = '([\\d][\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)?\\b';
const toAmt = (m, i = 1) => { if (!m) return null; const v = parseFloat(m[i].replace(/,/g, '')); const u = (m[i + 1] || '').toLowerCase(); return Math.round(v * (/^(k|thousand)/.test(u) ? 1e3 : /^(l|lac|lakh)/.test(u) ? 1e5 : /^(cr|crore)/.test(u) ? 1e7 : 1)); };

export function offlineExtract(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  const get = (re) => toAmt(new RegExp(re.replace('NUM', NUM)).exec(t));
  const first = (...res) => { for (const re of res) { const v = get(re); if (v != null) return v; } return null; };
  const yrs = (re) => { const m = re.exec(t); if (!m) return null; const v = parseFloat(m[2]); const more = m[1] ? 0.5 : 0; return /month/.test(m[3] || '') ? Math.round((v / 12) * 2) / 2 : v + more; };
  const biz = /business customer|proprietor|promoter|\bfirm\b|traders|pvt|private limited|\bllp\b/.test(t);
  const o = {
    applicantType: biz ? 'Business' : /individual|salaried|customer/.test(t) ? 'Individual' : null,
    customerType: /existing (?:business )?customer/.test(t) ? 'Existing' : /new (?:business )?customer/.test(t) ? 'New' : null,
    productId: /enterprise/.test(t) ? 'Enterprise Loan Monthly' : /business enhancement/.test(t) ? 'Business Enhancement Loan' : /msme|term loan/.test(t) ? 'MSME Term Loan' : /business loan/.test(t) ? 'Business Loan' : /personal loan/.test(t) ? 'Personal Loan' : null,
    amount: first('loan of\\s+(?:rs\\.?\\s*|₹\\s*)?NUM', '(?:wants|needs)\\s+(?:rs\\.?\\s*|₹\\s*)?NUM'),
    tenure: (() => { const m = /over\s+(\d+)\s*(year|month)/.exec(t) || /(\d+)\s*(year|month)s?\s+tenure/.exec(t) || /,\s*(\d+)\s*(month)s/.exec(t); return m ? (m[2] === 'year' ? +m[1] * 12 : +m[1]) : null; })(),
    pincode: (/\bpin(?:\s*code)?\s*(\d{6})/.exec(t) || [])[1] || null,
    age: +((/aged\s+(\d{2})/.exec(t) || /,\s*(\d{2}),/.exec(t) || /(\d{2})\s*years? old/.exec(t) || [])[1] || 0) || null,
    existingEmi: first('emi of\\s+NUM', 'NUM\\s+emi', 'emi\\s+NUM'),
  };
  const orig = ' ' + text + ' ';
  if (biz) {
    o.businessName = (/business customer\s+([A-Z][\w&.' ]+?)\s*,/.exec(orig) || [])[1] || null;
    o.fullName = (/(?:promoter|proprietor)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/.exec(orig) || [])[1] || null;
    o.startYear = +((/(?:running since|since|started in|established in)\s+(\d{4})/.exec(t) || [])[1] || 0) || null;
    const IND = [['textile', 'Textiles & Apparel'], ['apparel', 'Textiles & Apparel'], ['wholesale', 'Wholesale & Retail Trade'], ['retail', 'Wholesale & Retail Trade'], ['grocer', 'Wholesale & Retail Trade'], ['food processing', 'Food Processing'], ['manufactur', 'Manufacturing'], ['logistic', 'Transport & Logistics'], ['transport', 'Transport & Logistics'], ['construction', 'Construction'], ['agri', 'Agriculture & Allied'], ['clinic', 'Healthcare'], ['pharma', 'Healthcare'], ['service', 'Services']];
    o.industry = (IND.find(([k]) => t.includes(k)) || [])[1] || null;
    o.turnover = get('turnover\\s+(?:of\\s+)?NUM');
    o.totalIncome = get('total income\\s+(?:of\\s+)?NUM');
    o.opex = get('operating expenses\\s+(?:of\\s+)?NUM');
    o.depreciation = get('depreciation\\s+(?:of\\s+)?NUM');
    o.financeCost = get('(?:finance cost|interest)\\s+(?:of\\s+)?NUM');
    o.taxPaid = get('\\btax\\s+(?:of\\s+)?NUM');
    o.tradeLicense = /no trade licen[cs]e/.test(t) ? 'No' : /trade licen[cs]e/.test(t) ? 'Yes' : null;
    o.gstFiling = /gst (?:returns? )?(?:not filed|pending)/.test(t) ? 'No' : /gst (?:registration|registered|returns filed)|and gst/.test(t) ? 'Yes' : null;
    o.premises = /owns? the (?:factory|shop|premises)|(?:shop|factory|premises) owned|own (?:shop|factory)/.test(t) ? 'Owned' : /rented (?:shop|factory|premises)|(?:shop|factory) (?:is )?rented/.test(t) ? 'Rented' : /leased/.test(t) ? 'Leased' : null;
  } else {
    o.fullName = (/customer\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/.exec(orig) || [])[1] || null;
    o.salary = first('salary(?:\\s+of|\\s+is)?\\s+(?:rs\\.?\\s*|₹\\s*)?NUM', 'monthly income of\\s+(?:rs\\.?\\s*|₹\\s*)?NUM');
    o.house = first('NUM\\s+rent(?:al)?\\s+(?:income\\s+)?from', 'rent(?:al)? income (?:of\\s+)?NUM');
    o.business = get('NUM\\s+profit');
    o.food = get('food\\s+NUM'); o.medical = get('medical\\s+NUM'); o.insurance = get('insurance\\s+NUM');
    o.education = first('(?:child(?:ren)?\'?s?\\s+)?education\\s+NUM', 'school fees\\s+NUM');
    o.rent = get('\\b(?:house maintenance|maintenance|rent)\\s+NUM');
    o.otherExp = get('\\bother\\s+NUM');
    o.companyYears = yrs(/()([\d.]+)\s*(years?|months?)\s+in\s+(?:the\s+|this\s+)?(?:current\s+)?(?:job|company|role)/) ?? yrs(/\bat\s+[a-z0-9 ]+?\s+for\s+(?:about |around |nearly )?()([\d.]+)\s*(years?|months?)/);
    o.mobYears = yrs(/(?:mobile|phone)[^.,]*?(more than |over )?([\d.]+)\s*(years?|months?)/);
    o.houseType = /own(?:ed)? (?:house|home|flat)|living in own/.test(t) ? 'Owned' : /rented/.test(t) ? 'Rented' : /family (?:house|home)|parents'? house/.test(t) ? 'Family owned' : null;
  }
  o.resYears = yrs(/(more than |over )?([\d.]+)\s*(years?)\s+(?:at|in)\s+(?:the\s+)?(?:same|current)\s+(?:house|address|home|residence)/) ?? yrs(/(?:house|address|residence|flat|home|staying|living)[^.,]*?(more than |over )?([\d.]+)\s*(years?|months?)/);
  o.workYears = yrs(/(more than |over )?([\d.]+)\s*(years?|months?)\s+(?:of\s+)?(?:total\s+)?(?:work\s+)?experience/) ?? yrs(/(?:total\s+)?(?:work\s+)?experience\s+(?:of\s+)?()([\d.]+)\s*(years?|months?)/);
  o.itrFiled = /(?:does not|doesn't|not) file itr|no itr|itr not filed/.test(t) ? 'No' : /files? itr|itr filed/.test(t) ? 'Yes' : null;
  const PUR = [['renovat', 'Home renovation'], ['educat', 'Education'], ['medical expenses', 'Medical expenses'], ['wedding', 'Wedding'], ['marriage', 'Wedding'], ['consolidat', 'Debt consolidation'], ['working capital', 'Working capital'], ['expansion', 'Business expansion'], ['equipment', 'Equipment purchase'], ['machine', 'Equipment purchase']];
  const pu = PUR.find(([k]) => t.includes(`for ${k}`) || t.includes(`for his ${k}`) || t.includes(`for her ${k}`)) || PUR.find(([k]) => k !== 'educat' && t.includes(k)); if (pu) o.purpose = pu[1];
  o.missing = ['Offline parser: reads the common phrases only. Add an AI key for full extraction.'];
  o.notes = 'Parsed without AI (offline keyword parser).';
  return o;
}

export function offlineAnswer(r, q) {
  if (/approve|sanction|override|ignore/i.test(q)) return { answer: "I can't approve or override a decision. The rules engine decides this pre-assessment and a credit officer gives final approval.", refused: true, cited: [] };
  const con = r.rules.filter((x) => x.status === 'review' || x.status === 'fail');
  return { answer: con.length ? `The result is "${r.label}" because: ${con.map((x) => `${x.con} (${x.id})`).join('; ')}. (Offline answer: add an AI key for free-form questions.)` : `All rules passed. Indicative amount ${inr(r.minAmt)} to ${inr(r.maxAmt)}. (Offline answer: add an AI key for free-form questions.)`, refused: false, cited: con.map((x) => x.id) };
}

/* ---------------- Rule-based config review (no AI key) ---------------- */
export function offlineConfigReview(m, scope) {
  const F = []; const p = productById(scope.productId);
  const unsecured = p?.loanType === 'Unsecured'; const hasBiz = scope.applicantTypes.includes('Business');
  const req = BUREAUS.filter((b) => m.bureau.vendors[b.key].required);
  const mins = req.map((b) => Number(m.bureau.vendors[b.key].applicantMin)).filter((x) => x > 0);
  const minScore = mins.length ? Math.min(...mins) : null;
  if (unsecured && minScore != null && minScore < 650) F.push({ severity: 'high', module: 'bureau', message: `Minimum credit score ${minScore} is low for an unsecured product.`, suggestion: 'Most lenders use 680–720+ for unsecured loans.' });
  if (unsecured && !m.bureau.assetClassRequired) F.push({ severity: 'high', module: 'bureau', message: 'SMA / NPA check is off for an unsecured loan.', suggestion: 'Reject SMA, Sub Standard, Doubtful and Loss accounts.' });
  const foir = m.global.rules.find((r) => r.enabled && r.field === 'foir' && r.onFail === 'reject');
  if (foir && Number(foir.value) > 60) F.push({ severity: 'high', module: 'global', message: `FOIR ceiling of ${foir.value}% is permissive.`, suggestion: 'Typical ceilings are 50–60% of net income.' });
  if (!foir) F.push({ severity: 'medium', module: 'global', message: 'There is no FOIR rule that rejects over-leveraged applicants.', suggestion: 'Add a rule such as FOIR < 50% (reject).' });
  if (m.global.ageRequired && Number(m.global.maxAge) > 65) F.push({ severity: 'medium', module: 'global', message: `Maximum age ${m.global.maxAge} may leave the loan running past typical retirement age.`, suggestion: 'Consider age at maturity or a co-applicant rule.' });
  const last = m.bank.bands[m.bank.bands.length - 1];
  if (p && m.bank.required && last && last.upTo !== '' && Number(last.upTo) < p.max) F.push({ severity: 'medium', module: 'bank', message: `Bank thresholds stop at ₹${Number(last.upTo).toLocaleString('en-IN')} but the product goes up to ₹${p.max.toLocaleString('en-IN')}.`, suggestion: 'Add an open-ended top band so large loans are checked too.' });
  if (m.tax.itrSkipTo && p && Number(m.tax.itrSkipTo) >= p.max * 0.5) F.push({ severity: 'medium', module: 'tax', message: `ITR check is skipped up to ₹${Number(m.tax.itrSkipTo).toLocaleString('en-IN')}.`, suggestion: 'Confirm this covers only small-ticket loans.' });
  if (hasBiz && !m.balance.enabled) F.push({ severity: 'medium', module: 'balance', message: 'Business applicants are in scope but margins are not checked.', suggestion: 'Turn on the balance sheet module.' });
  const enq = m.bureau.params.find((x) => x.key === 'enquiries90');
  if (enq?.enabled && Number(enq.max) > 6) F.push({ severity: 'low', module: 'bureau', message: `Up to ${enq.max} enquiries in 90 days is permissive.`, suggestion: 'Typical limits are 3–4.' });
  if (!m.global.negativePincodes.length) F.push({ severity: 'low', module: 'global', message: 'No negative PIN codes are configured.', suggestion: 'Upload the negative area list if one exists.' });
  return { summary: F.length ? `Rule-based review found ${F.length} point${F.length > 1 ? 's' : ''} to check (offline, no AI key).` : 'No issues found by the rule-based review (offline, no AI key).', findings: F.slice(0, 6) };
}

/* ---------------- Rule-based data review (no AI key) ---------------- */
export function offlineDataReview(s) {
  const d = s.d; const F = []; const biz = d.applicantType === 'Business';
  if (biz) {
    const inc = num(d.totalIncome), opex = num(d.opex), to = num(d.turnover);
    if (inc && opex > inc) F.push({ severity: 'high', field: 'opex', message: 'Operating expenses are higher than total income.', suggestion: 'Check both figures against the P&L statement.' });
    if (to && inc && inc / to < 0.05) F.push({ severity: 'medium', field: 'totalIncome', message: `Total income is only ${((inc / to) * 100).toFixed(1)}% of turnover.`, suggestion: 'Confirm whether total income is gross revenue or net profit.' });
    if (s.bank && to / 12 > s.bank.avgCredits * 1.25) F.push({ severity: 'high', field: 'turnover', message: `Monthly turnover ₹${Math.round(to / 12).toLocaleString('en-IN')} is well above bank credits ₹${s.bank.avgCredits.toLocaleString('en-IN')}.`, suggestion: 'Ask for all business bank accounts or GST returns.' });
    const vy = vintageOf(d); const age = ageOf(d);
    if (vy != null && age != null && age - vy < 20) F.push({ severity: 'medium', field: 'startYear', message: `The promoter was ${age - vy} when the business started.`, suggestion: 'Check the start year and date of birth.' });
    if (d.itrFiled === 'No' && to > 4000000) F.push({ severity: 'medium', field: 'itrFiled', message: 'Turnover above ₹40 lakh but ITR is not filed.', suggestion: 'Ask why returns were not filed.' });
    if (d.gstFiling === 'No' && d.gstin) F.push({ severity: 'low', field: 'gstFiling', message: 'GSTIN is registered but GST returns are marked not filed.', suggestion: 'Confirm the filing status.' });
  } else {
    const inc = ['salary', 'business', 'house', 'capital', 'other'].reduce((a, k) => a + num(d[k]), 0);
    const exp = ['food', 'medical', 'insurance', 'education', 'rent', 'otherExp'].reduce((a, k) => a + num(d[k]), 0);
    if (s.bank && inc > s.bank.avgCredits * 1.25) F.push({ severity: 'high', field: 'salary', message: `Declared income ₹${inc.toLocaleString('en-IN')} is well above bank credits ₹${s.bank.avgCredits.toLocaleString('en-IN')}.`, suggestion: 'Verify with salary slips or ITR.' });
    if (num(d.family) > inc && inc > 0) F.push({ severity: 'medium', field: 'family', message: "Family income is higher than the applicant's own income.", suggestion: 'Consider adding the earning member as co-applicant.' });
    if (inc > 0 && exp > inc * 0.7) F.push({ severity: 'medium', field: 'food', message: 'Living expenses take more than 70% of income.', suggestion: 'Confirm the expense figures with the customer.' });
    if (inc > 0 && exp === 0) F.push({ severity: 'low', field: 'food', message: 'No monthly expenses entered.', suggestion: 'Capture at least food and rent / maintenance so FOIR is realistic.' });
    const w = bandInfo(d.workBand), c = bandInfo(d.companyBand);
    if (w && c && c.years > w.years) F.push({ severity: 'medium', field: 'workBand', message: `Time in the current company (${c.label}) is longer than total work experience (${w.label}).`, suggestion: 'Check the two stability answers.' });
    if (d.itrFiled === 'No' && inc > 50000) F.push({ severity: 'medium', field: 'itrFiled', message: 'Income above ₹50,000 a month but ITR is not filed.', suggestion: 'Ask why returns were not filed.' });
    if (d.houseType === 'Owned' && num(d.rent) > 10000) F.push({ severity: 'low', field: 'rent', message: 'House is owned but rent / maintenance is above ₹10,000 a month.', suggestion: 'Check whether this is rent paid elsewhere or maintenance.' });
  }
  return { summary: F.length ? `Rule-based review found ${F.length} point${F.length > 1 ? 's' : ''} to check (offline, no AI key).` : 'The entered data looks consistent (rule-based review, no AI key).', findings: F.slice(0, 6) };
}
