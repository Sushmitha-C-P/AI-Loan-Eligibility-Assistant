// App-wide state: AI settings, toast, and the RM's current loan application.
import { createContext, useContext, useMemo, useState, useCallback, useRef } from 'react';
import { VAL, validateStep, stepFields, isBusiness } from './engine/validation.js';
import { runBRE } from './engine/bre.js';
import { SAMPLES, mockBureau, mockBank, mockGst } from './engine/mocks.js';
import { pinLookup, productById } from './engine/master.js';
import { num } from './engine/format.js';
import { upsertApp, getApp, nextAppId, statusFromKey } from './engine/appsStore.js';
import { loadSettings, saveSettings } from './ai/settings.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const V0 = { id: false, pan: false, mobile: false, udyam: false, gstin: false };
export function initialState(appId = null) {
  return {
    appId, step: 0, maxStep: 0,
    d: { applicantType: 'Individual', customerType: 'New', idType: 'aadhaar', country: 'India' },
    v: { ...V0 }, ai: {}, auto: {},
    bureau: null, bureauPan: null, gst: null, bank: null, bankSkipped: false,
    errors: {}, result: null, loanAtRun: null, decision: null, sample: '', reevaluated: false,
  };
}
// Identity & contact fields: never taken from the AI; loaded as "already verified" for demo customers.
const IDENTITY = ['applicantType', 'fullName', 'dob', 'idType', 'idNumber', 'pan', 'businessName', 'udyam', 'gstin', 'mobile', 'email', 'pincode', 'address', 'city', 'state', 'country', 'consent'];
const INCOME = ['salary', 'business', 'house', 'capital', 'other'];

export function AppProvider({ children, user }) {
  const [s, setS] = useState(() => initialState());
  const sRef = useRef(s);
  const userRef = useRef(user); userRef.current = user;
  const commit = useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(sRef.current) : { ...sRef.current, ...patch };
    sRef.current = next; setS(next); return next;
  }, []);

  const [settings, setSettingsState] = useState(loadSettings);
  const [aiHealth, setAiHealth] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const toastT = useRef();
  const toast = useCallback((msg) => { setToastMsg(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 7000); }, []);

  const actions = useMemo(() => {
    const persist = (st, status) => { if (!st.appId) return; upsertApp(st.appId, st, status, userRef.current?.email); };
    const withBureau = (st) => {
      const biz = isBusiness(st.d);
      const samePan = st.bureauPan === st.d.pan;
      return { ...st, bureau: samePan && st.bureau ? st.bureau : mockBureau(st.d.pan, biz), bureauPan: st.d.pan, gst: biz && st.d.gstin ? mockGst(st.d.pan, st.d.gstin) : null, bank: samePan ? st.bank : null, bankSkipped: samePan ? st.bankSkipped : false };
    };
    const evaluate = (st) => ({ ...st, result: runBRE(st), loanAtRun: [num(st.d.amount), Number(st.d.tenure)], step: 3, maxStep: 3 });

    return {
      setField(id, value) {
        commit((st) => {
          const d = { ...st.d, [id]: value }; const v = { ...st.v }; const auto = { ...st.auto };
          if (id === 'idType') { d.idNumber = ''; v.id = false; }
          if (id === 'idNumber') v.id = false;
          if (id === 'pan') v.pan = false;
          if (id === 'mobile') v.mobile = false;
          if (id === 'udyam') v.udyam = false;
          if (id === 'gstin') v.gstin = false;
          if (id === 'applicantType') { const p = productById(d.productId); if (p && !p.types.includes(value)) d.productId = ''; v.id = false; }
          if (id === 'pincode') {
            const hit = pinLookup(value);
            if (hit) { if (hit.city && (!d.city || auto.city)) { d.city = hit.city; auto.city = true; } if (!d.state || auto.state) { d.state = hit.state; auto.state = true; } }
          }
          if (id === 'city') auto.city = false;
          if (id === 'state') auto.state = false;
          const ai = { ...st.ai }; delete ai[id];
          const errors = { ...st.errors };
          if (errors[id]) errors[id] = VAL[id] ? VAL[id](value, d) : '';
          if (['applicantType', 'customerType', 'productId'].includes(id)) { errors.configMatch = ''; if (errors.productId) errors.productId = VAL.productId(d.productId, d); }
          if (id === 'pincode') { if (auto.city) errors.city = ''; if (auto.state) errors.state = ''; }
          if (INCOME.includes(id) && errors.incomeAny) errors.incomeAny = VAL.incomeAny(null, d);
          if (id === 'turnover' && errors.totalIncome) errors.totalIncome = VAL.totalIncome(d.totalIncome, d);
          return { ...st, d, v, ai, auto, errors, gst: id === 'gstin' ? null : st.gst };
        });
      },
      validateField(id) { commit((st) => ({ ...st, errors: { ...st.errors, [id]: VAL[id] ? VAL[id](st.d[id], st.d) : '' } })); },
      setErrors(errs) { commit((st) => ({ ...st, errors: { ...st.errors, ...errs } })); },
      setVerified(key, val) { commit((st) => ({ ...st, v: { ...st.v, [key]: val }, errors: { ...st.errors, [key === 'id' ? 'idNumber' : key]: '' } })); },
      applyAiFields(fields) {
        commit((st) => {
          const d = { ...st.d, ...fields }; const ai = { ...st.ai }; const errors = { ...st.errors };
          Object.keys(fields).forEach((k) => { ai[k] = true; errors[k] = ''; });
          const p = productById(d.productId); if (p && d.applicantType && !p.types.includes(d.applicantType)) d.productId = '';
          return { ...st, d, ai, errors };
        });
      },
      checkStep(n) {
        const errs = validateStep(n, sRef.current);
        commit((st) => { const errors = { ...st.errors }; [...stepFields(n, st.d), 'bank'].forEach((k) => { errors[k] = ''; }); return { ...st, errors: { ...errors, ...errs } }; });
        return Object.keys(errs).length === 0;
      },
      goStep(n) { const st = commit((x) => ({ ...x, step: n, maxStep: Math.max(x.maxStep, n) })); persist(st); window.scrollTo({ top: 0, behavior: 'smooth' }); },
      /** Leaving step 1: pull the credit bureau (and GST score) for this PAN, then open the bank statement step. */
      pullBureauAndContinue() { const st = commit((x) => ({ ...withBureau(x), step: 1, maxStep: Math.max(x.maxStep, 1) })); persist(st); window.scrollTo({ top: 0, behavior: 'smooth' }); },
      setBank(bank) { commit((st) => ({ ...st, bank, bankSkipped: false, errors: { ...st.errors, bank: '' } })); },
      skipBank() { commit((st) => ({ ...st, bank: null, bankSkipped: true, errors: { ...st.errors, bank: '' } })); },
      clearBank() { commit((st) => ({ ...st, bank: null, bankSkipped: false })); },
      runCheck() { const st = commit((x) => ({ ...evaluate(x), decision: null, reevaluated: false })); persist(st, statusFromKey(st.result.key)); window.scrollTo({ top: 0, behavior: 'smooth' }); },
      whatIf(amount, tenure) { commit((st) => { const n = { ...st, d: { ...st.d, amount: String(amount), tenure: String(tenure) } }; return { ...n, result: runBRE(n) }; }); },
      decide(status, remarks) {
        const st = commit((x) => ({ ...x, decision: { status, remarks, at: new Date().toISOString(), by: userRef.current?.email } }));
        persist(st, status);
      },
      newApplication() { commit(initialState(nextAppId())); },
      openApplication(id) {
        const rec = getApp(id); if (!rec) return;
        let st = { ...initialState(id), ...JSON.parse(JSON.stringify(rec.state)), bureauPan: rec.state.d.pan };
        if (st.maxStep >= 3) { try { st = { ...evaluate(st), step: st.step, reevaluated: true }; } catch (_) { st.maxStep = 2; } }
        commit(st);
      },
      loadSample(key) {
        const keep = sRef.current.appId || nextAppId();
        const base = initialState(keep);
        if (key) {
          const smp = SAMPLES[key];
          base.d = { ...base.d, ...JSON.parse(JSON.stringify(smp.d)) };
          base.v = { id: true, pan: true, mobile: true, udyam: !!base.d.udyam, gstin: !!base.d.gstin };
          Object.assign(base, withBureau(base));
          base.bank = { ...mockBank(base.d.pan, 6), source: 'aa', aggregator: 'Ignosis', accounts: 1 };
          base.maxStep = 2; base.sample = key;
        }
        commit(base);
      },
      /** Verified identity only; the AI quick fill supplies everything else from the RM's note. */
      loadIdentityOnly(key) {
        const smp = SAMPLES[key]; const base = initialState(sRef.current.appId || nextAppId());
        IDENTITY.forEach((k) => { if (smp.d[k] != null) base.d[k] = smp.d[k]; });
        base.v = { id: true, pan: true, mobile: true, udyam: !!smp.d.udyam, gstin: !!smp.d.gstin }; base.sample = key;
        commit(base);
      },
      /** Demo shortcut: validate every step and jump to the decision, stopping at the first step with errors. */
      runToResult() {
        let st = { ...sRef.current };
        for (const n of [0, 1, 2]) {
          if (n === 1) { st = withBureau(st); if (!st.bank && !st.bankSkipped) st.bank = { ...mockBank(st.d.pan, 6), source: 'aa', aggregator: 'Ignosis', accounts: 1 }; continue; }
          const errs = validateStep(n, st);
          if (Object.keys(errs).length) { commit({ ...st, step: n, maxStep: Math.max(st.maxStep, n), errors: { ...st.errors, ...errs } }); window.scrollTo({ top: 0 }); return false; }
        }
        const done = commit({ ...evaluate(st), decision: null, reevaluated: false });
        persist(done, statusFromKey(done.result.key));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      },
    };
  }, [commit]);

  const setSettings = useCallback((next) => { setSettingsState(next); saveSettings(next); setAiHealth(null); }, []);
  const value = { s, ...actions, settings, setSettings, aiHealth, setAiHealth, toast, toastMsg, user };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
