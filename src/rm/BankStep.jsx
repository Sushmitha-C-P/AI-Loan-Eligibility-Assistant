// Step 2 · Bank statement. Account Aggregator consent flow or PDF upload; both feed the same Bank Statement Analyzer.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { VAL, configOf } from '../engine/validation.js';
import { ACCOUNT_AGGREGATORS } from '../engine/master.js';
import { mockBank, aaAccounts, aaHandleFor } from '../engine/mocks.js';
import { inr, money } from '../engine/format.js';
import { StepHeader, Spinner, ErrorSummary } from '../components/ui.jsx';
import BottomBar from './BottomBar.jsx';

const MAX_MB = 10;

function OtpBoxes({ value, onChange, onEnter }) {
  const refs = useRef([]);
  const set = (i, ch) => {
    const digits = value.padEnd(6, ' ').split('');
    digits[i] = ch || ' ';
    const nv = digits.join('').replace(/\s+$/, '');
    onChange(nv.replace(/ /g, ''));
    if (ch && i < 5) refs.current[i + 1]?.focus();
  };
  return (
    <div className="otp" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(5, t.length)]?.focus(); } }}>
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)} inputMode="numeric" maxLength={1} aria-label={`OTP digit ${i + 1}`} value={value[i] || ''}
          onChange={(e) => set(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); if (e.key === 'Enter') onEnter?.(); }} />
      ))}
    </div>
  );
}

function AaFlow({ onDone, onCancel }) {
  const { s, toast } = useApp();
  const d = s.d;
  const handle = aaHandleFor(d.pan);
  const [st, setSt] = useState(handle ? 'handle' : 'consent');
  const [f, setF] = useState({ alt: '', aa: 'Ignosis', months: '6', agree: false });
  const [e, setE] = useState({});
  const [otp, setOtp] = useState({ code: '', input: '', tries: 0 });
  const [accs, setAccs] = useState(['a1']);
  const [busy, setBusy] = useState('');
  const accounts = aaAccounts(d.pan);
  const order = ['consent', 'aaotp', 'accounts', 'thanks'];
  const idx = Math.max(0, order.indexOf(st));

  const wait = (ms, k, fn) => { setBusy(k); setTimeout(() => { setBusy(''); fn(); }, ms); };
  const sendOtp = () => { const code = String(Math.floor(100000 + Math.random() * 900000)); setOtp({ code, input: '', tries: 0 }); toast(<>{f.aa} OTP to +91 {d.mobile.replace(/(\d{5})(\d{5})/, '$1 $2')}: <b>{code}</b></>); };
  const request = () => {
    const x = {};
    if (f.alt) { const m = VAL.mobile(f.alt); if (m) x.alt = m; else if (f.alt === d.mobile) x.alt = 'Alternate number must be different from the primary number.'; }
    if (!f.aa) x.aa = 'Choose an account aggregator.';
    if (!f.agree) x.agree = 'The customer must approve the consent request.';
    setE(x); if (Object.keys(x).length) return;
    wait(900, 'req', () => { sendOtp(); setSt('aaotp'); });
  };
  const verify = () => {
    if (otp.input.length !== 6) { setE({ otp: 'Enter the 6-digit OTP from the account aggregator.' }); return; }
    if (otp.input !== otp.code) { const t = otp.tries + 1; setOtp({ ...otp, tries: t, input: '' }); setE({ otp: t >= 3 ? 'Too many wrong attempts. Resend the OTP.' : `OTP doesn't match. ${3 - t} attempt${3 - t === 1 ? '' : 's'} left.` }); return; }
    setE({}); wait(800, 'otp', () => setSt('accounts'));
  };
  const fetch = () => {
    if (!accs.length) { setE({ accs: 'Select at least one account to share.' }); return; }
    setE({}); setSt('thanks');
    wait(1800, 'fetch', () => onDone({ ...mockBank(d.pan, Number(f.months)), source: 'aa', aggregator: f.aa, accounts: accs.length, masks: accounts.filter((a) => accs.includes(a.id)).map((a) => a.mask.slice(-4)) }));
  };

  return (
    <div className="aa" aria-live="polite">
      <div className="aa-h"><span className="logo" style={{ width: 30, height: 30, background: 'var(--auto)' }} aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18M12 3l9 5H3z" /></svg></span><b>Account Aggregator</b><span className="pill auto" style={{ marginLeft: 'auto' }}>RBI AA framework</span></div>
      {st !== 'handle' && <div className="aa-steps" aria-hidden="true">{order.map((k, i) => <i key={k} className={i <= idx ? 'on' : ''} />)}</div>}

      {st === 'handle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>This customer already has a linked AA handle.</p>
          <div className="docrow"><span className="ico" style={{ background: 'var(--auto-soft)', color: 'var(--auto)' }}>AA</span><div><b className="mono">{handle}</b><small>Linked to +91 {d.mobile}</small></div><span className="pill pass">Active</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" type="button" onClick={() => { setF({ ...f, aa: handle.split('@')[1].replace(/^\w/, (c) => c.toUpperCase()) }); wait(700, 'req', () => { sendOtp(); setSt('aaotp'); }); }} disabled={!!busy}>{busy ? <><Spinner />Sending consent…</> : 'Confirm & send consent'}</button>
            <button className="btn ghost" type="button" onClick={() => setSt('consent')}>Use a different AA</button>
          </div>
        </div>
      )}

      {st === 'consent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="hint">A consent request goes to the customer's phone. Data is fetched only after they approve.</p>
          <div className="field"><label>Mobile number (verified)</label><div className="ro-val">+91 {d.mobile} ✓</div></div>
          <div className="field">
            <label htmlFor="aaalt">Alternate mobile <span className="opt">optional</span></label>
            <div className={`ctl${e.alt ? ' bad' : ''}`}><span className="pre">+91</span><input id="aaalt" inputMode="numeric" value={f.alt} onChange={(ev) => setF({ ...f, alt: ev.target.value.replace(/\D/g, '').slice(0, 10) })} /></div>
            {e.alt && <p className="err">{e.alt}</p>}
          </div>
          <div className="grid">
            <div className="field"><label htmlFor="aasel">Account aggregator</label><div className="ctl"><select id="aasel" value={f.aa} onChange={(ev) => setF({ ...f, aa: ev.target.value })}>{ACCOUNT_AGGREGATORS.map((a) => <option key={a}>{a}</option>)}</select></div></div>
            <div className="field"><label htmlFor="aamon">Statement period</label><div className="ctl"><select id="aamon" value={f.months} onChange={(ev) => setF({ ...f, months: ev.target.value })}><option value="6">Last 6 months</option><option value="3">Last 3 months</option></select></div></div>
          </div>
          <div className="field"><label>Purpose</label><div className="ro-val" style={{ fontWeight: 500 }}>Loan underwriting · one-time fetch · consent valid 24 hours</div></div>
          <label className="check"><input type="checkbox" checked={f.agree} onChange={(ev) => setF({ ...f, agree: ev.target.checked })} /><span>Customer has approved the consent request on their phone.</span></label>
          {e.agree && <p className="err">{e.agree}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" type="button" onClick={request} disabled={!!busy}>{busy ? <><Spinner />Sending…</> : 'Send consent request'}</button>
            <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}

      {st === 'aaotp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>Enter the OTP the customer received from <b>{f.aa}</b>.</p>
          <OtpBoxes value={otp.input} onChange={(x) => setOtp({ ...otp, input: x })} onEnter={verify} />
          {e.otp && <p className="err">{e.otp}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" type="button" onClick={verify} disabled={!!busy}>{busy ? <><Spinner />Verifying…</> : 'Verify OTP'}</button>
            <button className="btn ghost" type="button" onClick={() => { sendOtp(); setE({}); }}>Resend OTP</button>
          </div>
        </div>
      )}

      {st === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p>Select the accounts to share.</p>
          {accounts.map((a) => (
            <label key={a.id} className="acc"><input type="checkbox" checked={accs.includes(a.id)} onChange={(ev) => setAccs(ev.target.checked ? [...accs, a.id] : accs.filter((x) => x !== a.id))} /><span><b>{a.type}</b><small className="mono">{a.mask} · {a.fip}</small></span><span className="pill na">{f.months} months</span></label>
          ))}
          {e.accs && <p className="err">{e.accs}</p>}
          <button className="btn primary" type="button" onClick={fetch} style={{ alignSelf: 'flex-start', marginTop: 4 }}>Fetch statements</button>
        </div>
      )}

      {st === 'thanks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <div className="okbanner" style={{ width: '100%' }}><span className="tick">✓</span><div><b>Thank you. Consent approved.</b><p className="hint">Fetching {accs.length} account{accs.length > 1 ? 's' : ''} from {f.aa} and running the Bank Statement Analyzer…</p></div></div>
          <div className="skeleton" style={{ width: '100%' }}><i style={{ width: '70%' }} /><i /><i style={{ width: '45%' }} /></div>
        </div>
      )}
    </div>
  );
}

function PdfUpload({ onDone, onCancel }) {
  const { s } = useApp();
  const [file, setFile] = useState(null);
  const [months, setMonths] = useState('6');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = (fl) => {
    if (!fl) return;
    if (!/\.pdf$/i.test(fl.name) && fl.type !== 'application/pdf') { setErr('Upload the bank statement as a PDF file.'); setFile(null); return; }
    if (fl.size > MAX_MB * 1048576) { setErr(`File is ${(fl.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`); setFile(null); return; }
    if (fl.size < 1024) { setErr('This file looks empty. Upload the full statement.'); setFile(null); return; }
    setErr(''); setFile(fl);
  };
  const analyse = () => {
    if (!file) { setErr('Choose the statement PDF first.'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); onDone({ ...mockBank(s.d.pan, Number(months)), source: 'pdf', fileName: file.name, sizeKb: Math.round(file.size / 1024) }); }, 1600);
  };
  return (
    <div className="aa">
      <div className="aa-h"><b>Upload bank statement</b><span className="pill na" style={{ marginLeft: 'auto' }}>PDF · max {MAX_MB} MB</span></div>
      <label className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files[0])} data-testid="pdf-input" />
        <b>{file ? file.name : 'Drop the PDF here or click to choose'}</b>
        <span className="hint">{file ? `${Math.round(file.size / 1024)} KB` : 'Bank-generated e-statement works best'}</span>
      </label>
      {err && <p className="err" style={{ marginTop: 6 }}>{err}</p>}
      <div className="field" style={{ marginTop: 12 }}>
        <label>Statement period</label>
        <div className="tabs" style={{ alignSelf: 'flex-start' }}>
          {['3', '6'].map((m) => <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)}>{m} months</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" type="button" onClick={analyse} disabled={busy}>{busy ? <><Spinner />Analysing statement…</> : 'Upload & analyse'}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function BankSummary({ bank, compact }) {
  const { s } = useApp();
  const cfg = configOf(s.d);
  const amount = money(s.d.amount) || 0;
  let lo = 0; const band = cfg?.bank.required ? cfg.bank.bands.find((x) => { const hit = amount > lo && (x.upTo === '' || amount <= Number(x.upTo)); if (x.upTo !== '') lo = Number(x.upTo); return hit; }) : null;
  return (
    <div className="card" style={{ marginTop: compact ? 0 : 14 }}>
      <div className="gh" style={{ marginBottom: 10 }}>
        <h3>Bank Statement Analyzer</h3>
        <span className="pill auto">{bank.source === 'aa' ? `AA · ${bank.aggregator}` : `PDF · ${bank.fileName}`} · {bank.months} months</span>
      </div>
      <div className="kv">
        <div><span>Avg monthly credits</span><strong>{inr(bank.avgCredits)}</strong></div>
        <div><span>Avg closing balance (3 m)</span><strong>{inr(bank.avgClosing3m)}</strong></div>
        <div><span>Inward bounces</span><strong>{bank.bounces}</strong></div>
        <div><span>{s.d.applicantType === 'Business' ? 'EMI debits / month' : 'Salary credits'}</span><strong>{s.d.applicantType === 'Business' ? inr(bank.emiDebits) : `${bank.salaryMonths} of ${bank.months}`}</strong></div>
      </div>
      {band && (
        <p className="hint" style={{ marginTop: 10 }}>
          Threshold for {inr(amount)} ({band.upTo === '' ? 'top band' : `up to ${inr(Number(band.upTo))}`}): balance ≥ {inr(Number(band.minAvgBalance))} <b className={bank.avgClosing3m >= Number(band.minAvgBalance) ? 'ok-t' : 'bad-t'}>{bank.avgClosing3m >= Number(band.minAvgBalance) ? '✓' : '✕'}</b>
          {' · '}bounces ≤ {band.maxBounces} <b className={bank.bounces <= Number(band.maxBounces) ? 'ok-t' : 'bad-t'}>{bank.bounces <= Number(band.maxBounces) ? '✓' : '✕'}</b>
          <span className="muted"> · from {cfg.id}</span>
        </p>
      )}
    </div>
  );
}

export default function BankStep() {
  const { s, setBank, skipBank, clearBank, checkStep, goStep } = useApp();
  const [mode, setMode] = useState(s.bank ? null : 'aa');
  useEffect(() => { if (s.bank) setMode(null); }, [s.bank]);
  const next = () => { if (!checkStep(1)) return; goStep(2); };

  return (
    <section className="panel" aria-labelledby="h-bank">
      <StepHeader n={2} title="Bank statement" lede="Fetch 3 or 6 months of statements through the Account Aggregator, or upload the PDF. The analyzer reads balances, bounces and income credits." />
      <ErrorSummary ids={['bank']} />
      {s.bank ? (
        <>
          <div className="okbanner"><span className="tick">✓</span><div><b>Statement retrieved &amp; analysed</b><p className="hint">{s.bank.source === 'aa' ? `${s.bank.accounts || 1} account${(s.bank.accounts || 1) > 1 ? 's' : ''} via ${s.bank.aggregator}` : `Uploaded ${s.bank.fileName}`}. The rules engine uses these figures.</p></div>
            <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => { clearBank(); setMode('aa'); }}>Change</button></div>
          <BankSummary bank={s.bank} />
        </>
      ) : (
        <>
          <div className="choices" role="group" aria-label="Statement source">
            <button type="button" className="choice" aria-pressed={mode === 'aa'} onClick={() => setMode('aa')}><b>Account Aggregator</b><span>Customer approves a consent request on their phone. Fastest and tamper-proof.</span><span className="tagrow"><span className="pill pass">Recommended</span></span></button>
            <button type="button" className="choice" aria-pressed={mode === 'pdf'} onClick={() => setMode('pdf')}><b>Upload PDF</b><span>Bank e-statement for the last 3 or 6 months, up to {MAX_MB} MB.</span></button>
          </div>
          {mode === 'aa' && <AaFlow key="aa" onDone={setBank} onCancel={() => setMode(null)} />}
          {mode === 'pdf' && <PdfUpload key="pdf" onDone={setBank} onCancel={() => setMode(null)} />}
          {s.bankSkipped
            ? <p className="warnline" style={{ marginTop: 14 }}>Skipped. Bank checks will show as "not evaluated" and the result will be a partial assessment.</p>
            : <p className="hint" style={{ marginTop: 14 }}>Customer not ready? <button type="button" className="linkbtn" onClick={skipBank}>Skip for now</button> and the bank checks will be marked "not evaluated".</p>}
        </>
      )}
      <BottomBar onBack={() => goStep(0)} next={next} nextLabel="Continue to financial details →" />
    </section>
  );
}
