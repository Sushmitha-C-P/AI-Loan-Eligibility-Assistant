// Loan eligibility configurations. Each record has a product scope, a working DRAFT and the PUBLISHED copy.
// The rules engine only ever reads the published copy of an active configuration.
import { useSyncExternalStore } from 'react';
import { CB_PARAMS } from './master.js';

const KEY = 'loaneligibilitycheck.configs.v3';
const uid = () => Math.random().toString(36).slice(2, 9);

export function blankModules() {
  return {
    global: {
      ageRequired: true, minAge: '21', maxAge: '',
      vintageRequired: false, minVintage: '', maxVintage: '',
      udyamRequired: false,
      negativePincodes: [],
      rules: [],
    },
    bureau: {
      vendors: {
        cibil: { required: false, applicantMin: '', directorMin: '', maxCmrRank: '' },
        equifax: { required: false, applicantMin: '', directorMin: '', businessMin: '' },
        highmark: { required: false, applicantMin: '', directorMin: '', businessMin: '' },
        experian: { required: false, applicantMin: '', directorMin: '', businessMin: '' },
      },
      params: CB_PARAMS.map((p) => ({ key: p.key, enabled: false, max: '', band: 'all' })),
      assetClassRequired: false, assetClasses: [],
      negativeStatusRequired: false, negativeStatuses: [],
    },
    bank: { required: true, bands: [], incomeVariance: '1.25' },
    tax: {
      itrApplicantRequired: false, itrBusinessRequired: false, itrSkipFrom: '', itrSkipTo: '',
      incomeHeads: { salary: true, business: true, house: true, capital: false, other: true },
      minAnnualItrIncome: '',
      gstRequired: false, minGstScore: '',
    },
    balance: { enabled: false, ebitdaHigh: '12', ebitdaLow: '25', patHigh: '5', patLow: '10', onHighRisk: 'review' },
  };
}
export const newRule = (over = {}) => ({ id: uid(), enabled: true, field: 'foir', op: 'lt', value: '', appliesTo: ['Individual', 'Business'], onFail: 'reject', ...over });
export const newBand = (over = {}) => ({ id: uid(), upTo: '', minAvgBalance: '', maxBounces: '', ...over });

const merge = (base, over) => {
  if (Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] ? merge(base[k], over[k]) : over[k];
  return out;
};
const withParams = (m, set) => ({ ...m, bureau: { ...m.bureau, params: m.bureau.params.map((p) => (set[p.key] ? { ...p, enabled: true, ...set[p.key] } : p)) } });

const COMMON_RULES = () => [
  newRule({ field: 'foir', op: 'lt', value: '50', onFail: 'reject' }),
  newRule({ field: 'foir', op: 'lt', value: '40', onFail: 'review' }),
  newRule({ field: 'internalScore', op: 'gte', value: '50', onFail: 'reject' }),
  newRule({ field: 'netIncome', op: 'gte', value: '15000', onFail: 'reject' }),
];
const REPORT = { assetClassRequired: true, assetClasses: ['SMA', 'Sub Standard', 'Doubtful (DBT)', 'Loss'], negativeStatusRequired: true, negativeStatuses: ['Suit Filed', 'Wilful Defaulter'] };
const NEG_PINS = ['400072', '110094', '625001'];

function seed() {
  const now = new Date(2026, 8, 24).toISOString();
  const mk = (id, scope, over, params) => {
    const m = withParams(merge(blankModules(), over), params);
    return { id, active: true, scope, draft: m, published: JSON.parse(JSON.stringify(m)), version: 1, publishedAt: now, updatedAt: now };
  };
  return [
    mk('CFG-001', { applicantTypes: ['Individual'], customerTypes: ['New', 'Existing'], productId: 'Personal Loan' }, {
      global: { ageRequired: true, minAge: '21', maxAge: '60', negativePincodes: NEG_PINS, rules: COMMON_RULES() },
      bureau: { vendors: { cibil: { required: true, applicantMin: '650' }, highmark: { required: true, applicantMin: '650' } }, ...REPORT },
      bank: { required: true, bands: [newBand({ upTo: '500000', minAvgBalance: '15000', maxBounces: '0' }), newBand({ upTo: '1000000', minAvgBalance: '20000', maxBounces: '0' })], incomeVariance: '1.25' },
      tax: { itrApplicantRequired: true, itrSkipFrom: '0', itrSkipTo: '1000000' },
    }, { overdue: { max: '1' }, dpd: { max: '30' }, enquiries90: { max: '3' }, writtenOffAccounts: { max: '0' }, settledAccounts: { max: '0' } }),
    mk('CFG-002', { applicantTypes: ['Business'], customerTypes: ['New', 'Existing'], productId: 'Business Loan' }, {
      global: { ageRequired: true, minAge: '21', maxAge: '65', vintageRequired: true, minVintage: '3', negativePincodes: NEG_PINS, rules: [COMMON_RULES()[0], COMMON_RULES()[2]] },
      bureau: { vendors: { cibil: { required: true, applicantMin: '700', directorMin: '700', maxCmrRank: '6' }, highmark: { required: true, applicantMin: '680', businessMin: '650' } }, ...REPORT },
      bank: { required: true, bands: [newBand({ upTo: '500000', minAvgBalance: '15000', maxBounces: '0' }), newBand({ upTo: '1000000', minAvgBalance: '20000', maxBounces: '0' }), newBand({ upTo: '5000000', minAvgBalance: '50000', maxBounces: '1' })], incomeVariance: '1.25' },
      tax: { itrApplicantRequired: true, itrBusinessRequired: true, gstRequired: true, minGstScore: '60' },
      balance: { enabled: true, ebitdaHigh: '12', ebitdaLow: '25', patHigh: '5', patLow: '10', onHighRisk: 'review' },
    }, { overdue: { max: '1' }, dpd: { max: '30' }, enquiries90: { max: '3' }, inquiries6m: { max: '6' }, writtenOffAccounts: { max: '0' }, settledAccounts: { max: '0' } }),
    mk('CFG-003', { applicantTypes: ['Individual', 'Business'], customerTypes: ['New', 'Existing'], productId: 'Enterprise Loan Monthly' }, {
      global: { ageRequired: true, minAge: '18', maxAge: '70', vintageRequired: true, minVintage: '2', maxVintage: '50', negativePincodes: NEG_PINS, rules: [COMMON_RULES()[0], COMMON_RULES()[2]] },
      bureau: { vendors: { cibil: { required: true, applicantMin: '700', directorMin: '700', maxCmrRank: '6' }, highmark: { required: true, applicantMin: '680', directorMin: '680', businessMin: '650' } }, ...REPORT },
      bank: { required: true, bands: [newBand({ upTo: '500000', minAvgBalance: '15000', maxBounces: '0' }), newBand({ upTo: '1000000', minAvgBalance: '20000', maxBounces: '0' })], incomeVariance: '1.25' },
      tax: { itrApplicantRequired: true, itrBusinessRequired: true, itrSkipFrom: '0', itrSkipTo: '500000', gstRequired: true, minGstScore: '60' },
      balance: { enabled: true },
    }, { overdue: { max: '1' }, dpd: { max: '30' }, enquiries90: { max: '3' } }),
  ];
}

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(s) && s.length) return s; } catch (_) { /* ignore */ }
  return seed();
}
let configs = load();
const subs = new Set();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(configs)); } catch (_) { /* ignore */ } subs.forEach((f) => f()); };

export const useConfigs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => configs);
export const getConfigs = () => configs;
export const getConfig = (id) => configs.find((c) => c.id === id);
export const isDirty = (c) => !c.published || JSON.stringify(c.draft) !== JSON.stringify(c.published);

export function createConfig(scope, modules) {
  const n = Math.max(0, ...configs.map((x) => parseInt(String(x.id).replace(/\D/g, ''), 10) || 0)) + 1;
  const c = { id: 'CFG-' + String(n).padStart(3, '0'), active: true, scope, draft: modules || blankModules(), published: null, version: 0, publishedAt: null, updatedAt: new Date().toISOString() };
  configs = [...configs, c]; emit(); return c;
}
export function saveDraft(id, draft) { configs = configs.map((c) => (c.id === id ? { ...c, draft, updatedAt: new Date().toISOString() } : c)); emit(); }
export function saveScope(id, scope) { configs = configs.map((c) => (c.id === id ? { ...c, scope, updatedAt: new Date().toISOString() } : c)); emit(); }
export function publish(id) {
  const now = new Date().toISOString();
  configs = configs.map((c) => (c.id === id ? { ...c, published: JSON.parse(JSON.stringify(c.draft)), version: (c.version || 0) + 1, publishedAt: now, updatedAt: now } : c)); emit();
}
export function discardDraft(id) { configs = configs.map((c) => (c.id === id && c.published ? { ...c, draft: JSON.parse(JSON.stringify(c.published)) } : c)); emit(); }
export function setActive(ids, active) { configs = configs.map((x) => (ids.includes(x.id) ? { ...x, active, updatedAt: new Date().toISOString() } : x)); emit(); }
export function resetConfigs() { configs = seed(); emit(); }

/** The published, active configuration that applies to an application (or null). */
export function findConfig({ applicantType, customerType, productId }) {
  const c = configs.find((x) => x.active && x.published && x.scope.productId === productId && x.scope.applicantTypes.includes(applicantType) && x.scope.customerTypes.includes(customerType));
  return c ? { id: c.id, version: c.version, scope: c.scope, ...c.published } : null;
}
/** Same shape as findConfig, but for a draft being previewed in the console. */
export const asRuntime = (c, which = 'draft') => ({ id: c.id, version: c.version, scope: c.scope, ...c[which] });
