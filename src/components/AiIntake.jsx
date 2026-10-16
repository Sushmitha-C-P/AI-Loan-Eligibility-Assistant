import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { extractCustomer } from '../ai/tasks.js';
import { isAiReady } from '../ai/settings.js';
import { SAMPLES } from '../engine/mocks.js';
import { LABELS, ageOf } from '../engine/validation.js';
import { inr, formatMoney } from '../engine/format.js';
import { bandInfo } from '../engine/master.js';
import { Spinner } from './ui.jsx';

const MONEY = new Set(['amount', 'salary', 'business', 'house', 'capital', 'other', 'family', 'food', 'medical', 'insurance', 'education', 'rent', 'otherExp', 'turnover', 'totalIncome', 'opex', 'depreciation', 'financeCost', 'taxPaid']);
const SHOW = (k, v) => (MONEY.has(k) ? '₹' + formatMoney(v) : /Band$/.test(k) ? bandInfo(v)?.label || v : k === 'tenure' ? `${v} months` : v);

export default function AiIntake({ onOpenLog }) {
  const app = useApp();
  const { s, settings, applyAiFields, loadIdentityOnly, setAiHealth } = app;
  const [note, setNote] = useState(s.sample ? SAMPLES[s.sample].note : '');
  const [open, setOpen] = useState(!s.sample);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const t0 = useRef(0);
  const ready = isAiReady(settings);

  useEffect(() => { if (s.sample && !note) setNote(SAMPLES[s.sample].note); }, [s.sample]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!busy) return; const t = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 100); return () => clearInterval(t); }, [busy]);

  const pickSample = (key) => { loadIdentityOnly(key); setNote(SAMPLES[key].note); setOut(null); setErr(''); };

  async function extract() {
    if (!note.trim()) { setErr('Paste or type a note about the customer first.'); return; }
    setBusy(true); setErr(''); setOut(null); t0.current = performance.now(); setElapsed(0);
    try {
      const r = await extractCustomer(settings, note);
      const fields = { ...r.fields };
      if (s.d.fullName && fields.fullName) delete fields.fullName; // identity comes from verified KYC, not from AI
      if (s.d.businessName && fields.businessName) delete fields.businessName;
      applyAiFields(fields);
      setOut({ ...r, applied: fields });
      if (r.mode === 'ai') setAiHealth({ ok: true, msg: `Last call ${r.ms} ms`, at: new Date() });
    } catch (e) {
      setErr(e.message); setAiHealth({ ok: false, msg: e.message, at: new Date() });
    } finally { setBusy(false); }
  }

  const age = ageOf(s.d);
  return (
    <section className="intake" aria-labelledby="intake-h">
      <div className="intake-h">
        <div>
          <h3 id="intake-h">Quick fill with AI <span className="pill ai">{ready ? `${settings.model}` : 'Offline parser'}</span></h3>
          <p>Paste the RM's note in plain words (English or mixed Tamil/Hindi). The model picks the applicant type, product and loan request, and fills income, expenses, stability and business financials for step 3. Identity documents are never taken from free text.</p>
        </div>
      </div>
      {!open ? <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>Open quick fill</button> : <>
      <textarea id="intakeNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New customer Shiva Kumar, salaried 50k a month plus 5k rent, same house 6 years, food 4,000, school fees 2,500… wants 3.5 lakh personal loan over 48 months. Pick a sample below to try." aria-label="Customer note for AI extraction" />
      <div className="intake-f">
        <div className="chipset" aria-label="Sample notes">
          <span className="hint" style={{ alignSelf: 'center' }}>Sample notes:</span>
          {Object.entries(SAMPLES).map(([k, v]) => <button key={k} type="button" className="kchip" style={{ cursor: 'pointer' }} onClick={() => pickSample(k)}>{v.label.split(' (')[0]}</button>)}
        </div>
        <button className="btn primary" type="button" onClick={extract} disabled={busy}>
          {busy ? <><Spinner />Extracting… <span className="timer">{elapsed.toFixed(1)}s</span></> : ready ? 'Extract with AI' : 'Extract (offline)'}
        </button>
      </div>
      {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
      </>}
      {out && (
        <div className="intake-out" role="status">
          <div className="ai-meta">
            <span className="pill pass">✓ {Object.keys(out.applied).length} fields filled</span>
            {out.mode === 'ai' ? <span className="mono">{out.model} · {out.ms} ms</span> : <span>Offline keyword parser (no AI key)</span>}
            {out.redacted.count > 0 && <span className="pill auto">{out.redacted.count} identifier{out.redacted.count > 1 ? 's' : ''} masked before sending</span>}
            {out.logId && <button type="button" className="btn ghost sm" onClick={() => onOpenLog(out.logId)}>View prompt &amp; response</button>}
          </div>
          {out.notes && <p><b>Summary:</b> {out.notes}</p>}
          <div className="chipset">{Object.entries(out.applied).map(([k, v]) => <span key={k} className="kchip">{LABELS[k] || k}: <b>{SHOW(k, v)}</b></span>)}</div>
          {out.missing.length > 0 && <p><b>Not in the note:</b> {out.missing.join(', ')}</p>}
          {out.info.existingEmi != null && <p className="hint">RM mentioned EMIs of {inr(out.info.existingEmi)}. Obligations are taken from the credit bureau, so this is not typed anywhere.</p>}
          {out.info.age != null && age != null && Math.abs(out.info.age - age) > 1 && <p className="warnline">Note says age {out.info.age}, but the date of birth gives {age}. Check with the customer.</p>}
          {out.assumed.length > 0 && <p className="hint">Assumed: {out.assumed.join('; ')}. Please confirm.</p>}
          {out.dropped.length > 0 && <p className="hint">Ignored (failed validation): {out.dropped.map((k) => LABELS[k] || k).join(', ')}</p>}
        </div>
      )}
    </section>
  );
}
