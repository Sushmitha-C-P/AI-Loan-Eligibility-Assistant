// The five rule modules of a configuration. Every edit is saved to the DRAFT immediately;
// the RM app keeps using the PUBLISHED copy until the admin publishes.
import { useState } from 'react';
import { BUREAUS, CB_PARAMS, ASSET_CLASSES, NEGATIVE_STATUSES, LOAN_BANDS, ITR_HEADS, RULE_FIELDS, RULE_OPS, productById } from '../engine/master.js';
import { newRule, newBand } from '../engine/configStore.js';
import { inr } from '../engine/format.js';
import { useDraft, NumIn, MoneyIn, Switch, Chips, Sel, MField, Err } from './controls.jsx';
import Preview from './Preview.jsx';

export const MODULES = [
  { key: 'global', label: 'Global Rules', icon: '◎', desc: 'Checks that apply before any module: age, business vintage, Udyam, negative PIN codes, and custom rules such as FOIR and the internal stability score.' },
  { key: 'bureau', label: 'Credit Bureau', icon: '▤', desc: 'Vendor score cut-offs and the bureau report parameters (overdues, DPD, enquiries, written-off and settled accounts), asset classification and negative statuses.' },
  { key: 'bank', label: 'Bank Statement Analyzer', icon: '▦', desc: 'Minimum average closing balance and maximum inward bounces by loan-amount band, plus the declared-income check against bank credits.' },
  { key: 'tax', label: 'Tax & ITR', icon: '▧', desc: 'Which ITRs are required, the loan range where ITR is skipped, which income heads count, and the GST compliance check.' },
  { key: 'balance', label: 'Balance Sheet', icon: '◫', desc: 'EBITDA and PAT margin risk bands for business applicants, and what happens on high risk.' },
];

function Head({ mod, c, errCount, children }) {
  return (
    <div className="adm-head">
      <div><h1>{mod.label}</h1><p>{mod.desc}</p></div>
      <div className="acts">
        {errCount ? <span className="pill fail">{errCount} to fix before publishing</span> : <span className="pill pass">✓ Valid</span>}
        <span className="pill na">Autosaved to draft · {c.id}</span>
        {children}
      </div>
    </div>
  );
}
const Warn = ({ list }) => (list.length ? <div className="attn">{list.map((w, i) => <div key={i} className="note" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)', color: 'var(--ink)' }}>⚠ {w.text}</div>)}</div> : null);
const count = (errors, mod) => Object.keys(errors).filter((k) => k.startsWith(mod + '.')).length;

/* ======================= Global Rules ======================= */
export function GlobalRules({ id }) {
  const { c, m, set, errors, warnings } = useDraft(id);
  const g = m.global; const hasBiz = c.scope.applicantTypes.includes('Business');
  const [pinText, setPinText] = useState('');
  const addPins = (txt) => {
    const found = (txt.match(/\d+/g) || []).filter((x) => x.length >= 5 && x.length <= 7);
    if (!found.length) return 0;
    set('global.negativePincodes', (cur) => [...new Set([...cur, ...found])]);
    return found.length;
  };
  const upload = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => { addPins(String(r.result)); }; r.readAsText(f); };
  const rule = (i, k, v) => set(`global.rules.${i}.${k}`, v);
  const P = [...g.negativePincodes];
  return (
    <>
      <Head mod={MODULES[0]} c={c} errCount={count(errors, 'global')} />
      <Warn list={warnings.filter((w) => w.module === 'global')} />
      <section className="mcard">
        <h3>Applicant checks</h3><p className="sub">Age lives only here. The bureau and other modules reuse it, so it is never entered twice.</p>
        <div className="mgrid">
          <div className="mf"><span className="lbl">Age check</span><Switch checked={g.ageRequired} onChange={(v) => set('global.ageRequired', v)} label={g.ageRequired ? 'On' : 'Off'} /></div>
          <MField label="Minimum age" htmlFor="g-minAge" err={errors['global.minAge']}><NumIn id="g-minAge" value={g.minAge} onChange={(v) => set('global.minAge', v)} suffix="years" disabled={!g.ageRequired} err={errors['global.minAge']} /></MField>
          <MField label="Maximum age" htmlFor="g-maxAge" err={errors['global.maxAge']} hint="Leave blank for no upper limit"><NumIn id="g-maxAge" value={g.maxAge} onChange={(v) => set('global.maxAge', v)} suffix="years" disabled={!g.ageRequired} err={errors['global.maxAge']} /></MField>
          <div className="mf"><span className="lbl">Business vintage check</span><Switch checked={g.vintageRequired} onChange={(v) => set('global.vintageRequired', v)} label={hasBiz ? (g.vintageRequired ? 'On' : 'Off') : 'Business only'} disabled={!hasBiz && !g.vintageRequired} /></div>
          <MField label="Minimum vintage" htmlFor="g-minV" err={errors['global.minVintage']}><NumIn id="g-minV" decimal value={g.minVintage} onChange={(v) => set('global.minVintage', v)} suffix="years" disabled={!g.vintageRequired} err={errors['global.minVintage']} /></MField>
          <MField label="Maximum vintage" htmlFor="g-maxV" err={errors['global.maxVintage']}><NumIn id="g-maxV" decimal value={g.maxVintage} onChange={(v) => set('global.maxVintage', v)} suffix="years" disabled={!g.vintageRequired} err={errors['global.maxVintage']} /></MField>
          <div className="mf"><span className="lbl">Udyam (MSME) registration required</span><Switch checked={g.udyamRequired} onChange={(v) => set('global.udyamRequired', v)} label={g.udyamRequired ? 'Required' : 'Optional for the RM'} disabled={!hasBiz && !g.udyamRequired} /><p className="hint">When off, the RM may still enter and verify it.</p></div>
        </div>
      </section>

      <section className="mcard">
        <h3>Negative PIN codes <small>{P.length} listed</small></h3><p className="sub">Applications from these PIN codes fail check C06.</p>
        <div className="inline" style={{ maxWidth: 620 }}>
          <div className="ctl"><input value={pinText} onChange={(e) => setPinText(e.target.value)} placeholder="Type or paste PIN codes, separated by commas or spaces" aria-label="Add PIN codes" onKeyDown={(e) => { if (e.key === 'Enter') { addPins(pinText); setPinText(''); } }} /></div>
          <button type="button" className="btn verify" onClick={() => { addPins(pinText); setPinText(''); }}>Add</button>
          <label className="btn verify" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Upload CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => upload(e.target.files[0])} /></label>
        </div>
        <Err e={errors['global.negativePincodes']} />
        <div className="pinchips">
          {P.map((p) => <span key={p} className={`pinchip${/^[1-9]\d{5}$/.test(p) ? '' : ' bad'}`}>{p}<button type="button" aria-label={`Remove ${p}`} onClick={() => set('global.negativePincodes', P.filter((x) => x !== p))}>×</button></span>)}
          {!P.length && <span className="hint">None yet.</span>}
          {P.length > 0 && <button type="button" className="linkbtn" onClick={() => set('global.negativePincodes', [])}>Clear all</button>}
        </div>
      </section>

      <section className="mcard">
        <h3>Custom rules <small>{g.rules.filter((r) => r.enabled).length} active</small></h3>
        <p className="sub">Build rules from calculated fields. "Reject" makes the application not eligible; "Manual review" sends it to credit review.</p>
        <div className="rules">
          {g.rules.map((r, i) => {
            const e = errors[`global.rules.${i}.value`] || errors[`global.rules.${i}.appliesTo`];
            const f = RULE_FIELDS.find((x) => x.key === r.field); const op = RULE_OPS.find((x) => x.key === r.op);
            return (
              <div key={r.id}>
                <div className={`rule${r.enabled ? '' : ' off'}`}>
                  <span className="num">G{String(i + 1).padStart(2, '0')}</span>
                  <Sel value={r.field} onChange={(v) => rule(i, 'field', v)} options={RULE_FIELDS.map((x) => ({ value: x.key, label: x.label }))} />
                  <Sel value={r.op} onChange={(v) => rule(i, 'op', v)} options={RULE_OPS.map((x) => ({ value: x.key, label: x.label }))} />
                  <NumIn decimal value={r.value} onChange={(v) => rule(i, 'value', v)} err={errors[`global.rules.${i}.value`]} placeholder="Value" />
                  <Chips options={['Individual', 'Business']} value={r.appliesTo} onChange={(v) => rule(i, 'appliesTo', v)} />
                  <Sel value={r.onFail} onChange={(v) => rule(i, 'onFail', v)} options={[{ value: 'reject', label: 'On fail: Reject' }, { value: 'review', label: 'On fail: Review' }]} />
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Switch checked={r.enabled} onChange={(v) => rule(i, 'enabled', v)} /><button type="button" className="xsm" aria-label="Delete rule" onClick={() => set('global.rules', g.rules.filter((_, j) => j !== i))}>×</button></span>
                </div>
                <p className="hint" style={{ margin: '3px 0 0 44px' }}>{e ? <span className="err">{e}</span> : <>Passes when <b>{f?.label}</b> {op?.label} <b>{r.value || '…'}</b> · applies to {r.appliesTo.join(' & ') || 'nobody'} · otherwise {r.onFail === 'reject' ? 'reject' : 'manual review'}</>}</p>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost sm" onClick={() => set('global.rules', [...g.rules, newRule()])}>+ Add rule</button>
          <button type="button" className="btn ghost sm" onClick={() => set('global.rules', [...g.rules, newRule({ field: 'internalScore', op: 'gte', value: '50' })])}>+ Internal score ≥ 50%</button>
          <button type="button" className="btn ghost sm" onClick={() => set('global.rules', [...g.rules, newRule({ field: 'netIncome', op: 'gte', value: '15000', appliesTo: ['Individual'] })])}>+ Net income ≥ ₹15,000</button>
        </div>
      </section>
      <Preview c={c} module="global" />
    </>
  );
}

/* ======================= Credit Bureau ======================= */
export function CreditBureau({ id }) {
  const { c, m, set, errors, warnings } = useDraft(id);
  const b = m.bureau; const hasBiz = c.scope.applicantTypes.includes('Business');
  const [all, setAll] = useState('');
  const g = m.global;
  return (
    <>
      <Head mod={MODULES[1]} c={c} errCount={count(errors, 'bureau')} />
      <p className="inherit">Applicant age comes from <b>Global Rules</b> ({g.ageRequired ? `${g.minAge || '?'}${g.maxAge ? `–${g.maxAge}` : '+'} years` : 'off'}). It is not repeated here.</p>
      <Warn list={warnings.filter((w) => w.module === 'bureau')} />
      <section className="mcard">
        <h3>Bureau vendors & score cut-offs</h3>
        <p className="sub">Each selected bureau is pulled and checked. Director, CMR and business scores apply to Business applicants only.</p>
        <div className="inline" style={{ maxWidth: 440, marginBottom: 12 }}>
          <NumIn value={all} onChange={setAll} placeholder="e.g. 700" />
          <button type="button" className="btn verify" onClick={() => { if (!all) return; BUREAUS.forEach(({ key }) => { if (b.vendors[key].required) set(`bureau.vendors.${key}.applicantMin`, all); }); }}>Apply applicant cut-off to all selected</button>
        </div>
        <Err e={errors['bureau.vendors']} />
        <div className="tscroll">
          <table className="mtable">
            <thead><tr><th>Use</th><th>Bureau</th><th>Min applicant score</th><th>Min director score</th><th>CMR rank / business score</th></tr></thead>
            <tbody>
              {BUREAUS.map(({ key, label, third, thirdLabel }) => {
                const v = b.vendors[key]; const p = `bureau.vendors.${key}`;
                return (
                  <tr key={key} className={v.required ? '' : 'off'}>
                    <td><Switch checked={v.required} onChange={(x) => set(`${p}.required`, x)} /></td>
                    <td><b>{label}</b></td>
                    <td><NumIn value={v.applicantMin} onChange={(x) => set(`${p}.applicantMin`, x)} disabled={!v.required} err={errors[`${p}.applicantMin`]} placeholder="300–900" />{errors[`${p}.applicantMin`] && <p className="cellerr">{errors[`${p}.applicantMin`]}</p>}</td>
                    <td><NumIn value={v.directorMin} onChange={(x) => set(`${p}.directorMin`, x)} disabled={!v.required || !hasBiz} err={errors[`${p}.directorMin`]} placeholder={hasBiz ? 'optional' : 'business only'} />{errors[`${p}.directorMin`] && <p className="cellerr">{errors[`${p}.directorMin`]}</p>}</td>
                    <td><NumIn value={v[third]} onChange={(x) => set(`${p}.${third}`, x)} disabled={!v.required || !hasBiz} err={errors[`${p}.${third}`]} placeholder={third === 'maxCmrRank' ? 'max CMR 1–10' : 'min business score'} /><span className="hint">{thirdLabel}</span>{errors[`${p}.${third}`] && <p className="cellerr">{errors[`${p}.${third}`]}</p>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mcard">
        <h3>Bureau report parameters</h3>
        <p className="sub">One list for the report checks and the questionnaire (they overlapped in the old screens). Turn a parameter on to set a maximum; off means it is captured but not checked.</p>
        <div className="tscroll">
          <table className="mtable">
            <thead><tr><th>Check</th><th>Parameter</th><th>Maximum allowed</th><th>Applies to loan amount</th></tr></thead>
            <tbody>
              {b.params.map((pp, i) => {
                const meta = CB_PARAMS.find((x) => x.key === pp.key); const e = errors[`bureau.params.${i}.max`];
                return (
                  <tr key={pp.key} className={pp.enabled ? '' : 'off'}>
                    <td><Switch checked={pp.enabled} onChange={(x) => set(`bureau.params.${i}.enabled`, x)} /></td>
                    <td>{meta.label}</td>
                    <td style={{ minWidth: 160 }}>{meta.unit === 'inr' ? <MoneyIn value={pp.max} onChange={(x) => set(`bureau.params.${i}.max`, x)} disabled={!pp.enabled} err={e} /> : <NumIn value={pp.max} onChange={(x) => set(`bureau.params.${i}.max`, x)} disabled={!pp.enabled} err={e} suffix={meta.unit === 'days' ? 'days' : ''} />}{e && <p className="cellerr">{e}</p>}</td>
                    <td style={{ minWidth: 190 }}><Sel value={pp.band} onChange={(x) => set(`bureau.params.${i}.band`, x)} disabled={!pp.enabled} options={LOAN_BANDS.map((x) => ({ value: x.key, label: x.label }))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mgrid g2">
        <section className="mcard">
          <h3>Loan asset classification</h3><p className="sub">Reject if any loan on the report has these classifications.</p>
          <Switch checked={b.assetClassRequired} onChange={(x) => set('bureau.assetClassRequired', x)} label={b.assetClassRequired ? 'Check on' : 'Check off'} />
          <div style={{ marginTop: 10 }}><Chips options={ASSET_CLASSES} value={b.assetClasses} onChange={(x) => set('bureau.assetClasses', x)} disabled={!b.assetClassRequired} /></div>
          <Err e={errors['bureau.assetClasses']} />
        </section>
        <section className="mcard">
          <h3>Negative statuses</h3><p className="sub">Reject if the report shows these. Written-off and settled accounts are counted in the parameters table instead.</p>
          <Switch checked={b.negativeStatusRequired} onChange={(x) => set('bureau.negativeStatusRequired', x)} label={b.negativeStatusRequired ? 'Check on' : 'Check off'} />
          <div style={{ marginTop: 10 }}><Chips options={NEGATIVE_STATUSES} value={b.negativeStatuses} onChange={(x) => set('bureau.negativeStatuses', x)} disabled={!b.negativeStatusRequired} /></div>
          <Err e={errors['bureau.negativeStatuses']} />
        </section>
      </div>
      <Preview c={c} module="bureau" />
    </>
  );
}

/* ======================= Bank Statement Analyzer ======================= */
export function BankAnalyzer({ id }) {
  const { c, m, set, errors, warnings } = useDraft(id);
  const k = m.bank; const p = productById(c.scope.productId);
  const band = (i, f, v) => set(`bank.bands.${i}.${f}`, v);
  let prev = 0;
  return (
    <>
      <Head mod={MODULES[2]} c={c} errCount={count(errors, 'bank')} />
      <Warn list={warnings.filter((w) => w.module === 'bank')} />
      <section className="mcard">
        <h3>Thresholds by loan amount</h3>
        <p className="sub">The band is picked from the requested amount. One inward-bounce limit per band (the old screen had two duplicate bounce fields). Leave the last "up to" blank to cover every larger amount.</p>
        <Switch checked={k.required} onChange={(x) => set('bank.required', x)} label={k.required ? 'Bank statement checks on' : 'Bank statement checks off'} />
        <Err e={errors['bank.bands']} />
        <div className="tscroll" style={{ marginTop: 12 }}>
          <table className="mtable">
            <thead><tr><th>Band</th><th>Loan amount up to</th><th>Min average closing balance (3 months)</th><th>Max inward bounces</th><th /></tr></thead>
            <tbody>
              {k.bands.map((bd, i) => {
                const from = prev; if (bd.upTo !== '') prev = Number(bd.upTo);
                return (
                  <tr key={bd.id} className={k.required ? '' : 'off'}>
                    <td className="hint">{inr(from + (i ? 1 : 0))} → {bd.upTo === '' ? 'and above' : inr(Number(bd.upTo))}</td>
                    <td style={{ minWidth: 170 }}><MoneyIn value={bd.upTo} onChange={(v) => band(i, 'upTo', v)} disabled={!k.required} err={errors[`bank.bands.${i}.upTo`]} placeholder={i === k.bands.length - 1 ? 'blank = and above' : ''} />{errors[`bank.bands.${i}.upTo`] && <p className="cellerr">{errors[`bank.bands.${i}.upTo`]}</p>}</td>
                    <td style={{ minWidth: 170 }}><MoneyIn value={bd.minAvgBalance} onChange={(v) => band(i, 'minAvgBalance', v)} disabled={!k.required} err={errors[`bank.bands.${i}.minAvgBalance`]} />{errors[`bank.bands.${i}.minAvgBalance`] && <p className="cellerr">{errors[`bank.bands.${i}.minAvgBalance`]}</p>}</td>
                    <td style={{ minWidth: 120 }}><NumIn value={bd.maxBounces} onChange={(v) => band(i, 'maxBounces', v)} disabled={!k.required} err={errors[`bank.bands.${i}.maxBounces`]} />{errors[`bank.bands.${i}.maxBounces`] && <p className="cellerr">{errors[`bank.bands.${i}.maxBounces`]}</p>}</td>
                    <td><button type="button" className="xsm" aria-label="Delete band" onClick={() => set('bank.bands', k.bands.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                );
              })}
              {!k.bands.length && <tr><td colSpan={5} className="hint">No bands yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} disabled={!k.required} onClick={() => set('bank.bands', [...k.bands, newBand({ maxBounces: '0' })])}>+ Add band</button>
        {p && <p className="hint" style={{ marginTop: 8 }}>{p.id} allows {inr(p.min)} – {inr(p.max)}.</p>}
      </section>
      <section className="mcard">
        <h3>Declared income vs bank credits</h3><p className="sub">Flags for review when declared monthly income (or turnover ÷ 12) is more than this multiple of average bank credits.</p>
        <div style={{ maxWidth: 260 }}><MField label="Maximum ratio" htmlFor="k-var" err={errors['bank.incomeVariance']}><NumIn id="k-var" decimal value={k.incomeVariance} onChange={(v) => set('bank.incomeVariance', v)} suffix="× credits" disabled={!k.required} err={errors['bank.incomeVariance']} /></MField></div>
      </section>
      <Preview c={c} module="bank" />
    </>
  );
}

/* ======================= Tax & ITR ======================= */
export function TaxItr({ id }) {
  const { c, m, set, errors, warnings } = useDraft(id);
  const t = m.tax; const hasBiz = c.scope.applicantTypes.includes('Business'); const hasInd = c.scope.applicantTypes.includes('Individual');
  return (
    <>
      <Head mod={MODULES[3]} c={c} errCount={count(errors, 'tax')} />
      <Warn list={warnings.filter((w) => w.module === 'tax')} />
      <section className="mcard">
        <h3>ITR requirement</h3><p className="sub">The RM records ITR filing once (step 3) and can upload the acknowledgement. Inside the skip range the ITR check is not run.</p>
        <div className="mgrid">
          <div className="mf"><span className="lbl">ITR required (applicant / promoter)</span><Switch checked={t.itrApplicantRequired} onChange={(x) => set('tax.itrApplicantRequired', x)} label={t.itrApplicantRequired ? 'Required' : 'Not required'} /></div>
          <div className="mf"><span className="lbl">ITR required (business)</span><Switch checked={t.itrBusinessRequired} onChange={(x) => set('tax.itrBusinessRequired', x)} label={hasBiz ? (t.itrBusinessRequired ? 'Required' : 'Not required') : 'Business only'} disabled={!hasBiz && !t.itrBusinessRequired} /><Err e={errors['tax.itrBusinessRequired']} /></div>
          <div />
          <MField label="Skip ITR from (loan amount)" htmlFor="t-from" err={errors['tax.itrSkipFrom']}><MoneyIn id="t-from" value={t.itrSkipFrom} onChange={(v) => set('tax.itrSkipFrom', v)} err={errors['tax.itrSkipFrom']} placeholder="e.g. 0" /></MField>
          <MField label="Skip ITR up to" htmlFor="t-to" err={errors['tax.itrSkipTo']}><MoneyIn id="t-to" value={t.itrSkipTo} onChange={(v) => set('tax.itrSkipTo', v)} err={errors['tax.itrSkipTo']} placeholder="e.g. 5,00,000" /></MField>
        </div>
      </section>
      <section className="mcard">
        <h3>Income heads counted <small>Individual applicants</small></h3>
        <p className="sub">The RM enters monthly income by ITR head. Heads switched off are shown to the RM as "not counted" and are left out of income and FOIR.</p>
        <div className="mgrid">
          {ITR_HEADS.map((h) => <div key={h.key} className="mf"><Switch checked={t.incomeHeads[h.key]} onChange={(x) => set(`tax.incomeHeads.${h.key}`, x)} label={h.label} disabled={!hasInd} /></div>)}
        </div>
        <Err e={errors['tax.incomeHeads']} />
        <div style={{ maxWidth: 320, marginTop: 14 }}><MField label="Minimum annual income (counted heads)" htmlFor="t-min" err={errors['tax.minAnnualItrIncome']} hint="Optional · blank = no minimum"><MoneyIn id="t-min" value={t.minAnnualItrIncome} onChange={(v) => set('tax.minAnnualItrIncome', v)} err={errors['tax.minAnnualItrIncome']} disabled={!hasInd} /></MField></div>
      </section>
      <section className="mcard">
        <h3>GST compliance <small>Business applicants</small></h3><p className="sub">When on, the RM must enter and verify the GSTIN, and the Cygnet GST compliance score is checked.</p>
        <div className="mgrid">
          <div className="mf"><span className="lbl">GST check</span><Switch checked={t.gstRequired} onChange={(x) => set('tax.gstRequired', x)} label={t.gstRequired ? 'Required' : 'Off (GSTIN optional)'} /></div>
          <MField label="Minimum GST compliance score" htmlFor="t-gst" err={errors['tax.minGstScore']}><NumIn id="t-gst" decimal value={t.minGstScore} onChange={(v) => set('tax.minGstScore', v)} suffix="/ 100" disabled={!t.gstRequired} err={errors['tax.minGstScore']} /></MField>
        </div>
      </section>
      <Preview c={c} module="tax" />
    </>
  );
}

/* ======================= Balance Sheet ======================= */
function RiskBar({ hi, lo }) {
  const H = Number(hi), L = Number(lo); const max = Math.max(40, L + 10);
  if (!isFinite(H) || !isFinite(L) || L <= H) return null;
  const p = (x) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return (
    <>
      <div className="thbar"><i style={{ width: p(H), background: 'var(--bad)' }} /><i style={{ width: `calc(${p(L)} - ${p(H)})`, background: 'var(--warn)' }} /><i style={{ flex: 1, background: 'var(--good)' }} /></div>
      <div className="thticks"><span style={{ left: '0%', transform: 'none' }}>0%</span><span style={{ left: p(H) }}>{H}%</span><span style={{ left: p(L) }}>{L}%</span><span style={{ left: '100%', transform: 'translateX(-100%)' }}>{max}%</span></div>
      <p className="hint">High risk below {H}% · medium {H}–{L}% · low above {L}%</p>
    </>
  );
}
export function BalanceSheet({ id }) {
  const { c, m, set, errors, warnings } = useDraft(id);
  const s = m.balance;
  return (
    <>
      <Head mod={MODULES[4]} c={c} errCount={count(errors, 'balance')} />
      <Warn list={warnings.filter((w) => w.module === 'balance')} />
      <section className="mcard">
        <h3>Margin risk bands</h3><p className="sub">Calculated from the business financials the RM enters on step 3 (turnover, total income, operating expenses, depreciation, finance cost, tax).</p>
        <Switch checked={s.enabled} onChange={(x) => set('balance.enabled', x)} label={s.enabled ? 'Balance sheet checks on' : 'Balance sheet checks off'} />
        <div className="mgrid g2" style={{ marginTop: 14 }}>
          <div>
            <b>EBITDA margin</b>
            <div className="mgrid g2" style={{ marginTop: 8 }}>
              <MField label="High risk below" htmlFor="b-eh" err={errors['balance.ebitdaHigh']}><NumIn id="b-eh" decimal value={s.ebitdaHigh} onChange={(v) => set('balance.ebitdaHigh', v)} suffix="%" disabled={!s.enabled} err={errors['balance.ebitdaHigh']} /></MField>
              <MField label="Low risk above" htmlFor="b-el" err={errors['balance.ebitdaLow']}><NumIn id="b-el" decimal value={s.ebitdaLow} onChange={(v) => set('balance.ebitdaLow', v)} suffix="%" disabled={!s.enabled} err={errors['balance.ebitdaLow']} /></MField>
            </div>
            <RiskBar hi={s.ebitdaHigh} lo={s.ebitdaLow} />
          </div>
          <div>
            <b>PAT margin</b>
            <div className="mgrid g2" style={{ marginTop: 8 }}>
              <MField label="High risk below" htmlFor="b-ph" err={errors['balance.patHigh']}><NumIn id="b-ph" decimal value={s.patHigh} onChange={(v) => set('balance.patHigh', v)} suffix="%" disabled={!s.enabled} err={errors['balance.patHigh']} /></MField>
              <MField label="Low risk above" htmlFor="b-pl" err={errors['balance.patLow']}><NumIn id="b-pl" decimal value={s.patLow} onChange={(v) => set('balance.patLow', v)} suffix="%" disabled={!s.enabled} err={errors['balance.patLow']} /></MField>
            </div>
            <RiskBar hi={s.patHigh} lo={s.patLow} />
          </div>
        </div>
        <div style={{ maxWidth: 300, marginTop: 14 }}><MField label="When a margin is high risk" htmlFor="b-on"><Sel id="b-on" value={s.onHighRisk} onChange={(v) => set('balance.onHighRisk', v)} disabled={!s.enabled} options={[{ value: 'review', label: 'Send to manual review' }, { value: 'reject', label: 'Reject' }]} /></MField></div>
      </section>
      <section className="mcard">
        <h3>How the figures are derived <small>read-only</small></h3>
        <div className="tscroll">
          <table className="mtable">
            <thead><tr><th>Metric</th><th>Formula</th></tr></thead>
            <tbody>
              <tr><td>EBITDA</td><td className="mono">Total income − total operating expenses</td></tr>
              <tr><td>EBITDA margin</td><td className="mono">EBITDA ÷ total income × 100</td></tr>
              <tr><td>PBT</td><td className="mono">EBITDA − depreciation − finance cost</td></tr>
              <tr><td>PAT</td><td className="mono">PBT − tax</td></tr>
              <tr><td>PAT margin</td><td className="mono">PAT ÷ total income × 100</td></tr>
              <tr><td>Monthly surplus (for FOIR)</td><td className="mono">(EBITDA − tax) ÷ 12</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <Preview c={c} module="balance" />
    </>
  );
}
