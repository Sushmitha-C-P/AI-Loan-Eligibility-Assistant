// Step 3 · Financial details. Individual: monthly income by ITR head, expenses, stability.
// Business: annual P&L figures, business profile, uploads. Obligations always come from the bureau (never re-typed).
import { useApp } from '../store.jsx';
import { stepFields, isBusiness, ageOf, vintageOf, configOf } from '../engine/validation.js';
import { moneyCalc, internalScore } from '../engine/bre.js';
import { STABILITY_BANDS, HOUSE_TYPES, PREMISES, INDUSTRIES, ITR_HEADS, EXPENSE_HEADS, BUREAUS } from '../engine/master.js';
import { inr, pct } from '../engine/format.js';
import { Field, Input, Select, ErrorSummary, StepHeader } from '../components/ui.jsx';
import DataReview from '../components/DataReview.jsx';
import BottomBar from './BottomBar.jsx';

const BANDS = STABILITY_BANDS.map((b) => ({ value: b.key, label: `${b.label} · ${b.pts} pts` }));

function YesNo({ id }) {
  const { s, setField } = useApp();
  return (
    <div className={`tabs${s.errors[id] ? ' badtabs' : ''}`} role="radiogroup" style={{ alignSelf: 'flex-start' }}>
      {['Yes', 'No'].map((x) => <button key={x} type="button" role="radio" aria-checked={s.d[id] === x} aria-pressed={s.d[id] === x} id={x === 'Yes' ? id : undefined} onClick={() => setField(id, x)}>{x}{s.ai[id] && s.d[id] === x ? ' · AI' : ''}</button>)}
    </div>
  );
}

function Upload({ id, label }) {
  const { s, setField } = useApp();
  const name = s.d[id];
  return (
    <label className={`upl${name ? ' has' : ''}`}>
      <input type="file" accept="application/pdf,.pdf,image/*" onChange={(e) => { const f = e.target.files[0]; if (f) setField(id, f.name); }} aria-label={label} />
      <b>{label}</b>
      <span className={name ? 'ok-t' : 'hint'}>{name ? `✓ ${name}` : 'PDF or image · optional'}</span>
    </label>
  );
}

function BureauCard() {
  const { s } = useApp();
  const b = s.bureau; if (!b) return null;
  const cfg = configOf(s.d);
  const req = BUREAUS.filter((x) => cfg?.bureau.vendors[x.key].required);
  const list = req.length ? req : BUREAUS;
  const emis = b.loans.reduce((a, l) => a + l.emi, 0);
  const any = b.by[list[0].key];
  return (
    <div className="card tint">
      <div className="gh" style={{ marginBottom: 8 }}><h3>Credit bureau <span className="src auto">Auto-fetched</span></h3><span className="hint">Pulled for PAN on step 1 · obligations are taken from here</span></div>
      <div className="kv">
        {list.map((x) => <div key={x.key}><span>{x.label}</span><strong>{b.by[x.key].score}</strong></div>)}
        <div><span>Active loans</span><strong>{b.loans.length}</strong></div>
        <div><span>Existing EMIs / month</span><strong>{inr(emis)}</strong></div>
        <div><span>Enquiries · 90 days</span><strong>{any.enquiries90}</strong></div>
      </div>
      {b.loans.length > 0 && <p className="hint" style={{ marginTop: 8 }}>{b.loans.map((l) => `${l.type} (${l.lender}) ${inr(l.emi)}/m`).join(' · ')}</p>}
    </div>
  );
}

function LiveCalc() {
  const { s } = useApp();
  const cfg = configOf(s.d);
  const m = moneyCalc(s.d, s.bureau, cfg); const is = internalScore(s.d);
  const foirRule = cfg?.global.rules.find((r) => r.enabled && r.field === 'foir' && r.onFail === 'reject');
  const ceil = foirRule ? Number(foirRule.value) : 50;
  const tone = !isFinite(m.foir) ? 'bad-t' : m.foir < ceil * 0.8 ? 'ok-t' : m.foir < ceil ? '' : 'bad-t';
  const risk = (v, hi, lo) => (v == null ? '—' : v < Number(hi) ? 'High' : v > Number(lo) ? 'Low' : 'Medium');
  return (
    <div className="card">
      <div className="gh" style={{ marginBottom: 10 }}><h3>Live calculation</h3><span className="hint">Updates as you type · the rules engine recalculates on submit</span></div>
      {m.biz ? (
        <div className="calc">
          <div><span>EBITDA (annual)</span><strong>{inr(m.ebitda)}</strong></div>
          <div><span>EBITDA margin</span><strong>{m.ebitdaM == null ? '—' : pct(m.ebitdaM)}</strong>{cfg?.balance.enabled && <em className="hint">{risk(m.ebitdaM, cfg.balance.ebitdaHigh, cfg.balance.ebitdaLow)} risk</em>}</div>
          <div><span>PAT margin</span><strong>{m.patM == null ? '—' : pct(m.patM)}</strong>{cfg?.balance.enabled && <em className="hint">{risk(m.patM, cfg.balance.patHigh, cfg.balance.patLow)} risk</em>}</div>
          <div><span>Monthly surplus</span><strong>{inr(m.gross)}</strong></div>
          <div><span>Bureau EMIs</span><strong>{inr(m.cbObl)}</strong></div>
          <div><span>FOIR</span><strong className={tone}>{pct(m.foir)}</strong><em className="hint">limit {ceil}%</em></div>
          <div><span>Internal score</span><strong>{is.provided ? `${Math.round(is.pct)}%` : '—'}</strong><em className="hint">{is.pts}/{is.max} pts</em></div>
        </div>
      ) : (
        <div className="calc">
          <div><span>Counted income</span><strong>{inr(m.gross)}</strong></div>
          <div><span>Living expenses</span><strong>{inr(m.living)}</strong></div>
          <div><span>Bureau EMIs</span><strong>{inr(m.cbObl)}</strong></div>
          <div><span>Net income</span><strong>{inr(m.net)}</strong></div>
          <div><span>FOIR</span><strong className={tone}>{pct(m.foir)}</strong><em className="hint">limit {ceil}%</em></div>
          <div><span>Internal score</span><strong>{is.provided ? `${Math.round(is.pct)}%` : '—'}</strong><em className="hint">{is.pts}/{is.max} pts · {is.provided} of {is.total}</em></div>
        </div>
      )}
      <p className="formula">{m.biz ? 'FOIR = bureau EMIs ÷ ((EBITDA − tax) ÷ 12 − EMIs) × 100' : 'FOIR = (expenses + bureau EMIs) ÷ (counted income − expenses − EMIs) × 100'}</p>
    </div>
  );
}

export default function FinancialStep({ onOpenLog }) {
  const { s, checkStep, runCheck, goStep } = useApp();
  const d = s.d; const biz = isBusiness(d);
  const cfg = configOf(d);
  const heads = cfg?.tax.incomeHeads || {};
  const age = ageOf(d); const vintage = vintageOf(d);
  const next = () => { if (!checkStep(2)) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } runCheck(); };

  return (
    <section className="panel" aria-labelledby="h-fin">
      <StepHeader n={3} title="Financial details" lede={biz ? 'Enter the business financials from the latest ITR / balance sheet. Margins and FOIR are calculated for you.' : 'Enter monthly income by ITR head and monthly expenses. Existing EMIs come from the credit bureau, so they are not typed again.'} />
      <ErrorSummary ids={stepFields(2, d)} />
      <BureauCard />

      {biz ? (
        <>
          <p className="sectitle">Documents</p>
          <div className="uploads"><Upload id="itrFile" label="ITR" /><Upload id="bsFile" label="Balance sheet" /><Upload id="plFile" label="P&L statement" /></div>
          <p className="sectitle">Business profile</p>
          <div className="grid g3">
            <Field id="industry" label="Type of industry"><Select id="industry" options={INDUSTRIES} placeholder="Select" /></Field>
            <Field id="vintage" label="Business vintage" src="auto"><div className="ro-val">{vintage != null ? `${vintage} years (since ${d.startYear})` : '—'}</div></Field>
            <Field id="premises" label="Shop / factory ownership"><Select id="premises" options={PREMISES} placeholder="Select" /></Field>
            <Field id="gstFiling" label="GST filing"><YesNo id="gstFiling" /></Field>
            <Field id="itrFiled" label="ITR filing"><YesNo id="itrFiled" /></Field>
            <Field id="tradeLicense" label="Trade license"><YesNo id="tradeLicense" /></Field>
            <Field id="resBand" label="Residential stability (promoter)"><Select id="resBand" options={BANDS} placeholder="Select" /></Field>
            <Field id="workBand" label="Working experience (promoter)"><Select id="workBand" options={BANDS} placeholder="Select" /></Field>
          </div>
          <p className="sectitle">Financials · annual</p>
          <div className="grid g3">
            <Field id="turnover" label="Annual turnover"><Input id="turnover" money prefix="₹" /></Field>
            <Field id="totalIncome" label="Total income" hint="Gross income / revenue in the P&L"><Input id="totalIncome" money prefix="₹" /></Field>
            <Field id="opex" label="Total operating expenses"><Input id="opex" money prefix="₹" /></Field>
            <Field id="depreciation" label="Depreciation" optional><Input id="depreciation" money prefix="₹" /></Field>
            <Field id="financeCost" label="Finance cost (interest)" optional><Input id="financeCost" money prefix="₹" /></Field>
            <Field id="taxPaid" label="Tax" optional><Input id="taxPaid" money prefix="₹" /></Field>
          </div>
        </>
      ) : (
        <>
          <p className="sectitle">Monthly income · by ITR head</p>
          <div className="grid g3">
            {ITR_HEADS.map((h) => (
              <Field key={h.key} id={h.key} label={h.label.replace('Income from ', '').replace(/^\w/, (c) => c.toUpperCase())} optional={heads[h.key] === false ? 'not counted by rules' : 'optional'}>
                <Input id={h.key} money prefix="₹" suffix="/ month" />
              </Field>
            ))}
            <Field id="family" label="Family income" optional hint="Earning family members, not the applicant"><Input id="family" money prefix="₹" suffix="/ month" /></Field>
          </div>
          {s.errors.incomeAny && <p className="err" style={{ marginTop: 6 }}>{s.errors.incomeAny}</p>}
          <p className="sectitle">Tax & documents</p>
          <div className="grid g3">
            <Field id="itrFiled" label="ITR filing"><YesNo id="itrFiled" /></Field>
            <Field id="itrFileBox" label="ITR upload"><Upload id="itrFile" label="ITR acknowledgement" /></Field>
            <Field id="ageAuto" label="Age" src="auto"><div className="ro-val">{age != null ? `${age} years` : '—'}</div></Field>
          </div>
          <p className="sectitle">Stability</p>
          <div className="grid">
            <Field id="resBand" label="Residential stability"><Select id="resBand" options={BANDS} placeholder="Select" /></Field>
            <Field id="workBand" label="Working experience"><Select id="workBand" options={BANDS} placeholder="Select" /></Field>
            <Field id="companyBand" label="Current company stability"><Select id="companyBand" options={BANDS} placeholder="Select" /></Field>
            <Field id="mobBand" label="Mobile number stability" optional><Select id="mobBand" options={BANDS} placeholder="Select" /></Field>
            <Field id="houseType" label="House owned"><Select id="houseType" options={HOUSE_TYPES} placeholder="Select" /></Field>
          </div>
          <p className="sectitle">Monthly expenses</p>
          <div className="grid g3">
            {EXPENSE_HEADS.map((h) => <Field key={h.key} id={h.key} label={h.label} optional><Input id={h.key} money prefix="₹" /></Field>)}
          </div>
        </>
      )}

      <p className="sectitle">Check before submitting</p>
      <LiveCalc />
      <DataReview onOpenLog={onOpenLog} />
      <BottomBar onBack={() => goStep(1)} next={next} nextLabel="Run eligibility check →" />
    </section>
  );
}

