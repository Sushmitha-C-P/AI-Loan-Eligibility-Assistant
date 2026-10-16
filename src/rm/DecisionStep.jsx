// Step 4 · Decision. The rules engine decides; the AI writes the remarks. The RM then sends the file to sanction or declines it.
import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { POLICY } from '../engine/policy.js';
import { CB_QUALITY } from '../engine/bre.js';
import { inr, lakhShort, pct, fmtDate } from '../engine/format.js';
import { StepHeader } from '../components/ui.jsx';
import AiExplain from '../components/AiExplain.jsx';
import AskAssistant from '../components/AskAssistant.jsx';
import BottomBar from './BottomBar.jsx';

export const ICON = { pass: '✓', review: '!', fail: '✕', na: '?', skip: '–' };
export const STLABEL = { pass: 'Pass', review: 'Review', fail: 'Fail', na: 'Not evaluated', skip: 'Not required' };
export const MODULE_NAME = { global: 'Global Rules', bureau: 'Credit Bureau', bank: 'Bank Statement Analyzer', tax: 'Tax & ITR', balance: 'Balance Sheet' };
const CATS = [['Customer', 'KYC, age, vintage, PIN code, stability'], ['Income', 'ITR, GST, margins, income vs bank'], ['Bureau', 'Scores, report checks, bank behaviour'], ['Obligations', 'FOIR, eligible amount']];
const worst = (l) => (l.some((r) => r.status === 'fail') ? 'fail' : l.some((r) => r.status === 'review') ? 'review' : l.some((r) => r.status === 'na') ? 'na' : l.every((r) => r.status === 'skip') ? 'skip' : 'pass');

function WhatIf({ r }) {
  const { s, whatIf } = useApp();
  const p = r.product;
  const [amt, setAmt] = useState(r.amount);
  const [ten, setTen] = useState(r.tenure);
  useEffect(() => { setAmt(r.amount); setTen(r.tenure); }, [r.amount, r.tenure]);
  const change = (a, t) => { setAmt(a); setTen(t); whatIf(a, t); };
  return (
    <div className="card wi">
      <div className="gh" style={{ marginBottom: 4 }}><h3>What-if simulator</h3><p>Re-runs the rules engine instantly. The AI is not involved.</p></div>
      <div className="wi-row"><label htmlFor="wiAmount">Amount</label><input type="range" id="wiAmount" min={p.min} max={p.max} step={p.max > 2500000 ? 25000 : 10000} value={amt} onChange={(e) => change(+e.target.value, ten)} /><output className="num">{inr(amt)}</output></div>
      <div className="wi-row"><label htmlFor="wiTenure">Tenure</label><input type="range" id="wiTenure" min={p.tmin} max={p.tmax} step={1} value={ten} onChange={(e) => change(amt, +e.target.value)} /><output className="num">{ten} months</output></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost sm" type="button" onClick={() => s.loanAtRun && change(s.loanAtRun[0], s.loanAtRun[1])}>Reset to requested</button>
      </div>
    </div>
  );
}

function DecideDialog({ kind, r, onClose, onSubmit }) {
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  const sanction = kind === 'sanction';
  const needs = sanction ? (r.key === 'pass' ? 0 : 20) : 10;
  const submit = () => {
    const t = txt.trim();
    if (t.length < needs) { setErr(needs === 0 ? '' : `Add at least ${needs} characters so credit can see the reason${sanction ? ' for the deviation' : ''}.`); if (needs) return; }
    onSubmit(t);
  };
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dd-h">
        <div className="dialog-h"><div><h2 id="dd-h">{sanction ? 'Proceed to sanction' : 'Decline application'}</h2><p className="hint">{sanction ? (r.key === 'pass' ? 'The file goes to the credit officer for formal underwriting.' : 'Some rules need review. Explain why this file should still go to credit.') : 'The customer is told the application cannot proceed now.'}</p></div><button className="xbtn" type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="dialog-b">
          <div className="field">
            <label htmlFor="ddtxt">{sanction ? 'Remarks for credit' : 'Reason for decline'} {needs === 0 && <span className="opt">optional</span>}</label>
            <textarea id="ddtxt" className="ta" value={txt} onChange={(e) => { setTxt(e.target.value); setErr(''); }} autoFocus placeholder={sanction ? 'e.g. Customer agreed to add spouse as co-applicant; salary slips collected.' : 'e.g. Credit score below product minimum; customer advised to reapply after 6 months.'} maxLength={600} />
            <p className="hint">{txt.trim().length}/600</p>
            {err && <p className="err">{err}</p>}
          </div>
          {sanction && r.key !== 'pass' && <p className="note">Rules needing review: {r.rules.filter((x) => x.status === 'review' || x.status === 'na').map((x) => x.id).join(', ') || 'none'}.</p>}
        </div>
        <div className="dialog-f"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className={`btn ${sanction ? 'primary' : 'danger'}`} onClick={submit}>{sanction ? 'Send to sanction' : 'Decline application'}</button></div>
      </div>
    </div>
  );
}

export default function DecisionStep({ onOpenLog, onHome }) {
  const { s, goStep, decide, toast } = useApp();
  const [showSkip, setShowSkip] = useState(false);
  const [dlg, setDlg] = useState(null);
  const r = s.result;
  if (!r) return null;
  const d = s.d; const biz = d.applicantType === 'Business';
  const tone = r.key === 'partial' ? 'partial' : r.key;
  const ringC = r.key === 'pass' ? 'var(--good)' : r.key === 'fail' ? 'var(--bad)' : 'var(--warn)';
  const foirTone = !isFinite(r.m.foir) ? 'fail' : r.m.foir < r.ceiling * 0.8 ? 'pass' : r.m.foir < r.ceiling ? 'review' : 'fail';
  const riskTone = (k) => (k === 'Low' ? 'pass' : k === 'Medium' ? 'review' : k === 'High' ? 'fail' : 'na');
  const ebitdaRisk = r.rules.find((x) => x.id === 'I04')?.risk; const patRisk = r.rules.find((x) => x.id === 'I05')?.risk;
  const docsOk = r.docs.filter((x) => x[1]).length;
  const cbq = CB_QUALITY(r.lowScore);
  const fixes = [...new Set(r.rules.filter((x) => (x.status === 'review' || x.status === 'fail') && x.fix).map((x) => x.fix))];
  const decided = s.decision;
  const name = biz ? d.businessName : d.fullName;

  const submit = (kind) => (remarks) => {
    decide(kind === 'sanction' ? 'Sent to sanction' : 'Declined', remarks);
    setDlg(null);
    toast(kind === 'sanction' ? `${s.appId} sent to sanction.` : `${s.appId} declined.`);
  };

  return (
    <section className="panel" aria-labelledby="h-dec">
      <StepHeader n={4} title="Decision" lede="Decided by the rules engine using the published configuration. The AI remarks explain the result and cannot change it." />
      {s.reevaluated && <p className="note" style={{ marginBottom: 14 }}>Re-evaluated just now with the currently published rules ({r.config.id} v{r.config.version}).</p>}
      {decided && (
        <div className={`decided ${decided.status === 'Declined' ? 'declined' : 'sanction'}`}>
          <b>{decided.status === 'Declined' ? '✕' : '→'}</b>
          <div><b>{decided.status}</b> <span className="hint">· {fmtDate(new Date(decided.at))}{decided.by ? ` · ${decided.by}` : ''}</span>{decided.remarks && <p style={{ marginTop: 2 }}>{decided.remarks}</p>}</div>
        </div>
      )}

      <div className={`dhero ${tone}`}>
        <div className="ring" style={{ '--p': r.score, '--c': ringC }} role="img" aria-label={`Eligibility score ${r.score} percent`}><div><div><strong>{r.score}%</strong><small>Eligibility score</small></div></div></div>
        <div>
          <span className={`pill ${r.key === 'partial' ? 'review' : r.key}`}>{ICON[r.key === 'partial' ? 'na' : r.key]} {r.cnt.pass}/{r.evaluated} rules passed</span>
          <h2 style={{ marginTop: 8 }}>{r.label}</h2>
          <p className="sub">{name} · {d.applicantType} · {d.customerType} · {r.product.id} ({r.product.loanType}) · {inr(r.amount)} for {r.tenure} months · rules {r.config.id} v{r.config.version}</p>
        </div>
        <div className="dnums">
          {r.key !== 'fail'
            ? <div><span>Indicative eligible amount</span><strong>₹{lakhShort(r.minAmt)} – {lakhShort(r.maxAmt)} lakh</strong></div>
            : <div><span>Indicative eligible amount</span><strong>Not available</strong></div>}
          <div><span>Rate · EMI</span><strong>~{r.rate}% · {inr(r.key !== 'fail' ? Math.min(r.emiReq, r.emiMax || r.emiReq) : r.emiReq)}</strong></div>
        </div>
      </div>

      <div className="chiprow">
        <div className="dchip"><span>Credit bureau</span><strong><i className={`dot ${cbq === 'Good' ? 'pass' : cbq === 'Fair' ? 'review' : 'fail'}`} />{cbq} · {r.lowScore}</strong></div>
        <div className="dchip"><span>Customer</span><strong>{d.customerType === 'Existing' ? 'Existing customer' : 'New customer'}</strong></div>
        <div className="dchip"><span>FOIR</span><strong><i className={`dot ${foirTone}`} />{pct(r.m.foir)} <small className="hint">/ {r.ceiling}%</small></strong></div>
        <div className="dchip"><span>Internal stability</span><strong>{r.is.provided ? `${Math.round(r.is.pct)}%` : '—'}</strong></div>
        {biz && ebitdaRisk && <div className="dchip"><span>EBITDA margin</span><strong><i className={`dot ${riskTone(ebitdaRisk)}`} />{pct(r.m.ebitdaM)} · {ebitdaRisk}</strong></div>}
        {biz && patRisk && <div className="dchip"><span>PAT margin</span><strong><i className={`dot ${riskTone(patRisk)}`} />{pct(r.m.patM)} · {patRisk}</strong></div>}
        <div className="dchip" title={r.docs.map(([k, v]) => `${k}: ${v ? 'provided' : 'missing'}`).join('\n')}><span>Documents provided</span><strong><i className={`dot ${docsOk === r.docs.length ? 'pass' : 'review'}`} />{docsOk} of {r.docs.length}</strong></div>
      </div>

      <AiExplain result={r} onOpenLog={onOpenLog} title="AI remarks" />

      <div className="gh" style={{ marginTop: 18, marginBottom: 0 }}>
        <h3>Rule results</h3>
        <label className="check" style={{ fontSize: 12.5 }}><input type="checkbox" checked={showSkip} onChange={(e) => setShowSkip(e.target.checked)} />Show checks not required by this product ({r.cnt.skip})</label>
      </div>
      <div className="cats" style={{ marginTop: 10 }}>
        {CATS.map(([c, sub]) => {
          const all = r.rules.filter((x) => x.cat === c); const w = worst(all);
          const list = showSkip ? all : all.filter((x) => x.status !== 'skip');
          return (
            <div className="cat" key={c}>
              <div className="cat-h"><div><h3>{c}</h3><p>{sub}</p></div><span className={`pill ${w}`}>{STLABEL[w]}</span></div>
              <ul className="rl">{list.length ? list.map((x) => <li key={x.id} className={x.status === 'skip' ? 'skipped' : ''}><span className={`ic ${x.status}`} aria-label={STLABEL[x.status]}>{ICON[x.status]}</span><span>{x.name}<small className="num">{x.status === 'skip' ? `Not required · ${x.value}` : x.status === 'pass' ? x.value : x.con || x.value}</small></span></li>) : <li><span /> <span className="hint">No checks in this group for this product.</span></li>}</ul>
            </div>
          );
        })}
      </div>

      {(fixes.length > 0 || r.missing.length > 0) && (
        <div className="two">
          {fixes.length > 0 && <div className="card"><div className="sech"><span className="pill brand">{fixes.length}</span> What would improve eligibility</div><ul className="fl fix">{fixes.map((t) => <li key={t}>{t}</li>)}</ul></div>}
          {r.missing.length > 0 && <div className="card"><div className="sech"><span className="pill na">{r.missing.length}</span> Missing information</div><ul className="fl miss">{r.missing.map(([t, w]) => <li key={t}><b>{t}</b><br /><span className="muted">{w}</span></li>)}</ul></div>}
        </div>
      )}

      <WhatIf r={r} />
      <AskAssistant result={r} onOpenLog={onOpenLog} />

      <details>
        <summary>Full rule trace ({r.rules.length} checks)</summary>
        <div className="dbody tscroll">
          <table>
            <thead><tr><th>Rule</th><th>Check</th><th>Configured in</th><th>Value</th><th>Threshold</th><th>Outcome</th></tr></thead>
            <tbody>{r.rules.map((x) => <tr key={x.id}><td className="mono">{x.id}</td><td>{x.name}<br /><span className="hint">{x.cat}</span></td><td className="hint">{x.src === 'policy' ? 'Credit policy' : `${MODULE_NAME[x.module] || x.module} · ${r.config.id}`}</td><td className="num">{x.value}</td><td className="hint">{x.policy}</td><td><span className={`pill ${x.status}`}>{STLABEL[x.status]}</span></td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="audit">Assessment {r.id} · {new Date(r.at).toLocaleString('en-IN')} · {r.config.id} v{r.config.version} · policy {POLICY.version} · application {s.appId} · decided by the rules engine; thresholds are illustrative for the prototype</p>

      <BottomBar onBack={() => goStep(2)} backLabel="← Edit details">
        {decided ? (
          <button className="btn primary" type="button" onClick={onHome}>Back to applications</button>
        ) : (
          <>
            <button className="btn danger" type="button" onClick={() => setDlg('decline')}>Decline application</button>
            <button className="btn primary" type="button" onClick={() => setDlg('sanction')} disabled={r.key === 'fail'} title={r.key === 'fail' ? 'Not eligible: blocking rules failed' : ''}>Proceed to sanction</button>
          </>
        )}
      </BottomBar>
      {dlg && <DecideDialog kind={dlg} r={r} onClose={() => setDlg(null)} onSubmit={submit(dlg)} />}
    </section>
  );
}
