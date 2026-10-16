// The six AI jobs. None of them decides eligibility; the rules engine does.
//  RM app:    1. extractCustomer  — RM note → form fields (all 3 capture steps)
//             2. reviewApplicant  — data-quality review before the rules engine runs
//             3. explainResult    — rules output → AI remarks for the RM + customer message (EN / TA / HI)
//             4. askAssistant     — grounded chat about one result; refuses overrides
//  Admin:     5. draftConfig      — policy text → draft configuration (all five modules)
//             6. reviewConfig     — risk review of a draft before it is published
import { chatJSON } from './providers.js';
import { isAiReady } from './settings.js';
import { redact, piiScan, parseJSON, validateExplanation, validateAnswer, validateFindings } from './guardrails.js';
import { logStart, logUpdate } from './log.js';
import { aiCaseView, moneyCalc, internalScore } from '../engine/bre.js';
import { PRODUCTS, PURPOSES, APPLICANT_TYPES, CUSTOMER_TYPES, BUREAUS, CB_PARAMS, ASSET_CLASSES, NEGATIVE_STATUSES, INDUSTRIES, HOUSE_TYPES, PREMISES, ITR_HEADS, RULE_FIELDS, RULE_OPS, yearsToBand, bandInfo, productById } from '../engine/master.js';
import { blankModules, newRule, newBand } from '../engine/configStore.js';
import { VAL, ageOf, vintageOf, configOf } from '../engine/validation.js';
import { TODAY } from '../engine/format.js';
import { templateExplanation, offlineExtract, offlineAnswer, offlineConfigReview, offlineDataReview } from './fallback.js';

async function run(settings, task, system, messages, validate) {
  const payload = system + '\n\n' + messages.map((m) => m.content).join('\n');
  const scan = piiScan(messages.map((m) => m.content).join('\n'));
  const id = logStart({ task, provider: settings.provider, model: settings.model, request: { system, messages }, checks: [{ name: 'Outbound PII scan', ok: scan.ok, detail: scan.ok ? 'No identifiers in payload' : `Blocked: ${scan.hits.join(', ')}` }] });
  if (!scan.ok) { logUpdate(id, { status: 'blocked', error: 'Payload contained identifiers and was not sent.' }); throw new Error('Blocked: payload contained identifiers.'); }
  const t0 = performance.now();
  try {
    const res = await chatJSON(settings, system, messages);
    const ms = Math.round(performance.now() - t0);
    const obj = parseJSON(res.text);
    const v = validate(obj);
    const checks = [{ name: 'Outbound PII scan', ok: true, detail: 'No identifiers in payload' }, ...v.checks];
    logUpdate(id, { status: v.ok ? 'ok' : 'rejected', ms, usage: res.usage, model: res.model, response: res.text, checks, chars: payload.length });
    return { ...v, ms, model: res.model, logId: id };
  } catch (e) {
    logUpdate(id, { status: 'error', ms: Math.round(performance.now() - t0), error: e.message });
    e.logId = id;
    throw e;
  }
}
const shapeOk = (obj) => { const ok = !!obj && typeof obj === 'object'; return { value: obj, ok, checks: [{ name: 'Valid JSON matching the schema', ok, detail: ok ? '' : 'Could not parse JSON' }, { name: 'Values range-checked and enums enforced', ok: true, detail: 'Unknown keys dropped' }] }; };

/* ================= 1. Natural-language intake ================= */
const MONTHLY = ['salary', 'business', 'house', 'capital', 'other', 'family', 'food', 'medical', 'insurance', 'education', 'rent', 'otherExp'];
const ANNUAL = ['turnover', 'totalIncome', 'opex', 'depreciation', 'financeCost', 'taxPaid'];
const YEARS = { resYears: 'resBand', workYears: 'workBand', companyYears: 'companyBand', mobYears: 'mobBand' };
const YN = ['itrFiled', 'gstFiling', 'tradeLicense'];

const EXTRACT_SYSTEM = `You are the intake assistant in an Indian NBFC's loan eligibility app used by relationship managers (RMs).
The RM pastes a free-text note about a customer (English, or Tamil-English / Hindi-English mix).
Extract ONLY what the note states. Never guess. Never judge eligibility. Identifiers are masked as [PAN], [AADHAAR], [MOBILE] etc. — ignore them.

Return one JSON object with exactly these keys (null when the note does not say):
{
  "applicantType": "Individual"|"Business"|null,   // Business = a firm / company / proprietorship borrowing for the business
  "customerType": "New"|"Existing"|null,          // existing customer of this lender, or new
  "productId": one of ${JSON.stringify(PRODUCTS.map((p) => p.id))} or null,
  "purpose": one of ${JSON.stringify(PURPOSES)} or null,
  "amount": integer|null,            // requested loan, INR
  "tenure": integer|null,            // months
  "fullName": string|null,           // applicant, or promoter/proprietor for a business
  "age": integer|null,
  "businessName": string|null,
  "startYear": integer|null,         // year the business started
  "industry": one of ${JSON.stringify(INDUSTRIES)} or null,
  "pincode": string|null,
  // Individual — MONTHLY amounts in INR, by income-tax head
  "salary": integer|null, "business": integer|null /* business or professional profit */, "house": integer|null /* rent received */,
  "capital": integer|null, "other": integer|null, "family": integer|null /* income of other earning family members */,
  // Individual — MONTHLY expenses in INR
  "food": integer|null, "medical": integer|null, "insurance": integer|null, "education": integer|null /* school or college fees */,
  "rent": integer|null /* rent paid or house maintenance */, "otherExp": integer|null,
  // Business — ANNUAL amounts in INR
  "turnover": integer|null, "totalIncome": integer|null, "opex": integer|null /* total operating expenses */,
  "depreciation": integer|null, "financeCost": integer|null /* interest */, "taxPaid": integer|null,
  // Stability in years (decimals allowed; 6 months = 0.5)
  "resYears": number|null /* at current residence */, "workYears": number|null /* total work experience */,
  "companyYears": number|null /* in current job */, "mobYears": number|null /* using current mobile number */,
  "houseType": one of ${JSON.stringify(HOUSE_TYPES)} or null,
  "premises": one of ${JSON.stringify(PREMISES)} or null,   // business shop / factory
  "itrFiled": "Yes"|"No"|null, "gstFiling": "Yes"|"No"|null, "tradeLicense": "Yes"|"No"|null,
  "existingEmi": integer|null,       // monthly EMIs mentioned (for cross-check only; the bureau is the source of truth)
  "missing": string[],               // short names of important details the note does not give
  "notes": string                    // one short sentence summarising the customer for the RM
}
Conversions: "50k" = 50000, "1.2 lakh"/"1.2L" = 120000, "1.85 crore" = 18500000, "4 years" tenure = 48 months.`;

const toNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[,₹\s]/g, '')) : NaN);
const yn = (v) => (v === true || /^(yes|y|true)$/i.test(String(v)) ? 'Yes' : v === false || /^(no|n|false)$/i.test(String(v)) ? 'No' : null);
const pickEnum = (v, list) => (typeof v === 'string' ? list.find((x) => x.toLowerCase() === v.trim().toLowerCase()) || null : null);

export function sanitizeExtraction(o) {
  const fields = {}; const dropped = []; const info = {}; const assumed = [];
  if (!o || typeof o !== 'object') return { fields, dropped: ['response'], info, missing: [], notes: '', assumed };
  const at = pickEnum(o.applicantType, APPLICANT_TYPES); if (at) fields.applicantType = at;
  const ct = pickEnum(o.customerType, CUSTOMER_TYPES); if (ct) fields.customerType = ct;
  if (o.productId != null) { const p = PRODUCTS.find((x) => x.id.toLowerCase() === String(o.productId).toLowerCase()); if (p && (!at || p.types.includes(at))) fields.productId = p.id; else dropped.push('productId'); }
  if (typeof o.purpose === 'string' && o.purpose) fields.purpose = pickEnum(o.purpose, PURPOSES) || 'Other';
  const ctx = { applicantType: at || 'Individual' };
  if (typeof o.fullName === 'string' && o.fullName.trim()) { const v = o.fullName.trim().replace(/\s+/g, ' '); if (!VAL.fullName(v, ctx)) fields.fullName = v; else dropped.push('fullName'); }
  if (typeof o.businessName === 'string' && o.businessName.trim()) { const v = o.businessName.trim().slice(0, 80); if (!VAL.businessName(v, { applicantType: 'Business' })) fields.businessName = v; else dropped.push('businessName'); }
  if (o.startYear != null) { const y = Math.round(toNum(o.startYear)); if (y >= 1900 && y <= TODAY.getFullYear()) fields.startYear = String(y); else dropped.push('startYear'); }
  if (o.industry != null) fields.industry = pickEnum(o.industry, INDUSTRIES) || 'Other';
  if (o.pincode != null) { const s = String(o.pincode).trim(); if (/^[1-9]\d{5}$/.test(s)) fields.pincode = s; else dropped.push('pincode'); }
  if (o.amount != null) { const v = toNum(o.amount); if (isFinite(v) && v > 0 && v <= 1e8) fields.amount = String(Math.round(v / 1000) * 1000); else dropped.push('amount'); }
  if (o.tenure != null) { const v = toNum(o.tenure); if (isFinite(v) && v > 0 && v <= 180) fields.tenure = String(Math.round(v)); else dropped.push('tenure'); }
  for (const k of MONTHLY) { if (o[k] == null) continue; const v = toNum(o[k]); if (isFinite(v) && v >= 0 && v <= 1e7) fields[k] = String(Math.round(v)); else dropped.push(k); }
  for (const k of ANNUAL) { if (o[k] == null) continue; const v = toNum(o[k]); if (isFinite(v) && v >= 0 && v <= 1e10) fields[k] = String(Math.round(v)); else dropped.push(k); }
  for (const [k, band] of Object.entries(YEARS)) { if (o[k] == null) continue; const v = toNum(o[k]); if (isFinite(v) && v >= 0 && v <= 70) { fields[band] = yearsToBand(v); info[k] = v; } else dropped.push(band); }
  const ht = pickEnum(o.houseType, HOUSE_TYPES); if (ht) fields.houseType = ht;
  const pr = pickEnum(o.premises, PREMISES); if (pr) fields.premises = pr;
  for (const k of YN) { const v = yn(o[k]); if (v) fields[k] = v; }
  if (fields.totalIncome && fields.turnover && Number(fields.totalIncome) > Number(fields.turnover)) { dropped.push('totalIncome'); delete fields.totalIncome; }
  if (isFinite(toNum(o.age))) info.age = Math.round(toNum(o.age));
  if (isFinite(toNum(o.existingEmi))) info.existingEmi = Math.round(toNum(o.existingEmi));
  if (Object.keys(YEARS).some((k) => info[k] != null)) assumed.push('years converted to stability bands (>5 = 5 pts, 3–5 = 4, 1–3 = 3, <1 = 0)');
  const missing = Array.isArray(o.missing) ? o.missing.filter((x) => typeof x === 'string').slice(0, 8) : [];
  return { fields, dropped, info, missing, notes: typeof o.notes === 'string' ? o.notes.slice(0, 300) : '', assumed };
}

export async function extractCustomer(settings, text) {
  const red = redact(text);
  if (!isAiReady(settings)) return { ...sanitizeExtraction(offlineExtract(red.text)), redacted: red, mode: 'offline' };
  const r = await run(settings, 'Natural-language intake', EXTRACT_SYSTEM, [{ role: 'user', content: `RM note:\n"""${red.text}"""\nReturn the JSON object.` }], shapeOk);
  if (!r.ok) throw Object.assign(new Error('The AI response was not valid JSON.'), { logId: r.logId });
  return { ...sanitizeExtraction(r.value), redacted: red, mode: 'ai', ms: r.ms, model: r.model, logId: r.logId };
}

/* ================= 2. Applicant data review ================= */
export const REVIEW_FIELDS = ['applicantType', 'customerType', 'productId', 'purpose', 'amount', 'tenure', 'dob', 'startYear', 'pincode', ...ITR_HEADS.map((h) => h.key), 'family', 'food', 'medical', 'insurance', 'education', 'rent', 'otherExp', 'resBand', 'workBand', 'companyBand', 'mobBand', 'houseType', 'itrFiled', 'industry', 'gstFiling', 'tradeLicense', 'premises', ...ANNUAL, 'bureau', 'bank', 'general'];
const REVIEW_DATA_SYSTEM = `You review loan application data entered by a relationship manager at an Indian NBFC, BEFORE the rules engine runs.
Find data-quality problems: values that contradict each other, look mistyped, are implausible, or are missing for this applicant type and product.
Examples: work experience shorter than time in the current company, business vintage longer than the promoter's adult life, declared income far above bank credits, expenses larger than income, family income larger than the applicant's own, total income above turnover, operating expenses above income, a business with no ITR while turnover is high, a purpose that doesn't fit the product.
Do NOT decide or predict eligibility, and never say the loan is approved, eligible or rejected. The rules engine decides.
Return JSON: {"summary": string (1-2 sentences), "findings": [{"severity": "high"|"medium"|"low", "field": string, "message": string, "suggestion": string}]} with at most 6 findings.
"field" must be one of: __FIELDS__. Empty findings array if the data looks consistent.`;

export function applicantView(s) {
  const d = s.d; const b = s.bureau; const cfg = configOf(d); const biz = d.applicantType === 'Business';
  const m = moneyCalc(d, b, cfg); const is = internalScore(d); const n = (x) => Number(x) || 0;
  return {
    applicant: { type: d.applicantType, customer_type: d.customerType, age: ageOf(d), business_vintage_years: biz ? vintageOf(d) : undefined, industry: biz ? d.industry || null : undefined, has_udyam: biz ? !!d.udyam : undefined, has_gstin: biz ? !!d.gstin : undefined },
    loan: { product: d.productId, loan_type: productById(d.productId)?.loanType, purpose: d.purpose, amount_inr: n(d.amount) || null, tenure_months: n(d.tenure) || null },
    stability: { residence: bandInfo(d.resBand)?.label || null, work_experience: bandInfo(d.workBand)?.label || null, current_company: biz ? undefined : bandInfo(d.companyBand)?.label || null, mobile: biz ? undefined : bandInfo(d.mobBand)?.label || null, house: biz ? undefined : d.houseType || null, premises: biz ? d.premises || null : undefined },
    income: biz
      ? { annual_inr: { turnover: n(d.turnover), total_income: n(d.totalIncome), operating_expenses: n(d.opex), depreciation: n(d.depreciation), finance_cost: n(d.financeCost), tax: n(d.taxPaid) }, ebitda_margin_pct: m.ebitdaM != null ? +m.ebitdaM.toFixed(1) : null, itr_filed: d.itrFiled || null, gst_filing: d.gstFiling || null, trade_license: d.tradeLicense || null }
      : { monthly_inr: Object.fromEntries([...ITR_HEADS.map((h) => [h.key, n(d[h.key])]), ['family', n(d.family)]]), itr_filed: d.itrFiled || null },
    monthly_expenses_inr: biz ? undefined : { food: n(d.food), medical: n(d.medical), insurance: n(d.insurance), education: n(d.education), rent_or_maintenance: n(d.rent), other: n(d.otherExp) },
    bureau: b ? { lowest_score: Math.min(...Object.values(b.by).map((x) => x.score)), active_loans: b.loans.length, bureau_emis_monthly_inr: m.cbObl } : null,
    bank: s.bank ? { months: s.bank.months, avg_monthly_credits: s.bank.avgCredits, avg_closing_balance_3m: s.bank.avgClosing3m, inward_bounces: s.bank.bounces } : 'not provided',
    derived: { foir_pct: isFinite(m.foir) ? +m.foir.toFixed(1) : null, internal_score_pct: is.provided ? Math.round(is.pct) : null },
  };
}

export async function reviewApplicant(settings, s) {
  if (!isAiReady(settings)) return { ...offlineDataReview(s), mode: 'offline' };
  const system = REVIEW_DATA_SYSTEM.replace('__FIELDS__', REVIEW_FIELDS.join(', '));
  const r = await run(settings, 'Applicant data review', system, [{ role: 'user', content: `Application data (identifiers removed):\n${JSON.stringify(applicantView(s), null, 2)}` }], (obj) => validateFindings(obj, REVIEW_FIELDS, 'field'));
  if (!r.ok) return { ...offlineDataReview(s), mode: 'fallback', checks: r.checks, logId: r.logId };
  return { ...r.value, checks: r.checks, mode: 'ai', ms: r.ms, model: r.model, logId: r.logId };
}

/* ================= 3. AI remarks (explanation) ================= */
const LANGS = { en: 'English', ta: 'Tamil (தமிழ், written in Tamil script)', hi: 'Hindi (हिन्दी, written in Devanagari)' };
const explainSystem = (lang) => `You write the "AI remarks" for a loan eligibility result produced by a Business Rules Engine at an Indian NBFC.
The rules engine's decision is final for this stage. Never change it, upgrade it to an approval, or contradict it.
Use only facts in the case JSON. Do not invent numbers, rules or policies. Never say a loan is approved, sanctioned or guaranteed — this is a pre-assessment and a credit officer gives final approval.
Every rule comes from the product's published configuration (modules: Global Rules, Credit Bureau, Bank Statement Analyzer, Tax & ITR, Balance Sheet) or the credit policy. Rules with outcome "not_required" are switched off for this product: never list them as positives or concerns.
Refer to rules by ID in the RM fields where useful (e.g. "B01", "G02", "K01"). Amounts in Indian format (₹3.5 lakh, ₹85,000). "eligibility_score_pct" is a weighted summary of the rules, not a probability.

Return one JSON object:
{
  "headline": string,            // max 12 words, states the rules engine decision
  "summary": string,             // 2-3 sentences for the relationship manager
  "positives": string[],         // max 4, strongest factors that helped
  "concerns": string[],          // max 4, factors that need review or failed; empty if none
  "next_steps": string[],        // max 3, practical actions for the RM (documents to collect, what to change)
  "customer_message": string     // 3-5 warm, plain sentences for the customer, addressed by first name. No jargon (no FOIR, rule IDs, bureau band). Must say this is not a final approval.
}
Write "customer_message" in ${LANGS[lang] || LANGS.en}. Write every other field in English.`;

export async function explainResult(settings, result, d, lang = 'en') {
  if (!isAiReady(settings)) return { value: templateExplanation(result, d), checks: [], ok: true, mode: 'offline' };
  const firstName = (d.fullName || '').trim().split(/\s+/)[0] || 'Customer';
  const content = `Customer first name: ${firstName}\nCase JSON:\n${JSON.stringify(aiCaseView(result, d), null, 2)}`;
  try {
    const r = await run(settings, `AI remarks (${lang.toUpperCase()})`, explainSystem(lang), [{ role: 'user', content }], (obj) => validateExplanation(obj, result));
    if (!r.ok) return { value: templateExplanation(result, d), checks: r.checks, ok: false, mode: 'fallback', reason: 'Guardrail rejected the AI output', ms: r.ms, model: r.model, logId: r.logId };
    return { ...r, mode: 'ai' };
  } catch (e) {
    return { value: templateExplanation(result, d), checks: [], ok: false, mode: 'fallback', reason: e.message, logId: e.logId };
  }
}

/* ================= 4. Ask the assistant ================= */
const ASK_SYSTEM = `You are a credit assistant helping a relationship manager understand ONE loan eligibility result made by a Business Rules Engine.
Answer in 2-5 short sentences using only the case JSON. Cite the rule IDs you rely on. Rules with outcome "not_required" are switched off in the product configuration.
If the user asks you to approve, reject, sanction, override, ignore a rule or change the decision, refuse politely: the rules engine decides this stage and a credit officer gives final approval. Set "refused": true.
For what-if questions with new numbers, explain which rules would be affected and suggest the What-if simulator (it re-runs the rules engine). Do not state a new decision yourself.
Never reveal or ask for personal identifiers.
Return JSON: {"answer": string, "refused": boolean, "cited_rules": string[]}`;

export async function askAssistant(settings, result, d, history, question) {
  const q = redact(question);
  if (!isAiReady(settings)) return { value: offlineAnswer(result, q.text), checks: [], ok: true, mode: 'offline' };
  const messages = [
    { role: 'user', content: `Case JSON:\n${JSON.stringify(aiCaseView(result, d))}` },
    { role: 'assistant', content: '{"answer":"Understood. I will answer only from this case and I will not change the decision.","refused":false,"cited_rules":[]}' },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.role === 'assistant' ? JSON.stringify({ answer: m.text, refused: !!m.refused, cited_rules: m.cited || [] }) : m.text })),
    { role: 'user', content: q.text },
  ];
  const r = await run(settings, 'Ask the assistant', ASK_SYSTEM, messages, (obj) => validateAnswer(obj, result));
  if (!r.ok) return { value: { answer: 'The AI answer was blocked by a guardrail because it conflicted with the rules engine decision. Please rephrase the question.', refused: true, cited: [] }, checks: r.checks, ok: false, mode: 'blocked', logId: r.logId };
  return { ...r, mode: 'ai', redacted: q.count };
}

/* ================= 5. Configuration draft from policy text ================= */
const vendorSchema = (third) => `{ "required": boolean, "applicantMin": integer|null, "directorMin": integer|null, "${third}": integer|null }`;
const CONFIG_SCHEMA = `{
  "scope": { "applicantTypes": ("Individual"|"Business")[], "customerTypes": ("New"|"Existing")[], "productId": one of ${JSON.stringify(PRODUCTS.map((p) => p.id))} or null },
  "global": {
    "ageRequired": boolean, "minAge": integer|null, "maxAge": integer|null,
    "vintageRequired": boolean, "minVintage": number|null, "maxVintage": number|null,
    "udyamRequired": boolean, "negativePincodes": string[],
    "rules": [{ "field": ${RULE_FIELDS.map((f) => `"${f.key}"`).join('|')}, "op": ${RULE_OPS.map((o) => `"${o.key}"`).join('|')}, "value": number, "appliesTo": ("Individual"|"Business")[], "onFail": "reject"|"review" }]
  },
  "bureau": {
    "vendors": { ${BUREAUS.map((b) => `"${b.key}": ${vendorSchema(b.third)}`).join(', ')} },
    "params": { ${CB_PARAMS.map((p) => `"${p.key}": number|null`).join(', ')} },   // maximum allowed; null = not checked
    "assetClasses": (${ASSET_CLASSES.map((x) => `"${x}"`).join('|')})[],            // loan classifications that reject
    "negativeStatuses": (${NEGATIVE_STATUSES.map((x) => `"${x}"`).join('|')})[]
  },
  "bank": { "bands": [{ "upTo": integer|null /* loan amount; null = open-ended last band */, "minAvgBalance": integer, "maxBounces": integer }], "incomeVariance": number|null },
  "tax": { "itrApplicantRequired": boolean, "itrBusinessRequired": boolean, "itrSkipFrom": integer|null, "itrSkipTo": integer|null,
           "incomeHeads": { ${ITR_HEADS.map((h) => `"${h.key}": boolean`).join(', ')} }, "minAnnualItrIncome": integer|null, "gstRequired": boolean, "minGstScore": number|null },
  "balance": { "enabled": boolean, "ebitdaHigh": number|null, "ebitdaLow": number|null, "patHigh": number|null, "patLow": number|null, "onHighRisk": "review"|"reject" },
  "unmapped": string[]   // policy statements you could not map to a field
}`;
const DRAFT_SYSTEM = `You convert an NBFC credit policy note into a draft "Loan Eligibility Configuration" for the loaneligibilitycheck admin console.
Return ONLY one JSON object with this shape:
${CONFIG_SCHEMA}
Rules: set "...Required"/"enabled" true only when the note asks for that check; leave numbers null when not stated; never invent thresholds.
Examples: "CIBIL 700+" → cibil.applicantMin 700, required true. "CRIF" = highmark. "max 3 enquiries in 90 days" → params.enquiries90 3. "no written-off or settled accounts" → writtenOffAccounts 0, settledAccounts 0. "no SMA/NPA" → assetClasses SMA, Sub Standard, Doubtful (DBT), Loss.
"FOIR below 50%" → rule {field "foir", op "lt", value 50, onFail "reject"}. "internal score at least 50%" → {field "internalScore", op "gte", value 50}. "skip ITR up to 5 lakh" → itrSkipFrom 0, itrSkipTo 500000.
"Up to 5 lakh: average balance 15,000 and no bounces" → bank band {upTo 500000, minAvgBalance 15000, maxBounces 0}. EBITDA margin below 12% is high risk → ebitdaHigh 12. CMR rank is 1 (best) to 10 (worst).`;

const bool = (v) => v === true || v === 'true' || v === 'yes';
const numStr = (v, lo, hi, int = true) => { const x = toNum(v); if (v == null || v === '' || !isFinite(x) || x < lo || x > hi) return ''; return String(int ? Math.round(x) : Math.round(x * 100) / 100); };
const types = (a) => (Array.isArray(a) ? a.filter((x) => APPLICANT_TYPES.includes(x)) : []);

export function sanitizeConfigDraft(o) {
  const m = blankModules();
  const unmapped = Array.isArray(o?.unmapped) ? o.unmapped.filter((x) => typeof x === 'string').slice(0, 8) : [];
  const scope = { applicantTypes: [], customerTypes: [], productId: '' };
  if (!o || typeof o !== 'object') return { scope, modules: m, unmapped: ['response'], count: 0 };
  const sc = o.scope || {};
  scope.applicantTypes = types(sc.applicantTypes);
  scope.customerTypes = (Array.isArray(sc.customerTypes) ? sc.customerTypes : []).filter((x) => CUSTOMER_TYPES.includes(x));
  if (typeof sc.productId === 'string') { const p = PRODUCTS.find((x) => x.id.toLowerCase() === sc.productId.toLowerCase()); if (p) scope.productId = p.id; }
  const g = o.global || {};
  Object.assign(m.global, { ageRequired: g.ageRequired == null ? true : bool(g.ageRequired), minAge: numStr(g.minAge, 18, 100) || (bool(g.ageRequired) ? '' : m.global.minAge), maxAge: numStr(g.maxAge, 18, 100), vintageRequired: bool(g.vintageRequired), minVintage: numStr(g.minVintage, 0, 100, false), maxVintage: numStr(g.maxVintage, 0, 100, false), udyamRequired: bool(g.udyamRequired) });
  m.global.negativePincodes = [...new Set((Array.isArray(g.negativePincodes) ? g.negativePincodes : []).map((x) => String(x).trim()).filter((x) => /^[1-9]\d{5}$/.test(x)))];
  m.global.rules = (Array.isArray(g.rules) ? g.rules : []).slice(0, 12).filter((r) => r && RULE_FIELDS.some((f) => f.key === r.field) && RULE_OPS.some((x) => x.key === r.op) && isFinite(toNum(r.value)))
    .map((r) => newRule({ field: r.field, op: r.op, value: String(toNum(r.value)), appliesTo: types(r.appliesTo).length ? types(r.appliesTo) : ['Individual', 'Business'], onFail: r.onFail === 'review' ? 'review' : 'reject' }));
  const b = o.bureau || {};
  BUREAUS.forEach(({ key, third }) => { const x = (b.vendors || {})[key] || {}; m.bureau.vendors[key] = { required: bool(x.required), applicantMin: numStr(x.applicantMin, 300, 900), directorMin: numStr(x.directorMin, 300, 900), [third]: third === 'maxCmrRank' ? numStr(x.maxCmrRank, 1, 10) : numStr(x.businessMin, 300, 900) }; });
  m.bureau.params = m.bureau.params.map((p) => { const unit = CB_PARAMS.find((x) => x.key === p.key).unit; const v = numStr((b.params || {})[p.key], 0, unit === 'inr' ? 1e10 : 1000); return v === '' ? p : { ...p, enabled: true, max: v }; });
  m.bureau.assetClasses = (Array.isArray(b.assetClasses) ? b.assetClasses : []).filter((x) => ASSET_CLASSES.includes(x)); m.bureau.assetClassRequired = m.bureau.assetClasses.length > 0;
  m.bureau.negativeStatuses = (Array.isArray(b.negativeStatuses) ? b.negativeStatuses : []).filter((x) => NEGATIVE_STATUSES.includes(x)); m.bureau.negativeStatusRequired = m.bureau.negativeStatuses.length > 0;
  const k = o.bank || {};
  const bands = (Array.isArray(k.bands) ? k.bands : []).map((x) => ({ upTo: x?.upTo == null ? '' : numStr(x.upTo, 1, 1e10), minAvgBalance: numStr(x?.minAvgBalance, 0, 1e9), maxBounces: numStr(x?.maxBounces, 0, 100) })).filter((x) => x.minAvgBalance !== '' || x.maxBounces !== '');
  bands.sort((a, c) => (a.upTo === '' ? 1 : c.upTo === '' ? -1 : Number(a.upTo) - Number(c.upTo)));
  m.bank.bands = bands.slice(0, 8).map((x) => newBand({ ...x, maxBounces: x.maxBounces === '' ? '0' : x.maxBounces }));
  m.bank.required = m.bank.bands.length > 0; if (k.incomeVariance != null) m.bank.incomeVariance = numStr(k.incomeVariance, 1, 5, false) || m.bank.incomeVariance;
  const t = o.tax || {};
  Object.assign(m.tax, { itrApplicantRequired: bool(t.itrApplicantRequired), itrBusinessRequired: bool(t.itrBusinessRequired), itrSkipFrom: numStr(t.itrSkipFrom, 0, 1e10), itrSkipTo: numStr(t.itrSkipTo, 0, 1e10), minAnnualItrIncome: numStr(t.minAnnualItrIncome, 0, 1e10), gstRequired: bool(t.gstRequired), minGstScore: numStr(t.minGstScore, 0, 100, false) });
  if (t.incomeHeads && typeof t.incomeHeads === 'object') ITR_HEADS.forEach((h) => { if (typeof t.incomeHeads[h.key] === 'boolean') m.tax.incomeHeads[h.key] = t.incomeHeads[h.key]; });
  const s = o.balance || {};
  if (bool(s.enabled)) Object.assign(m.balance, { enabled: true, ebitdaHigh: numStr(s.ebitdaHigh, -100, 100, false) || m.balance.ebitdaHigh, ebitdaLow: numStr(s.ebitdaLow, -100, 100, false) || m.balance.ebitdaLow, patHigh: numStr(s.patHigh, -100, 100, false) || m.balance.patHigh, patLow: numStr(s.patLow, -100, 100, false) || m.balance.patLow, onHighRisk: s.onHighRisk === 'reject' ? 'reject' : 'review' });
  const count = countDiff(blankModules(), m);
  return { scope, modules: m, unmapped, count };
}
function countDiff(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b) ? 0 : Math.max(1, (b || []).length);
  if (a && typeof a === 'object') return Object.keys(b || {}).reduce((n, k) => n + countDiff(a[k], b[k]), 0);
  return a === b ? 0 : 1;
}

export async function draftConfig(settings, text) {
  if (!isAiReady(settings)) throw new Error('Drafting from policy text needs an AI key. Add one in AI settings.');
  const red = redact(text);
  const r = await run(settings, 'Config draft from policy', DRAFT_SYSTEM, [{ role: 'user', content: `Policy note:\n"""${red.text}"""\nReturn the JSON object.` }], shapeOk);
  if (!r.ok) throw Object.assign(new Error('The AI response was not valid JSON.'), { logId: r.logId });
  return { ...sanitizeConfigDraft(r.value), ms: r.ms, model: r.model, logId: r.logId };
}

/* ================= 6. Configuration review ================= */
export const CFG_MODULES = ['scope', 'bureau', 'bank', 'tax', 'balance', 'global']; // last = default when the model returns an unknown key
const REVIEW_CFG_SYSTEM = `You are a credit-risk reviewer checking a draft "Loan Eligibility Configuration" at an Indian NBFC before it is published.
The configuration has a scope (applicant types, customer types, product) and five modules: global (age, vintage, Udyam, negative PIN codes, custom rules such as FOIR and internal score), bureau (vendor score cut-offs, report parameters, asset classes, negative statuses), bank (loan-amount bands with minimum average closing balance and maximum inward bounces), tax (ITR requirements, skip range, counted income heads, GST), balance (EBITDA / PAT margin risk bands for business applicants).
Look for risky, inconsistent or unusual settings: thresholds too loose or too strict for the loan type, checks that are off but normally expected (e.g. no SMA/NPA check on an unsecured loan), bank bands that stop below the product maximum, ITR skip ranges that cover most of the product, rules that contradict each other, and settings that do nothing for the applicant types in scope.
You only advise. You cannot publish or change the configuration. Do not invent regulations.
Return JSON: {"summary": string (1-2 sentences), "findings": [{"severity": "high"|"medium"|"low", "module": "scope"|"global"|"bureau"|"bank"|"tax"|"balance", "message": string, "suggestion": string}]} with at most 6 findings, most severe first. Empty findings array if nothing stands out.`;

export function configView(c) {
  const p = productById(c.scope.productId);
  const m = c.draft;
  return {
    scope: { ...c.scope, loan_type: p?.loanType, product_limits: p ? { amount_inr: [p.min, p.max], tenure_months: [p.tmin, p.tmax] } : null },
    global: { ...m.global, rules: m.global.rules.filter((r) => r.enabled).map(({ field, op, value, appliesTo, onFail }) => ({ field, op, value, appliesTo, onFail })) },
    bureau: { vendors: Object.fromEntries(Object.entries(m.bureau.vendors).filter(([, v]) => v.required)), params: Object.fromEntries(m.bureau.params.filter((x) => x.enabled).map((x) => [x.key, { max: x.max, band: x.band }])), assetClasses: m.bureau.assetClassRequired ? m.bureau.assetClasses : [], negativeStatuses: m.bureau.negativeStatusRequired ? m.bureau.negativeStatuses : [] },
    bank: m.bank.required ? { bands: m.bank.bands.map(({ upTo, minAvgBalance, maxBounces }) => ({ upTo: upTo || 'open-ended', minAvgBalance, maxBounces })), incomeVariance: m.bank.incomeVariance } : 'off',
    tax: m.tax, balance: m.balance.enabled ? m.balance : 'off',
  };
}

export async function reviewConfig(settings, c) {
  if (!isAiReady(settings)) return { ...offlineConfigReview(c.draft, c.scope), mode: 'offline' };
  const r = await run(settings, 'Config review', REVIEW_CFG_SYSTEM, [{ role: 'user', content: `Configuration JSON:\n${JSON.stringify(configView(c), null, 2)}` }], (obj) => validateFindings(obj, CFG_MODULES, 'module'));
  if (!r.ok) return { ...offlineConfigReview(c.draft, c.scope), mode: 'fallback', checks: r.checks, logId: r.logId };
  return { ...r.value, checks: r.checks, mode: 'ai', ms: r.ms, model: r.model, logId: r.logId };
}
