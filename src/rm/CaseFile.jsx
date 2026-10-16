// Right-hand case summary: what has been captured and verified so far.
import { useApp } from '../store.jsx';
import { configOf, isBusiness, ageOf, vintageOf } from '../engine/validation.js';
import { moneyCalc, internalScore } from '../engine/bre.js';
import { productById, BUREAUS } from '../engine/master.js';
import { inr, money, pct } from '../engine/format.js';

const Tick = ({ ok, children }) => <span className={`mini ${ok ? 'ok' : 'no'}`}>{ok ? '✓ ' : ''}{children}</span>;

export default function CaseFile() {
  const { s } = useApp();
  const d = s.d; const biz = isBusiness(d);
  const cfg = configOf(d); const p = productById(d.productId);
  const m = s.bureau ? moneyCalc(d, s.bureau, cfg) : null; const is = internalScore(d);
  const req = BUREAUS.filter((x) => cfg?.bureau.vendors[x.key].required);
  const low = s.bureau ? Math.min(...(req.length ? req : BUREAUS).map((x) => s.bureau.by[x.key].score)) : null;
  return (
    <aside className="casefile case" aria-label="Case file">
      <div className="case-h"><h3>Case file</h3><span className="mono hint">{s.appId}</span></div>
      <div className="case-sec">
        <h4>Applicant</h4>
        <div className="crow"><span>{biz ? 'Business' : 'Name'}</span><b>{(biz ? d.businessName : d.fullName) || '—'}</b></div>
        {biz && <div className="crow"><span>Promoter</span><b>{d.fullName || '—'}</b></div>}
        <div className="crow"><span>Type</span><b>{d.applicantType} · {d.customerType}</b></div>
        <div className="crow"><span>{biz ? 'Vintage' : 'Age'}</span><b>{biz ? (vintageOf(d) != null ? `${vintageOf(d)} yrs` : '—') : ageOf(d) != null ? `${ageOf(d)} yrs` : '—'}</b></div>
        <div className="chips" style={{ marginTop: 6 }}>
          {!biz && <Tick ok={s.v.id}>{d.idType === 'voter' ? 'Voter ID' : 'Aadhaar'}</Tick>}
          <Tick ok={s.v.pan}>PAN</Tick>
          <Tick ok={s.v.mobile}>Mobile</Tick>
          {biz && d.udyam && <Tick ok={s.v.udyam}>Udyam</Tick>}
          {biz && d.gstin && <Tick ok={s.v.gstin}>GST</Tick>}
        </div>
      </div>
      <div className="case-sec">
        <h4>Loan</h4>
        <div className="crow"><span>Product</span><b>{p ? p.id : '—'}</b></div>
        <div className="crow"><span>Amount</span><b>{money(d.amount) ? inr(money(d.amount)) : '—'}</b></div>
        <div className="crow"><span>Tenure</span><b>{d.tenure ? `${d.tenure} months` : '—'}</b></div>
        <div className="crow"><span>Rules</span><b>{cfg ? `${cfg.id} v${cfg.version}` : '—'}</b></div>
      </div>
      <div className="case-sec">
        <h4>Data pulled</h4>
        <div className="crow"><span>Credit bureau</span><b>{s.bureau ? `Lowest ${low}` : 'Not yet'}</b></div>
        <div className="crow"><span>Bank statement</span><b>{s.bank ? (s.bank.source === 'aa' ? `AA · ${s.bank.months} m` : `PDF · ${s.bank.months} m`) : s.bankSkipped ? 'Skipped' : 'Not yet'}</b></div>
        {biz && <div className="crow"><span>GST score</span><b>{s.gst ? `${s.gst.score}/100` : d.gstin ? 'On continue' : '—'}</b></div>}
      </div>
      {m && (
        <div className="case-sec">
          <h4>Live figures</h4>
          <div className="crow"><span>{biz ? 'Monthly surplus' : 'Net income'}</span><b>{inr(biz ? m.gross : m.net)}</b></div>
          <div className="crow"><span>Bureau EMIs</span><b>{inr(m.cbObl)}</b></div>
          <div className="crow"><span>FOIR</span><b>{pct(m.foir)}</b></div>
          {biz && <div className="crow"><span>EBITDA margin</span><b>{m.ebitdaM == null ? '—' : pct(m.ebitdaM)}</b></div>}
          <div className="crow"><span>Internal score</span><b>{is.provided ? `${Math.round(is.pct)}%` : '—'}</b></div>
        </div>
      )}
      {s.result && <div className="case-sec"><h4>Result</h4><span className={`pill ${s.result.key === 'partial' ? 'review' : s.result.key}`}>{s.result.label}</span></div>}
    </aside>
  );
}
