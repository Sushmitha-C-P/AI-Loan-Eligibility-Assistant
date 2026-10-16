// Validation for a configuration. errors block publishing; warnings are shown as "Needs your attention".
import { BUREAUS, CB_PARAMS, productById, RULE_FIELDS } from './master.js';

const isNum = (v) => v !== '' && v != null && !isNaN(Number(v));
const intIn = (v, lo, hi) => isNum(v) && Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi;
const numIn = (v, lo, hi) => isNum(v) && Number(v) >= lo && Number(v) <= hi;
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

export const MODULE_OF = (path) => path.split('.')[0];

export function validateScope(scope, all, selfId) {
  const e = {};
  if (!scope.applicantTypes.length) e['scope.applicantTypes'] = 'Select at least one applicant type.';
  if (!scope.customerTypes.length) e['scope.customerTypes'] = 'Select at least one customer type.';
  if (!scope.productId) e['scope.productId'] = 'Select the product.';
  const p = productById(scope.productId);
  if (p) {
    const bad = scope.applicantTypes.filter((t) => !p.types.includes(t));
    if (bad.length) e['scope.applicantTypes'] = `${p.id} is not offered to ${bad.join(' / ')} applicants.`;
    const clash = all.find((x) => x.id !== selfId && x.active && x.scope.productId === scope.productId
      && x.scope.applicantTypes.some((k) => scope.applicantTypes.includes(k)) && x.scope.customerTypes.some((k) => scope.customerTypes.includes(k)));
    if (clash) e['scope.productId'] = `${clash.id} already covers ${scope.productId} for ${clash.scope.applicantTypes.join('/')} · ${clash.scope.customerTypes.join('/')}. Edit it or make it inactive first.`;
  }
  return e;
}

export function validateModules(m, scope) {
  const e = {}; const w = [];
  const prod = productById(scope?.productId);
  const hasBiz = scope?.applicantTypes?.includes('Business');
  const hasInd = scope?.applicantTypes?.includes('Individual');

  // ---- Global rules
  const g = m.global;
  if (g.ageRequired) {
    if (!isNum(g.minAge)) e['global.minAge'] = 'Enter the minimum age.';
    else if (!intIn(g.minAge, 18, 100)) e['global.minAge'] = 'Minimum age must be a whole number from 18 to 100.';
    if (g.maxAge !== '' && !intIn(g.maxAge, 18, 100)) e['global.maxAge'] = 'Maximum age must be a whole number from 18 to 100.';
    else if (g.maxAge !== '' && isNum(g.minAge) && Number(g.maxAge) <= Number(g.minAge)) e['global.maxAge'] = 'Maximum age must be more than the minimum age.';
  } else w.push({ module: 'global', text: 'Age check is off. Every application will skip the age gate.' });
  if (g.vintageRequired) {
    if (g.minVintage === '' && g.maxVintage === '') e['global.minVintage'] = 'Enter a minimum or maximum business vintage.';
    if (g.minVintage !== '' && !numIn(g.minVintage, 0, 100)) e['global.minVintage'] = 'Vintage must be 0–100 years.';
    if (g.maxVintage !== '' && !numIn(g.maxVintage, 0, 100)) e['global.maxVintage'] = 'Vintage must be 0–100 years.';
    else if (g.maxVintage !== '' && isNum(g.minVintage) && Number(g.maxVintage) < Number(g.minVintage)) e['global.maxVintage'] = "Maximum vintage can't be less than the minimum.";
  } else if (hasBiz) w.push({ module: 'global', text: 'Business applicants are in scope but business vintage is not checked.' });
  const badPins = g.negativePincodes.filter((p) => !/^[1-9]\d{5}$/.test(p));
  if (badPins.length) e['global.negativePincodes'] = `Invalid PIN code${badPins.length > 1 ? 's' : ''}: ${badPins.slice(0, 5).join(', ')}.`;
  g.rules.forEach((r, i) => {
    if (!r.enabled) return;
    if (!isNum(r.value)) e[`global.rules.${i}.value`] = 'Enter a number for this rule.';
    if (!r.appliesTo.length) e[`global.rules.${i}.appliesTo`] = 'Choose Individual, Business or both.';
    const dup = g.rules.findIndex((x, j) => j < i && x.enabled && x.field === r.field && x.op === r.op && x.value === r.value && x.onFail === r.onFail);
    if (dup >= 0) e[`global.rules.${i}.value`] = `Same as rule ${dup + 1}. Remove one of them.`;
    if (r.field === 'foir' && isNum(r.value) && Number(r.value) > 100) e[`global.rules.${i}.value`] = 'FOIR is a percentage (0–100).';
    if (r.field === 'internalScore' && isNum(r.value) && Number(r.value) > 100) e[`global.rules.${i}.value`] = 'Internal score is a percentage (0–100).';
  });
  if (!g.rules.some((r) => r.enabled && r.field === 'foir')) w.push({ module: 'global', text: 'No FOIR rule. Affordability will use the default 50% FOIR ceiling.' });

  // ---- Credit bureau
  const b = m.bureau;
  BUREAUS.forEach(({ key, third, label }) => {
    const s = b.vendors[key]; if (!s.required) return;
    if (!isNum(s.applicantMin)) e[`bureau.vendors.${key}.applicantMin`] = `Enter the ${label} applicant minimum score.`;
    else if (!intIn(s.applicantMin, 300, 900)) e[`bureau.vendors.${key}.applicantMin`] = 'Credit score must be a whole number from 300 to 900.';
    if (s.directorMin !== '' && !intIn(s.directorMin, 300, 900)) e[`bureau.vendors.${key}.directorMin`] = 'Credit score must be 300–900.';
    if (third === 'maxCmrRank' && s.maxCmrRank !== '' && !intIn(s.maxCmrRank, 1, 10)) e[`bureau.vendors.${key}.maxCmrRank`] = 'CMR rank is 1 (best) to 10 (worst).';
    if (third === 'businessMin' && s.businessMin !== '' && !intIn(s.businessMin, 300, 900)) e[`bureau.vendors.${key}.businessMin`] = 'Business score must be 300–900.';
  });
  if (!BUREAUS.some(({ key }) => b.vendors[key].required)) e['bureau.vendors'] = 'Select at least one bureau vendor.';
  b.params.forEach((p, i) => {
    if (!p.enabled) return;
    const unit = CB_PARAMS.find((x) => x.key === p.key)?.unit;
    if (!isNum(p.max) || Number(p.max) < 0) e[`bureau.params.${i}.max`] = 'Enter a maximum (0 or more).';
    else if (unit !== 'inr' && !Number.isInteger(Number(p.max))) e[`bureau.params.${i}.max`] = 'Use a whole number.';
  });
  const off = b.params.filter((p) => !p.enabled).length;
  if (off) w.push({ module: 'bureau', text: `${off} of ${b.params.length} bureau report parameters have no threshold and are capture-only.` });
  if (b.assetClassRequired && !b.assetClasses.length) e['bureau.assetClasses'] = 'Select at least one asset classification to reject.';
  if (b.negativeStatusRequired && !b.negativeStatuses.length) e['bureau.negativeStatuses'] = 'Select at least one status to reject.';
  if (prod?.loanType === 'Unsecured' && !b.assetClassRequired) w.push({ module: 'bureau', text: 'SMA / NPA check is off for an unsecured product.' });

  // ---- Bank statement analyzer
  const k = m.bank;
  if (k.required) {
    if (!k.bands.length) e['bank.bands'] = 'Add at least one loan band.';
    let prev = 0;
    k.bands.forEach((bd, i) => {
      const last = i === k.bands.length - 1;
      if (bd.upTo === '' && !last) e[`bank.bands.${i}.upTo`] = 'Only the last band can be open-ended.';
      else if (bd.upTo !== '' && (!intIn(bd.upTo, 1, 1e10) || Number(bd.upTo) <= prev)) e[`bank.bands.${i}.upTo`] = `Enter an amount above ${inr(prev)}.`;
      if (!isNum(bd.minAvgBalance) || Number(bd.minAvgBalance) < 0) e[`bank.bands.${i}.minAvgBalance`] = 'Enter the minimum average closing balance.';
      if (!intIn(bd.maxBounces, 0, 100)) e[`bank.bands.${i}.maxBounces`] = 'Enter the maximum inward bounces (0 or more).';
      if (bd.upTo !== '') prev = Number(bd.upTo);
    });
    const lastUp = k.bands.length ? k.bands[k.bands.length - 1].upTo : null;
    if (prod && lastUp !== '' && lastUp != null && Number(lastUp) < prod.max) w.push({ module: 'bank', text: `No bank threshold above ${inr(lastUp)}. Larger ${prod.id} applications (up to ${inr(prod.max)}) will be flagged for manual review.` });
    if (!numIn(k.incomeVariance, 1, 5)) e['bank.incomeVariance'] = 'Enter a ratio from 1 to 5 (e.g. 1.25).';
  } else w.push({ module: 'bank', text: 'Bank statement checks are off.' });

  // ---- Tax & ITR
  const t = m.tax;
  const from = t.itrSkipFrom, to = t.itrSkipTo;
  if ((from === '') !== (to === '')) e[from === '' ? 'tax.itrSkipFrom' : 'tax.itrSkipTo'] = 'Enter both ends of the ITR skip range, or leave both blank.';
  if (from !== '' && !intIn(from, 0, 1e10)) e['tax.itrSkipFrom'] = 'Enter a whole rupee amount.';
  if (to !== '' && !intIn(to, 0, 1e10)) e['tax.itrSkipTo'] = 'Enter a whole rupee amount.';
  else if (from !== '' && to !== '' && Number(to) <= Number(from)) e['tax.itrSkipTo'] = '"To" must be more than "From".';
  if (prod && to !== '' && Number(to) >= prod.max) w.push({ module: 'tax', text: `The ITR skip range covers every ${prod.id} amount, so ITR is never checked.` });
  if (t.itrBusinessRequired && !hasBiz) e['tax.itrBusinessRequired'] = "Business ITR can't be required when the scope has no Business applicants.";
  if (!Object.values(t.incomeHeads).some(Boolean)) e['tax.incomeHeads'] = 'Include at least one income head.';
  if (t.minAnnualItrIncome !== '' && !intIn(t.minAnnualItrIncome, 0, 1e10)) e['tax.minAnnualItrIncome'] = 'Enter a whole rupee amount.';
  if (t.gstRequired) { if (!isNum(t.minGstScore)) e['tax.minGstScore'] = 'Enter the minimum GST compliance score.'; else if (!numIn(t.minGstScore, 0, 100)) e['tax.minGstScore'] = 'Score must be 0–100.'; }
  if (t.gstRequired && !hasBiz) w.push({ module: 'tax', text: 'GST check is on but only Individual applicants are in scope.' });

  // ---- Balance sheet
  const s = m.balance;
  if (s.enabled) {
    ['ebitdaHigh', 'ebitdaLow', 'patHigh', 'patLow'].forEach((f) => { if (!numIn(s[f], -100, 100)) e[`balance.${f}`] = 'Enter a percentage.'; });
    if (isNum(s.ebitdaHigh) && isNum(s.ebitdaLow) && Number(s.ebitdaLow) <= Number(s.ebitdaHigh)) e['balance.ebitdaLow'] = 'Low-risk cut-off must be above the high-risk cut-off.';
    if (isNum(s.patHigh) && isNum(s.patLow) && Number(s.patLow) <= Number(s.patHigh)) e['balance.patLow'] = 'Low-risk cut-off must be above the high-risk cut-off.';
    if (!hasBiz) w.push({ module: 'balance', text: 'Balance sheet checks only apply to Business applicants, and none are in scope.' });
  } else if (hasBiz) w.push({ module: 'balance', text: 'Business applicants are in scope but balance sheet margins are not checked.' });
  if (hasInd && !t.itrApplicantRequired) w.push({ module: 'tax', text: 'Individual applicants are in scope but applicant ITR is not required.' });
  return { errors: e, warnings: w };
}

export const fieldLabel = (key) => RULE_FIELDS.find((f) => f.key === key)?.label || key;
