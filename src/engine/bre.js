// Business Rules Engine — the ONLY component that decides eligibility.
// Every threshold comes from the published configuration; pricing bands come from policy.js.
import { POLICY } from './policy.js';
import { num, inr, pct, floor10k, hash } from './format.js';
import { emi, pv, rateFor, bandFor } from './finance.js';
import { productOf, ageOf, nameMatch, configOf, isBusiness, vintageOf } from './validation.js';
import { BUREAUS, CB_PARAMS, ITR_HEADS, EXPENSE_HEADS, RULE_FIELDS, RULE_OPS, bandInfo, yearsToBand, bandApplies } from './master.js';

export function internalScore(d) {
  const biz = isBusiness(d);
  const params = biz
    ? [['resBand', 'Residential stability', d.resBand], ['workBand', 'Working experience', d.workBand], ['vintage', 'Business vintage', yearsToBand(vintageOf(d))]]
    : [['resBand', 'Residential stability', d.resBand], ['workBand', 'Working experience', d.workBand], ['companyBand', 'Current company stability', d.companyBand], ['mobBand', 'Mobile number stability', d.mobBand]];
  let pts = 0; const missing = [];
  const rows = params.map(([id, label, band]) => { const b = bandInfo(band); if (!b) missing.push(label); else pts += b.pts; return { id, label, band: b?.label || null, pts: b ? b.pts : null }; });
  const provided = rows.filter((r) => r.pts != null).length;
  return { rows, pts, max: provided * 5, provided, total: rows.length, pct: provided ? (pts / (provided * 5)) * 100 : 0, missing };
}

/** Monthly income & obligations. Individual: included ITR heads + family − expenses − EMIs. Business: (EBITDA − tax)/12 − EMIs. */
export function moneyCalc(d, bureau, cfg) {
  const cbObl = bureau ? bureau.loans.reduce((a, l) => a + l.emi, 0) : 0;
  if (isBusiness(d)) {
    const turnover = num(d.turnover), income = num(d.totalIncome), opex = num(d.opex), dep = num(d.depreciation), fin = num(d.financeCost), tax = num(d.taxPaid);
    const ebitda = income - opex; const pbt = ebitda - dep - fin; const pat = pbt - tax;
    const ebitdaM = income > 0 ? (ebitda / income) * 100 : null; const patM = income > 0 ? (pat / income) * 100 : null;
    const gross = Math.round((ebitda - tax) / 12);
    const exp = cbObl; const net = gross - exp; const foir = net > 0 ? (exp / net) * 100 : Infinity;
    return { biz: true, turnover, income, opex, dep, fin, tax, ebitda, pbt, pat, ebitdaM, patM, gross, exp, cbObl, net, foir, declared: Math.round(turnover / 12) };
  }
  const heads = cfg?.tax.incomeHeads || { salary: true, business: true, house: true, capital: false, other: true };
  const headRows = ITR_HEADS.map((h) => ({ ...h, amount: num(d[h.key]), included: !!heads[h.key] }));
  const family = num(d.family);
  const gross = headRows.filter((h) => h.included).reduce((a, h) => a + h.amount, 0) + family;
  const living = EXPENSE_HEADS.reduce((a, h) => a + num(d[h.key]), 0);
  const exp = living + cbObl; const net = gross - exp; const foir = net > 0 ? (exp / net) * 100 : Infinity;
  const declared = headRows.filter((h) => h.included && h.key !== 'capital').reduce((a, h) => a + h.amount, 0);
  return { biz: false, headRows, family, gross, living, cbObl, exp, net, foir, declared, itrAnnual: headRows.filter((h) => h.included).reduce((a, h) => a + h.amount, 0) * 12 };
}

const n = (v) => (v === '' || v == null ? null : Number(v));
const opLabel = (op) => RULE_OPS.find((o) => o.key === op)?.label || op;
const fmtField = (f, v) => (v == null || !isFinite(v) ? '—' : f === 'foir' || f === 'internalScore' ? `${v.toFixed(1)}%` : f === 'netIncome' || f === 'loanAmount' ? inr(v) : /Years$/.test(f) ? `${v}+ yrs` : String(v));

export function runBRE(s, cfgOverride) {
  const { d, v, bureau: b, bank: k } = s;
  const c = cfgOverride || configOf(d);
  const biz = isBusiness(d); const who = biz ? 'Business' : 'Individual';
  const m = moneyCalc(d, b, c), is = internalScore(d), p = productOf(d);
  const a = ageOf(d); const amount = num(d.amount); const tenure = Number(d.tenure) || p.tmin;
  const reqB = BUREAUS.filter((x) => c.bureau.vendors[x.key].required);
  const scoreSet = (reqB.length ? reqB : BUREAUS).map((x) => b.by[x.key]);
  const lowScore = Math.min(...scoreSet.map((x) => x.score));
  const rate = rateFor(lowScore);
  const foirRule = c.global.rules.find((r) => r.enabled && r.field === 'foir' && r.onFail === 'reject' && r.appliesTo.includes(who));
  const ceiling = foirRule ? Number(foirRule.value) : 50;
  const headroom = (ceiling / 100) * m.net - m.exp;
  const maxAmt = headroom > 0 ? Math.min(floor10k(pv(headroom, rate, tenure)), p.max) : 0;
  const minAmt = floor10k(maxAmt * POLICY.rangeFloor);
  const R = [];
  const add = (r) => R.push({ src: 'config', ...r });
  const skip = (id, cat, name, why, module) => add({ id, cat, module, name, value: why, policy: 'Not required by configuration', status: 'skip' });

  /* ---------------- Customer ---------------- */
  const kycOk = biz ? v.pan && v.mobile && (!d.udyam || v.udyam) && (!d.gstin || v.gstin) : v.id && v.pan && v.mobile;
  add({ id: 'C01', cat: 'Customer', module: 'global', src: 'policy', name: 'KYC & contact verification', value: biz ? ['PAN ✓', 'OTP ✓', d.udyam && 'Udyam ✓', d.gstin && 'GST ✓'].filter(Boolean).join(' · ') : 'ID ✓ · PAN ✓ · OTP ✓', policy: 'All documents verified', status: kycOk ? 'pass' : 'fail', pos: 'KYC and contact details verified', con: 'KYC is incomplete', fix: 'Complete document verification.' });
  const nm = nameMatch(d);
  add({ id: 'C02', cat: 'Customer', module: 'global', src: 'policy', name: 'Name matches PAN', value: `PAN 5th char ${nm.ch} · ${nm.sur}`, policy: 'Initials match', status: nm.ok ? 'pass' : 'review', pos: 'Name matches PAN records', con: "Name doesn't match the PAN initial", fix: 'Check the name against the PAN card.' });
  const g = c.global;
  if (g.ageRequired) {
    const lo = n(g.minAge), hi = n(g.maxAge); const ok = a >= lo && (hi == null || a <= hi);
    add({ id: 'C03', cat: 'Customer', module: 'global', name: biz ? 'Promoter age' : 'Applicant age', value: `${a} years`, policy: `${lo}${hi != null ? `–${hi}` : '+'} years`, status: ok ? 'pass' : 'fail', pos: `Age ${a} is within ${lo}${hi != null ? `–${hi}` : '+'}`, con: `Age ${a} is outside ${lo}${hi != null ? `–${hi}` : '+'} years`, fix: 'Consider a co-applicant within the age range.' });
  } else skip('C03', 'Customer', 'Applicant age', 'Age check turned off', 'global');
  if (biz && g.vintageRequired) {
    const vy = vintageOf(d); const lo = n(g.minVintage), hi = n(g.maxVintage);
    const ok = vy != null && (lo == null || vy >= lo) && (hi == null || vy <= hi);
    add({ id: 'C04', cat: 'Customer', module: 'global', name: 'Business vintage', value: vy == null ? 'Start year missing' : `${vy} years (since ${d.startYear})`, policy: `${lo ?? 0}${hi != null ? `–${hi}` : '+'} years`, status: ok ? 'pass' : 'fail', pos: `Business running for ${vy} years`, con: `Business vintage ${vy ?? '—'} years is outside ${lo ?? 0}${hi != null ? `–${hi}` : '+'} years`, fix: 'This product needs an established business.' });
  } else skip('C04', 'Customer', 'Business vintage', biz ? 'Vintage check turned off' : 'Applies to business applicants only', 'global');
  if (biz && g.udyamRequired) {
    const ok = !!d.udyam && v.udyam;
    add({ id: 'C05', cat: 'Customer', module: 'global', name: 'MSME (Udyam) registration', value: d.udyam ? `${d.udyam} · verified` : 'Not provided', policy: 'Valid Udyam registration', status: ok ? 'pass' : 'fail', pos: 'Udyam registration verified', con: 'Udyam registration missing', fix: 'Collect and verify the Udyam certificate.' });
  } else skip('C05', 'Customer', 'MSME (Udyam) registration', biz ? 'Udyam check turned off' : 'Applies to business applicants only', 'global');
  if (g.negativePincodes.length) {
    const hit = g.negativePincodes.includes(d.pincode);
    add({ id: 'C06', cat: 'Customer', module: 'global', name: 'Negative PIN code', value: d.pincode, policy: `Not in negative list (${g.negativePincodes.length})`, status: hit ? 'fail' : 'pass', pos: 'Location is serviceable', con: `PIN code ${d.pincode} is on the negative list`, fix: 'Negative locations are not serviced for this product.' });
  } else skip('C06', 'Customer', 'Negative PIN code', 'No negative PIN codes configured', 'global');

  /* ---------------- Custom global rules ---------------- */
  const fv = {
    foir: isFinite(m.foir) ? m.foir : 999, internalScore: is.provided ? is.pct : null, netIncome: m.net, cbScore: lowScore,
    resYears: bandInfo(d.resBand)?.years ?? null, workYears: bandInfo(d.workBand)?.years ?? null, companyYears: biz ? null : bandInfo(d.companyBand)?.years ?? null, loanAmount: amount,
  };
  g.rules.forEach((r, i) => {
    if (!r.enabled) return;
    const f = RULE_FIELDS.find((x) => x.key === r.field); const id = `G${String(i + 1).padStart(2, '0')}`;
    if (!r.appliesTo.includes(who)) { skip(id, f.cat, `${f.label} ${opLabel(r.op)} ${r.value}`, `Applies to ${r.appliesTo.join(' / ')} only`, 'global'); return; }
    const val = fv[r.field];
    const name = `${f.label.replace(/ \(.*\)$/, '')} ${opLabel(r.op)} ${fmtField(r.field, Number(r.value)).replace('+ yrs', ' yrs')}`;
    if (val == null) { add({ id, field: r.field, cat: f.cat, module: 'global', name, value: 'Not available', policy: `Pass if ${f.label} ${opLabel(r.op)} ${r.value}`, status: 'na', con: `${f.label} could not be calculated`, fix: 'Provide the missing details.' }); return; }
    const ok = RULE_OPS.find((o) => o.key === r.op).test(val, Number(r.value));
    add({ id, field: r.field, cat: f.cat, module: 'global', name, value: fmtField(r.field, val), policy: `Pass if ${opLabel(r.op)} ${r.value} · on fail: ${r.onFail === 'reject' ? 'reject' : 'manual review'}`, status: ok ? 'pass' : r.onFail === 'reject' ? 'fail' : 'review',
      pos: `${f.label.replace(/ \(.*\)$/, '')} ${fmtField(r.field, val)} meets the rule`, con: `${f.label.replace(/ \(.*\)$/, '')} ${fmtField(r.field, val)} does not meet ${opLabel(r.op)} ${r.value}`,
      fix: r.field === 'foir' ? 'Reduce monthly obligations or add a co-applicant\'s income.' : r.field === 'internalScore' ? 'Stability is below policy; consider a co-applicant with a longer history.' : r.field === 'netIncome' ? 'Add a co-applicant or family income.' : 'Review with the credit team.' });
  });

  /* ---------------- Income ---------------- */
  const t = c.tax; const sf = n(t.itrSkipFrom), st = n(t.itrSkipTo);
  const inSkip = sf != null && st != null && amount >= sf && amount <= st;
  const itrDocs = d.itrFile ? ` · ${d.itrFile}` : '';
  if (t.itrApplicantRequired || (biz && t.itrBusinessRequired)) {
    const id = 'I01'; const name = biz ? 'ITR filing (business)' : 'ITR filing (applicant)';
    if (inSkip) add({ id, cat: 'Income', module: 'tax', name, value: `Skipped: ${inr(amount)} is within ${inr(sf)}–${inr(st)}`, policy: 'ITR skip range', status: 'skip' });
    else { const ok = d.itrFiled === 'Yes'; add({ id, cat: 'Income', module: 'tax', name, value: ok ? `Filed${itrDocs}` : 'Not filed', policy: 'ITR filed', status: ok ? 'pass' : 'fail', pos: 'ITR filed', con: 'ITR not filed', fix: 'Collect ITR acknowledgements for the last two years.' }); }
  } else skip('I01', 'Income', 'ITR filing', 'ITR check turned off', 'tax');
  if (!biz && t.minAnnualItrIncome !== '' && !inSkip) {
    const min = Number(t.minAnnualItrIncome); const ok = m.itrAnnual >= min;
    add({ id: 'I02', cat: 'Income', module: 'tax', name: 'Annual income (included ITR heads)', value: inr(m.itrAnnual), policy: `≥ ${inr(min)}`, status: ok ? 'pass' : 'fail', pos: `Annual income ${inr(m.itrAnnual)}`, con: `Annual income ${inr(m.itrAnnual)} is below ${inr(min)}`, fix: 'Add a co-applicant or other declared income.' });
  }
  if (biz && t.gstRequired) {
    const gs = s.gst; const min = n(t.minGstScore); const ok = !!gs && gs.score >= min;
    add({ id: 'I03', cat: 'Income', module: 'tax', name: 'GST return compliance (Cygnet)', value: gs ? `${gs.score}/100 · ${gs.onTime}` : 'No GSTIN', policy: `≥ ${min}`, status: ok ? 'pass' : gs ? 'fail' : 'na', pos: `GST compliance score ${gs?.score}`, con: gs ? `GST compliance score ${gs.score} is below ${min}` : 'GST compliance could not be checked', fix: 'Regularise pending GST returns.' });
  } else skip('I03', 'Income', 'GST return compliance', biz ? 'GST check turned off' : 'Applies to business applicants only', 'tax');
  if (biz && c.balance.enabled) {
    const bal = c.balance;
    const band = (val, hi, lo) => (val == null ? null : val < Number(hi) ? 'High' : val > Number(lo) ? 'Low' : 'Medium');
    [['I04', 'EBITDA margin', m.ebitdaM, bal.ebitdaHigh, bal.ebitdaLow], ['I05', 'PAT margin', m.patM, bal.patHigh, bal.patLow]].forEach(([id, label, val, hi, lo]) => {
      const rk = band(val, hi, lo);
      add({ id, cat: 'Income', module: 'balance', name: label, value: val == null ? 'Not available' : `${val.toFixed(1)}% · ${rk} risk`, policy: `High < ${hi}% · Low > ${lo}%`, status: rk == null ? 'na' : rk === 'High' ? (bal.onHighRisk === 'reject' ? 'fail' : 'review') : 'pass', pos: `${label} ${val?.toFixed(1)}% (${rk?.toLowerCase()} risk)`, con: `${label} ${val?.toFixed(1)}% is high risk (below ${hi}%)`, fix: 'Ask for audited financials and explain the thin margin.', risk: rk });
    });
  } else if (biz) skip('I04', 'Income', 'Balance sheet margins', 'Balance sheet check turned off', 'balance');
  if (k && c.bank.required) {
    const ratio = Number(c.bank.incomeVariance); const ok = m.declared <= ratio * k.avgCredits;
    add({ id: 'I06', cat: 'Income', module: 'bank', name: biz ? 'Turnover vs bank credits' : 'Declared income vs bank credits', value: `${inr(m.declared)} declared · ${inr(k.avgCredits)} avg credits`, policy: `Declared ≤ ${ratio}× bank credits`, status: ok ? 'pass' : 'review', pos: 'Declared income is supported by bank credits', con: `Declared ${inr(m.declared)} is higher than bank credits of ${inr(k.avgCredits)}`, fix: 'Collect salary slips or ITR to support the declared income.' });
  }

  /* ---------------- Bank statement analyzer ---------------- */
  if (c.bank.required) {
    if (!k) {
      add({ id: 'K01', cat: 'Bureau', module: 'bank', name: 'Bank statement analysis', value: 'No bank statement', policy: 'Statement required', status: 'na', con: 'Bank statement not provided', fix: 'Fetch statements through the Account Aggregator or upload them.' });
    } else {
      let lo = 0; const bd = c.bank.bands.find((x) => { const hit = amount > lo && (x.upTo === '' || amount <= Number(x.upTo)); if (x.upTo !== '') lo = Number(x.upTo); return hit; });
      if (!bd) add({ id: 'K01', cat: 'Bureau', module: 'bank', name: 'Bank statement thresholds', value: `No band configured for ${inr(amount)}`, policy: 'Loan-amount band', status: 'review', con: `No bank threshold is configured for ${inr(amount)}`, fix: 'Credit team to review bank behaviour manually.' });
      else {
        const label = bd.upTo === '' ? 'above last band' : `up to ${inr(Number(bd.upTo))}`;
        add({ id: 'K01', cat: 'Bureau', module: 'bank', name: 'Average closing balance (3 months)', value: inr(k.avgClosing3m), policy: `≥ ${inr(Number(bd.minAvgBalance))} (${label})`, status: k.avgClosing3m >= Number(bd.minAvgBalance) ? 'pass' : 'fail', pos: `Average balance ${inr(k.avgClosing3m)}`, con: `Average closing balance ${inr(k.avgClosing3m)} is below ${inr(Number(bd.minAvgBalance))}`, fix: 'Maintain a higher balance for 3 months, or apply for a smaller amount.' });
        add({ id: 'K02', cat: 'Bureau', module: 'bank', name: 'Inward bounces (bank statement)', value: `${k.bounces}`, policy: `≤ ${bd.maxBounces} (${label})`, status: k.bounces <= Number(bd.maxBounces) ? 'pass' : 'fail', pos: k.bounces ? `${k.bounces} bounce, within limit` : 'No bounced payments', con: `${k.bounces} bounced payment${k.bounces > 1 ? 's' : ''} (max ${bd.maxBounces})`, fix: 'Get the reason for the bounces; lenders often ask for 3 more months of clean statements.' });
      }
    }
  } else skip('K01', 'Bureau', 'Bank statement analysis', 'Bank checks turned off', 'bank');

  /* ---------------- Credit bureau ---------------- */
  BUREAUS.forEach(({ key, label, third }, i) => {
    const id = `B0${i + 1}`; const cfg = c.bureau.vendors[key];
    if (!cfg.required) { skip(id, 'Bureau', `${label} score`, `${label} not selected`, 'bureau'); return; }
    const r = b.by[key]; const parts = []; const fails = [];
    const chk = (lbl, val, ok, pol) => { parts.push(`${lbl} ${val ?? '—'}`); if (!ok) fails.push(`${lbl.toLowerCase()} ${val ?? 'missing'} (${pol})`); };
    chk('Applicant', r.score, r.score >= n(cfg.applicantMin), `min ${cfg.applicantMin}`);
    if (biz && cfg.directorMin !== '') chk('Director', r.directorScore, r.directorScore != null && r.directorScore >= n(cfg.directorMin), `min ${cfg.directorMin}`);
    if (biz && third === 'maxCmrRank' && cfg.maxCmrRank !== '') chk('CMR', r.cmrRank, r.cmrRank != null && r.cmrRank <= n(cfg.maxCmrRank), `max ${cfg.maxCmrRank}`);
    if (biz && third === 'businessMin' && cfg.businessMin !== '') chk('Business', r.businessScore, r.businessScore != null && r.businessScore >= n(cfg.businessMin), `min ${cfg.businessMin}`);
    add({ id, cat: 'Bureau', module: 'bureau', name: `${label} score`, value: parts.join(' · '), policy: `applicant ≥ ${cfg.applicantMin}${biz && cfg.directorMin ? ` · director ≥ ${cfg.directorMin}` : ''}${biz && cfg[third] ? ` · ${third === 'maxCmrRank' ? `CMR ≤ ${cfg[third]}` : `business ≥ ${cfg[third]}`}` : ''}`, status: fails.length ? 'fail' : 'pass', pos: `${label} score ${r.score} meets the minimum ${cfg.applicantMin}`, con: `${label}: ${fails.join(', ')}`, fix: 'Scores below the minimum are not eligible for this product. Reapply after 6–12 months of on-time repayments.' });
  });
  const worst = (key) => Math.max(...scoreSet.map((x) => x[key] ?? 0));
  c.bureau.params.forEach((pp) => {
    const meta = CB_PARAMS.find((x) => x.key === pp.key); if (!pp.enabled || !meta) return;
    if (!bandApplies(pp.band, amount)) return;
    const val = worst(pp.key); const max = Number(pp.max);
    const fmt = (x) => (meta.unit === 'inr' ? inr(x) : meta.unit === 'days' ? `${x} days` : String(x));
    add({ id: `P-${pp.key}`, cat: 'Bureau', module: 'bureau', name: meta.label, value: fmt(val), policy: `≤ ${fmt(max)}${pp.band !== 'all' ? ` (${pp.band === 'upto5' ? '≤ ₹5L' : pp.band === '5to10' ? '₹5–10L' : '> ₹10L'})` : ''}`, status: val <= max ? 'pass' : 'fail', pos: `${meta.label}: ${fmt(val)}`, con: `${meta.label} ${fmt(val)} is above the limit of ${fmt(max)}`, fix: pp.key === 'enquiries90' || pp.key === 'inquiries6m' ? 'Avoid new loan applications until older enquiries drop off.' : 'Regularise the accounts and pull a fresh bureau report.' });
  });
  const found = [...new Set(scoreSet.flatMap((x) => x.statuses))];
  if (c.bureau.assetClassRequired) {
    const hit = found.filter((x) => c.bureau.assetClasses.includes(x));
    add({ id: 'B07', cat: 'Bureau', module: 'bureau', name: 'Loan asset classification', value: hit.length ? hit.join(', ') : 'Standard', policy: `None of: ${c.bureau.assetClasses.join(', ')}`, status: hit.length ? 'fail' : 'pass', pos: 'All loans are standard (no SMA / NPA)', con: `Loan classified as ${hit.join(', ')}`, fix: 'Accounts in SMA or NPA must be regularised first.' });
  }
  if (c.bureau.negativeStatusRequired) {
    const hit = found.filter((x) => c.bureau.negativeStatuses.includes(x));
    add({ id: 'B08', cat: 'Bureau', module: 'bureau', name: 'Suit filed / wilful default', value: hit.length ? hit.join(', ') : 'None', policy: `None of: ${c.bureau.negativeStatuses.join(', ')}`, status: hit.length ? 'fail' : 'pass', pos: 'No suit filed or wilful default', con: `Bureau shows ${hit.join(', ')}`, fix: 'Not eligible while these statuses appear.' });
  }

  /* ---------------- Obligations ---------------- */
  let aSt, aFix;
  if (maxAmt < p.min) { aSt = 'fail'; aFix = 'There is no room for a new EMI at current obligations.'; }
  else if (amount <= maxAmt) aSt = 'pass';
  else {
    aSt = 'review'; let tt = null;
    for (let nn = tenure + 1; nn <= p.tmax; nn++) if (Math.min(floor10k(pv(headroom, rate, nn)), p.max) >= amount) { tt = nn; break; }
    aFix = `Reduce the amount to ${inr(maxAmt)}` + (tt ? `, or extend the tenure to ${tt} months.` : '. A longer tenure within product limits is not enough.');
  }
  add({ id: 'O01', cat: 'Obligations', module: 'global', src: 'policy', name: 'Requested vs eligible amount', value: `${inr(amount)} requested · ${inr(maxAmt)} eligible`, policy: `EMI capacity = ${ceiling}% × net income − obligations`, status: aSt, pos: 'Requested amount fits the eligible amount', con: aSt === 'fail' ? 'No EMI capacity left for this loan' : `Requested ${inr(amount)} is above the eligible ${inr(maxAmt)}`, fix: aFix });

  const cnt = { pass: 0, review: 0, fail: 0, na: 0, skip: 0 };
  R.forEach((r) => cnt[r.status]++);
  let key = 'pass';
  if (cnt.fail) key = 'fail'; else if (cnt.review) key = 'review'; else if (cnt.na) key = 'partial';
  const labels = { pass: 'Eligible for Loan', review: 'Eligible · credit review needed', partial: 'Eligible · partial assessment', fail: 'Not Eligible' };

  // Eligibility score (0–100): a transparent summary of the rule inputs, not an AI score.
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const parts = [
    ['Credit bureau', 0.3, clamp((lowScore - 300) / 600)],
    ['FOIR headroom', 0.25, isFinite(m.foir) ? clamp(1 - m.foir / ceiling) : 0],
    ['Stability', 0.15, is.provided ? is.pct / 100 : 0.5],
    ['Bank behaviour', 0.15, !k ? 0.5 : R.filter((r) => r.module === 'bank' && r.status !== 'skip').every((r) => r.status === 'pass') ? 1 : 0.3],
  ];
  if (biz && c.balance.enabled) { const mr = R.find((r) => r.id === 'I04')?.risk; parts.push(['Margins', 0.15, mr === 'Low' ? 1 : mr === 'Medium' ? 0.6 : 0.2]); }
  else parts.push(['Affordability', 0.15, aSt === 'pass' ? 1 : aSt === 'review' ? 0.5 : 0]);
  const tw = parts.reduce((x, p2) => x + p2[1], 0);
  const score = Math.round((parts.reduce((x, p2) => x + p2[1] * p2[2], 0) / tw) * 100);

  const missing = [];
  if (!k && c.bank.required) missing.push(['Bank statement', 'Needed for balance, bounce and income checks.']);
  is.missing.forEach((l) => missing.push([l, 'Not included in the internal score until provided.']));
  const docs = biz
    ? [['Bank statements', !!k], ['ITR file', !!d.itrFile], ['Balance sheet', !!d.bsFile], ['P&L statement', !!d.plFile]]
    : [['Bank statements', !!k], ['ITR file', !!d.itrFile]];

  return {
    key, label: labels[key], rules: R, cnt, evaluated: R.filter((r) => r.status !== 'skip').length, m, is, maxAmt, minAmt, rate, lowScore, cbBand: bandFor(lowScore)[0], headroom, ceiling, amount, tenure,
    emiReq: emi(amount, rate, tenure), emiMax: emi(maxAmt, rate, tenure), product: p, config: c, age: a, missing, docs, score, scoreParts: parts, bureau: b, bank: k,
    id: 'LS-' + (hash((d.pan || '') + amount + tenure + Date.now()) % 1e6).toString().padStart(6, '0'), at: new Date().toISOString(),
  };
}

export const CB_QUALITY = (score) => (score > 750 ? 'Good' : score >= 650 ? 'Fair' : 'Poor');

// A compact, PII-free view of the result — the ONLY case data the explanation / chat AI receives.
export function aiCaseView(r, d) {
  const mask = (x) => (['C02', 'C05', 'C06'].includes(x.id) ? '[masked]' : x.value);
  return {
    configuration: `${r.config.id} v${r.config.version}`, product: r.product.id, loan_type: r.product.loanType, applicant_type: d.applicantType, customer_type: d.customerType,
    decision: r.key, decision_label: r.label, eligibility_score_pct: r.score,
    requested: { amount_inr: r.amount, tenure_months: r.tenure }, indicative_range_inr: r.key !== 'fail' ? [r.minAmt, r.maxAmt] : null, indicative_rate_pct: r.rate,
    lowest_bureau_score: r.lowScore, foir_pct: isFinite(r.m.foir) ? +r.m.foir.toFixed(1) : null, net_monthly_income_inr: r.m.net,
    margins: r.m.biz ? { ebitda_pct: r.m.ebitdaM != null ? +r.m.ebitdaM.toFixed(1) : null, pat_pct: r.m.patM != null ? +r.m.patM.toFixed(1) : null } : undefined,
    documents: Object.fromEntries(r.docs.map(([k2, v2]) => [k2, v2 ? 'provided' : 'not provided'])), bank_statement_months: r.bank?.months ?? 0,
    rules: r.rules.map((x) => ({ id: x.id, category: x.cat, check: x.name, value: mask(x), threshold: x.policy, outcome: x.status === 'skip' ? 'not_required' : x.status, reason: x.status === 'pass' ? x.pos : x.status === 'skip' ? x.value : x.con })),
    missing_information: r.missing.map((x) => x[0]),
    bre_suggestions: r.rules.filter((x) => ['review', 'fail', 'na'].includes(x.status) && x.fix).map((x) => x.fix),
  };
}
