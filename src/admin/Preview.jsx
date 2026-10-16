// Impact preview: runs the real rules engine against demo applicants with the DRAFT and the PUBLISHED rules,
// so the admin sees what a change does before publishing.
import { useMemo } from 'react';
import { runBRE } from '../engine/bre.js';
import { asRuntime } from '../engine/configStore.js';
import { SAMPLES, mockBureau, mockBank, mockGst } from '../engine/mocks.js';
import { productById } from '../engine/master.js';
import { inr } from '../engine/format.js';

const SHORT = { pass: 'Eligible', review: 'Review', partial: 'Partial', fail: 'Not eligible' };
const TONE = { pass: 'pass', review: 'review', partial: 'review', fail: 'fail' };

export function sampleStates(c) {
  const p = productById(c.scope.productId);
  return Object.entries(SAMPLES).filter(([, smp]) => c.scope.applicantTypes.includes(smp.d.applicantType)).map(([key, smp]) => {
    const d = structuredClone(smp.d);
    if (p) { d.productId = p.id; d.amount = String(Math.min(p.max, Math.max(p.min, Number(d.amount)))); d.tenure = String(Math.min(p.tmax, Math.max(p.tmin, Number(d.tenure)))); }
    if (!c.scope.customerTypes.includes(d.customerType)) d.customerType = c.scope.customerTypes[0] || d.customerType;
    const biz = d.applicantType === 'Business';
    return { key, label: smp.label.split(' · ')[0], st: { d, v: { id: true, pan: true, mobile: true, udyam: !!d.udyam, gstin: !!d.gstin }, bureau: mockBureau(d.pan, biz), bank: mockBank(d.pan, 6), gst: biz ? mockGst(d.pan, d.gstin) : null } };
  });
}
const safeRun = (st, cfg) => { try { return runBRE(st, cfg); } catch (_) { return null; } };

export function useImpact(c) {
  return useMemo(() => {
    if (!c) return [];
    const draft = asRuntime(c, 'draft'); const pub = c.published ? asRuntime(c, 'published') : null;
    return sampleStates(c).map((x) => ({ ...x, draft: safeRun(x.st, draft), pub: pub ? safeRun(x.st, pub) : null }));
  }, [c]);
}

export default function Preview({ c, module, title = 'Impact preview' }) {
  const rows = useImpact(c);
  const flips = rows.filter((r) => r.pub && r.draft && r.pub.key !== r.draft.key).length;
  if (!rows.length) return <div className="emptybox">No demo applicants match this configuration's scope.</div>;
  return (
    <div className="preview">
      <div className="preview-h">
        <div><b>{title}</b> <span className="hint">· real rules engine · demo applicants{module ? ' · this module\'s checks' : ''}</span></div>
        {c.published ? <span className={`pill ${flips ? 'review' : 'pass'}`}>{flips ? `${flips} decision${flips > 1 ? 's' : ''} change vs published` : 'No decision changes vs published'}</span> : <span className="pill na">Not published yet</span>}
      </div>
      <div className="tscroll">
        <table>
          <thead><tr><th>Demo applicant</th><th>Loan</th><th>Published</th><th>Draft</th>{module && <th>Checks in this module (draft)</th>}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const mod = module && r.draft ? r.draft.rules.filter((x) => x.module === module && x.status !== 'skip') : [];
              const changed = r.pub && r.draft && r.pub.key !== r.draft.key;
              return (
                <tr key={r.key}>
                  <td><b>{r.label}</b><br /><span className="hint">{r.st.d.applicantType}</span></td>
                  <td className="num">{inr(Number(r.st.d.amount))}<br /><span className="hint">{r.st.d.tenure} m</span></td>
                  <td>{r.pub ? <span className={`pill ${TONE[r.pub.key]}`}>{SHORT[r.pub.key]} · {r.pub.score}%</span> : <span className="hint">—</span>}</td>
                  <td>{r.draft ? <span className={`pill ${TONE[r.draft.key]}`}>{SHORT[r.draft.key]} · {r.draft.score}%</span> : <span className="bad-t">Error</span>}{changed && <span className="flip"> ← changed</span>}</td>
                  {module && <td><div className="chipset">{mod.length ? mod.map((x) => <span key={x.id} className={`pill ${x.status}`} title={`${x.name}: ${x.value}`}>{x.id} {x.status === 'pass' ? '✓' : x.status === 'fail' ? '✕' : x.status === 'review' ? '!' : '?'}</span>) : <span className="hint">No checks run</span>}</div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
