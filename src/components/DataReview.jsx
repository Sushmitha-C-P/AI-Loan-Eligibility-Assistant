import { useState } from 'react';
import { useApp } from '../store.jsx';
import { reviewApplicant } from '../ai/tasks.js';
import { isAiReady } from '../ai/settings.js';
import { LABELS } from '../engine/validation.js';
import { Spinner } from './ui.jsx';
import { Checks } from './AiExplain.jsx';

const STEP_OF = { applicantType: 0, customerType: 0, productId: 0, purpose: 0, amount: 0, tenure: 0, dob: 0, startYear: 0, pincode: 0, gstin: 0, udyam: 0, bank: 1 };

export default function DataReview({ onOpenLog }) {
  const { s, settings, goStep, setAiHealth } = useApp();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const ready = isAiReady(settings);

  async function run() {
    setBusy(true); setOut(null);
    try { const r = await reviewApplicant(settings, s); setOut(r); if (r.mode === 'ai') setAiHealth({ ok: true, msg: `Last call ${r.ms} ms`, at: new Date() }); }
    catch (e) { setOut({ error: e.message }); setAiHealth({ ok: false, msg: e.message, at: new Date() }); }
    finally { setBusy(false); }
  }
  const jump = (f) => { const st = STEP_OF[f]; if (st != null) goStep(st); else document.getElementById(f)?.focus(); };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card tint">
        <div className="gh" style={{ marginBottom: 6 }}>
          <h3>AI review of entered data <span className="pill ai">{ready ? settings.model : 'rule-based (no key)'}</span></h3>
          <button type="button" className="btn ghost sm" onClick={run} disabled={busy}>{busy ? <><Spinner />Reviewing…</> : out ? 'Review again' : 'Review data with AI'}</button>
        </div>
        <p className="hint">Checks the whole application for contradictions and likely typos before the rules engine runs. Advisory only. Identifiers are not sent.</p>
        {out?.error && <p className="err" style={{ marginTop: 8 }}>{out.error}</p>}
        {out && !out.error && (
          <div className="findings" style={{ marginTop: 10 }}>
            <p><b>{out.findings.length ? `${out.findings.length} point${out.findings.length > 1 ? 's' : ''} to check.` : 'No issues found.'}</b> {out.summary} {out.mode === 'ai' && <span className="mono muted">· {out.ms} ms</span>}</p>
            {out.findings.map((f, i) => (
              <button key={i} type="button" className={`finding ${f.severity}`} onClick={() => jump(f.field)}>
                <span className={`pill ${f.severity === 'high' ? 'fail' : f.severity === 'medium' ? 'review' : 'na'}`}>{f.severity}</span>
                <span><b>{f.message}</b>{f.suggestion && <><br /><span className="muted">{f.suggestion}</span></>}</span>
                <span className="kchip">{LABELS[f.field] || f.field}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Checks checks={out.checks} />
              {out.logId && <button type="button" className="btn ghost sm" onClick={() => onOpenLog(out.logId)}>View prompt &amp; response</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
