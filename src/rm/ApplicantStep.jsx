// Step 1 · Applicant details. One form for both applicant types: the Individual / Business toggle decides which
// identity fields show. Product, amount and address are shared, so they are captured once.
import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { VAL, nameMatch, configOf, isBusiness, ageOf, vintageOf, stepFields } from '../engine/validation.js';
import { PRODUCTS, PURPOSES, productById } from '../engine/master.js';
import { inr, amountWords, money } from '../engine/format.js';
import { Field, Input, Select, Radios, Check, ErrorSummary, StepHeader, Spinner } from '../components/ui.jsx';
import AiIntake from '../components/AiIntake.jsx';
import BottomBar from './BottomBar.jsx';

function useFakeCall() {
  const [busy, setBusy] = useState('');
  const call = (key, ms, fn) => { setBusy(key); setTimeout(() => { setBusy(''); fn(); }, ms); };
  return [busy, call];
}
const aadhaarMask = (v) => v.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
const voterMask = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

function VerifyBtn({ done, busy, onClick, label = 'Verify' }) {
  return <button type="button" className={`btn verify${done ? ' done' : ''}`} onClick={onClick} disabled={busy}>{busy ? <Spinner /> : done ? '✓ Verified' : label}</button>;
}

export default function ApplicantStep({ onOpenLog }) {
  const { s, setField, setErrors, setVerified, checkStep, pullBureauAndContinue, toast } = useApp();
  const { d, v } = s;
  const biz = isBusiness(d);
  const [busy, call] = useFakeCall();
  const [otp, setOtp] = useState({ code: null, tries: 0, sentAt: 0, input: '' });
  const [now, setNow] = useState(Date.now());

  useEffect(() => { setOtp({ code: null, tries: 0, sentAt: 0, input: '' }); }, [d.mobile]);
  useEffect(() => { if (!otp.code || v.mobile) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [otp.code, v.mobile]);
  const wait = otp.code ? Math.max(0, 30 - Math.floor((now - otp.sentAt) / 1000)) : 0;

  const verify = (key, field, ms = 700) => {
    if (v[key]) return;
    const m = VAL[field](d[field], d);
    const empty = !d[field];
    if (m || empty) { setErrors({ [field]: m || 'Enter a value first.' }); return; }
    setErrors({ [field]: '' });
    call(key, ms, () => setVerified(key, true));
  };
  const sendOtp = () => {
    if (v.mobile) return;
    const m = VAL.mobile(d.mobile);
    if (m) { setErrors({ mobile: m }); return; }
    if (otp.code && wait > 0) { setErrors({ mobile: `You can resend the OTP in ${wait} seconds.` }); return; }
    setErrors({ mobile: '' });
    call('otp', 600, () => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setOtp({ code, tries: 0, sentAt: Date.now(), input: '' }); setNow(Date.now());
      toast(<>Demo SMS to +91 {d.mobile.replace(/(\d{5})(\d{5})/, '$1 $2')}: your OTP is <b>{code}</b></>);
      setTimeout(() => document.getElementById('otp')?.focus(), 50);
    });
  };
  const verifyOtp = () => {
    if (!/^\d{6}$/.test(otp.input)) { setErrors({ mobile: 'Enter the 6-digit OTP.' }); return; }
    if (otp.tries >= 3) { setErrors({ mobile: 'Too many wrong attempts. Request a new OTP.' }); return; }
    if (otp.input !== otp.code) {
      const tries = otp.tries + 1; setOtp({ ...otp, tries });
      setErrors({ mobile: tries >= 3 ? 'Too many wrong attempts. Request a new OTP.' : `OTP doesn't match. ${3 - tries} attempt${3 - tries === 1 ? '' : 's'} left.` });
      return;
    }
    setVerified('mobile', true);
  };

  const next = () => { if (!checkStep(0)) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } call('next', 1100, pullBureauAndContinue); };

  const products = PRODUCTS.filter((p) => p.types.includes(d.applicantType));
  const prod = productById(d.productId);
  const cfg = configOf(d);
  const nm = d.pan && d.pan.length === 10 ? nameMatch(d) : null;
  const age = ageOf(d); const vintage = vintageOf(d);
  const amt = money(d.amount);

  return (
    <section className="panel" aria-labelledby="h-app">
      <StepHeader n={1} title="Applicant details" lede="Choose the applicant type, then capture identity exactly as printed on the documents. Each ID is verified before the credit bureau is pulled." />
      <AiIntake onOpenLog={onOpenLog} />
      <ErrorSummary ids={stepFields(0, d)} />

      <div className="segtoggle" role="group" aria-label="Applicant type">
        {['Individual', 'Business'].map((t) => <button key={t} type="button" aria-pressed={d.applicantType === t} onClick={() => setField('applicantType', t)}>{t}</button>)}
      </div>

      <p className="sectitle">Loan request</p>
      <div className="grid">
        <Field id="customerType" label="Customer type" span>
          <Radios id="customerType" label="Customer type" options={[{ value: 'New', label: 'New customer', sub: 'First loan with us' }, { value: 'Existing', label: 'Existing customer', sub: 'Has or had a loan with us' }]} />
        </Field>
        <Field id="productId" label="Product" extra={prod && <span className="pill na" style={{ padding: '0 8px' }}>{prod.loanType}</span>}>
          <Select id="productId" options={products.map((p) => p.id)} placeholder="Select product" />
        </Field>
        <Field id="purpose" label="Purpose"><Select id="purpose" options={PURPOSES} placeholder="Select purpose" /></Field>
        <Field id="amount" label="Loan amount" hint={prod ? `${inr(prod.min)} – ${inr(prod.max)}${amt ? ` · ₹${amountWords(amt)}` : ''}` : amt ? `₹${amountWords(amt)}` : ''}><Input id="amount" money prefix="₹" placeholder="3,00,000" /></Field>
        <Field id="tenure" label="Tenure" hint={prod ? `${prod.tmin}–${prod.tmax} months` : ''}><Input id="tenure" suffix="months" inputMode="numeric" placeholder="36" /></Field>
      </div>
      {s.errors.configMatch ? <p className="err" style={{ marginTop: 10 }}>{s.errors.configMatch}</p>
        : cfg ? <p className="hint" style={{ marginTop: 10 }}><span className="pill pass">✓ Rules: {cfg.id} v{cfg.version}</span> Published eligibility configuration for {d.applicantType} · {d.customerType} · {d.productId}.</p> : null}

      {biz ? (
        <>
          <p className="sectitle">Business</p>
          <div className="grid">
            <Field id="businessName" label="Business name" span><Input id="businessName" placeholder="e.g. Rao Textiles & Traders" /></Field>
            <Field id="pan" label="Business PAN" hint={nm && !VAL.pan(d.pan, d) ? (nm.ok ? `5th character ${nm.ch} matches "${nm.sur}".` : `5th character ${nm.ch} doesn't match the business or promoter name.`) : 'Company, firm or proprietor PAN'}>
              <div className="inline"><Input id="pan" placeholder="AACCR1234F" /><VerifyBtn done={v.pan} busy={busy === 'pan'} onClick={() => verify('pan', 'pan')} /></div>
            </Field>
            <Field id="startYear" label="Business start year" hint={vintage != null && !VAL.startYear(d.startYear, d) ? `Business vintage: ${vintage} years (auto-calculated)` : ''}><Input id="startYear" inputMode="numeric" placeholder="2016" /></Field>
            <Field id="udyam" label="Udyam registration" optional={cfg?.global.udyamRequired ? false : 'optional'}>
              <div className="inline"><Input id="udyam" placeholder="UDYAM-KR-03-0012345" /><VerifyBtn done={v.udyam} busy={busy === 'udyam'} onClick={() => verify('udyam', 'udyam')} /></div>
            </Field>
            <Field id="gstin" label="GSTIN" optional={cfg?.tax.gstRequired ? false : 'optional'} hint={cfg?.tax.gstRequired ? 'This product checks the GST compliance score.' : ''}>
              <div className="inline"><Input id="gstin" placeholder="29AACCR1234F1Z5" /><VerifyBtn done={v.gstin} busy={busy === 'gstin'} onClick={() => verify('gstin', 'gstin')} /></div>
            </Field>
          </div>
          <p className="sectitle">Promoter / proprietor</p>
          <div className="grid">
            <Field id="fullName" label="Promoter name"><Input id="fullName" placeholder="As on PAN" autoComplete="off" /></Field>
            <Field id="dob" label="Promoter date of birth" hint={age != null && !VAL.dob(d.dob) ? `Age ${age} (auto-calculated)` : ''}><Input id="dob" type="date" /></Field>
          </div>
        </>
      ) : (
        <>
          <p className="sectitle">Identity</p>
          <div className="grid">
            <Field id="fullName" label="Full name" hint="As printed on the PAN card"><Input id="fullName" placeholder="e.g. Shiva Kumar" autoComplete="off" /></Field>
            <Field id="dob" label="Date of birth" hint={age != null && !VAL.dob(d.dob) ? `Age ${age} (auto-calculated)` : ''}><Input id="dob" type="date" /></Field>
            <Field id="idNumber" label={d.idType === 'voter' ? 'Voter ID (EPIC)' : 'Aadhaar number'} extra={
              <span className="tabs" style={{ marginLeft: 'auto' }}>
                <button type="button" aria-pressed={d.idType !== 'voter'} onClick={() => setField('idType', 'aadhaar')} style={{ padding: '2px 10px', fontSize: 11.5 }}>Aadhaar</button>
                <button type="button" aria-pressed={d.idType === 'voter'} onClick={() => setField('idType', 'voter')} style={{ padding: '2px 10px', fontSize: 11.5 }}>Voter ID</button>
              </span>}>
              <div className="inline"><Input id="idNumber" mask={d.idType === 'voter' ? voterMask : aadhaarMask} inputMode={d.idType === 'voter' ? 'text' : 'numeric'} placeholder={d.idType === 'voter' ? 'TNX4829173' : '1234 5678 9012'} /><VerifyBtn done={v.id} busy={busy === 'id'} onClick={() => verify('id', 'idNumber')} /></div>
            </Field>
            <Field id="pan" label="PAN" hint={nm && !VAL.pan(d.pan, d) ? (nm.ok ? `5th character ${nm.ch} matches surname "${nm.sur}".` : `5th character ${nm.ch} doesn't match surname "${nm.sur}". The rules engine will flag this.`) : ''}>
              <div className="inline"><Input id="pan" placeholder="ABCPK1234F" /><VerifyBtn done={v.pan} busy={busy === 'pan'} onClick={() => verify('pan', 'pan')} /></div>
            </Field>
          </div>
        </>
      )}

      <p className="sectitle">{biz ? 'Business address' : 'Address'}</p>
      <div className="grid">
        <Field id="pincode" label="PIN code" hint={s.auto.city || s.auto.state ? 'City and state filled from the PIN code.' : ''}><Input id="pincode" inputMode="numeric" placeholder="600040" /></Field>
        <Field id="address" label="Address"><Input id="address" placeholder="House / door no., street, area" /></Field>
        <Field id="city" label="City" src={s.auto.city ? 'auto' : undefined}><Input id="city" /></Field>
        <Field id="state" label="State" src={s.auto.state ? 'auto' : undefined}><Input id="state" /></Field>
        <Field id="country" label="Country"><Input id="country" readOnly /></Field>
      </div>

      <p className="sectitle">Contact</p>
      <div className="grid">
        <Field id="mobile" label="Phone number" hint={v.mobile ? '' : otp.code ? `OTP sent.${wait ? ` Resend in ${wait}s.` : ''}` : 'We send a one-time password to verify.'}>
          <div className="inline"><Input id="mobile" prefix="+91" inputMode="numeric" placeholder="98400 12345" /><VerifyBtn done={v.mobile} busy={busy === 'otp'} onClick={sendOtp} label={otp.code ? 'Resend' : 'Send OTP'} /></div>
          {otp.code && !v.mobile && (
            <div className="inline" style={{ marginTop: 6 }}>
              <div className="ctl"><input id="otp" inputMode="numeric" maxLength={6} value={otp.input} onChange={(e) => setOtp({ ...otp, input: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="6-digit OTP" aria-label="OTP" onKeyDown={(e) => e.key === 'Enter' && verifyOtp()} /></div>
              <button type="button" className="btn verify" onClick={verifyOtp}>Verify OTP</button>
            </div>
          )}
        </Field>
        <Field id="email" label="Email ID"><Input id="email" type="email" placeholder="name@example.com" /></Field>
      </div>

      <div style={{ marginTop: 18 }}>
        <Check id="consent">The customer agrees to a credit bureau check and to share bank statements through the Account Aggregator for this loan assessment.</Check>
      </div>

      <BottomBar next={next} nextLabel="Continue to bank statement →" busy={busy === 'next' ? 'Pulling credit bureau…' : ''} left={<span className="hint">Credit bureau is pulled when you continue.</span>} />
    </section>
  );
}
