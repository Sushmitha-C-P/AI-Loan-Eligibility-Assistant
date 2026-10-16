import { useState } from 'react';
import { useApp } from '../store.jsx';
import { useConfigs, isDirty, createConfig, saveDraft } from '../engine/configStore.js';
import { validateModules, validateScope, MODULE_OF } from '../engine/configValidation.js';
import { useApps, STATUS_TONE } from '../engine/appsStore.js';
import { draftConfig } from '../ai/tasks.js';
import { isAiReady } from '../ai/settings.js';
import { inr } from '../engine/format.js';
import { Spinner } from '../components/ui.jsx';
import { MODULES } from './modules.jsx';

const SAMPLE_POLICY = `Business Enhancement Loan for new and existing individual and business customers. Age 23 to 62. Business vintage at least 3 years.
CIBIL 700+ and CRIF 680+, director score 700, CMR rank at most 6. No more than 3 enquiries in 90 days, no written-off or settled accounts, max 1 overdue account. Reject SMA and NPA accounts, suit filed or wilful defaulters.
FOIR must be below 50% and the internal stability score at least 50%.
Bank: up to 5 lakh needs average balance 15,000 and no bounces; 5 to 10 lakh needs 25,000 and no bounces; above 10 lakh needs 40,000 and at most 1 bounce.
Skip ITR up to 3 lakh. GST compliance score at least 60. EBITDA margin below 12% is high risk and above 25% is low risk; PAT below 5% is high risk and above 10% is low; send high risk to manual review.`;

export function moduleSummary(key, m) {
  const g = m.global;
  switch (key) {
    case 'global': return `${g.ageRequired ? `Age ${g.minAge || '?'}${g.maxAge ? `–${g.maxAge}` : '+'}` : 'No age check'} · ${g.rules.filter((r) => r.enabled).length} custom rules · ${g.negativePincodes.length} negative PINs`;
    case 'bureau': { const v = Object.entries(m.bureau.vendors).filter(([, x]) => x.required); return `${v.length ? v.map(([k, x]) => `${k === 'highmark' ? 'CRIF' : k.toUpperCase()} ${x.applicantMin || '?'}`).join(' · ') : 'No vendor'} · ${m.bureau.params.filter((p) => p.enabled).length} report checks`; }
    case 'bank': return m.bank.required ? `${m.bank.bands.length} loan band${m.bank.bands.length === 1 ? '' : 's'} · variance ${m.bank.incomeVariance}×` : 'Off';
    case 'tax': return `${m.tax.itrApplicantRequired || m.tax.itrBusinessRequired ? 'ITR required' : 'ITR not required'}${m.tax.itrSkipTo ? ` · skip ≤ ${inr(Number(m.tax.itrSkipTo))}` : ''}${m.tax.gstRequired ? ` · GST ≥ ${m.tax.minGstScore}` : ''}`;
    case 'balance': return m.balance.enabled ? `EBITDA <${m.balance.ebitdaHigh}% high · PAT <${m.balance.patHigh}% high · ${m.balance.onHighRisk}` : 'Off';
    default: return '';
  }
}

function AiDraft({ selected, onGo, onSelect, onOpenLog }) {
  const { settings, toast } = useApp();
  const configs = useConfigs();
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const ready = isAiReady(settings);
  const go = async () => {
    if (!txt.trim()) { setErr('Paste the policy text first, or use the sample.'); return; }
    setBusy(true); setErr(''); setOut(null);
    try { setOut(await draftConfig(settings, txt)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const scopeErr = out ? validateScope(out.scope, configs, null) : {};
  const modErr = out ? Object.keys(validateModules(out.modules, out.scope.productId ? out.scope : { applicantTypes: ['Individual', 'Business'], customerTypes: [], productId: '' }).errors).length : 0;
  return (
    <section className="mcard">
      <h3>Draft rules from a policy note <span className="pill ai">{ready ? settings.model : 'needs AI key'}</span></h3>
      <p className="sub">Paste the credit policy in plain words. The AI maps it to all five modules as a <b>draft</b>. Nothing goes live until you review and publish.</p>
      <textarea className="ta" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="e.g. CIBIL 700+, FOIR below 50%, no SMA/NPA, skip ITR up to 5 lakh…" aria-label="Policy note" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary sm" onClick={go} disabled={busy}>{busy ? <><Spinner />Drafting…</> : 'Draft with AI'}</button>
        <button type="button" className="btn ghost sm" onClick={() => setTxt(SAMPLE_POLICY)}>Use sample policy</button>
      </div>
      {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
      {out && (
        <div className="intake-out" style={{ marginTop: 12 }}>
          <div className="ai-meta"><span className="pill pass">✓ {out.count} settings mapped</span><span className="mono">{out.model} · {out.ms} ms</span>{out.logId && <button type="button" className="btn ghost sm" onClick={() => onOpenLog(out.logId)}>View prompt &amp; response</button>}</div>
          <p><b>Scope:</b> {out.scope.productId || 'no product'} · {out.scope.applicantTypes.join(' / ') || '—'} · {out.scope.customerTypes.join(' / ') || '—'}</p>
          <div className="chipset">{MODULES.map((x) => <span key={x.key} className="kchip">{x.label}: <b>{moduleSummary(x.key, out.modules)}</b></span>)}</div>
          {out.unmapped.length > 0 && <p className="hint">Could not map: {out.unmapped.join('; ')}</p>}
          {modErr > 0 && <p className="warnline">{modErr} value{modErr > 1 ? 's' : ''} still need attention before publishing. You'll see them highlighted.</p>}
          {Object.values(scopeErr).map((x) => <p key={x} className="warnline">{x}</p>)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary sm" disabled={Object.keys(scopeErr).length > 0} onClick={() => { const c = createConfig(out.scope, out.modules); onSelect(c.id); toast(`${c.id} created as a draft.`); onGo('publish'); }}>Create as new configuration</button>
            <button type="button" className="btn ghost sm" onClick={() => { saveDraft(selected, out.modules); toast(`Applied to the ${selected} draft (scope unchanged).`); onGo('publish'); }}>Apply to {selected} draft</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ c, onGo, onSelect, onOpenLog }) {
  const { user } = useApp();
  const configs = useConfigs(); const apps = useApps();
  const { errors, warnings } = validateModules(c.draft, c.scope);
  const errBy = (k) => Object.keys(errors).filter((e) => MODULE_OF(e) === k).length;
  const live = configs.filter((x) => x.active && x.published).length;
  const drafts = configs.filter((x) => isDirty(x)).length;
  const attention = [...Object.entries(errors).map(([k, v]) => ({ module: MODULE_OF(k), text: v, sev: 'fail' })), ...warnings.map((w) => ({ ...w, sev: 'review' }))];
  return (
    <>
      <div className="adm-head">
        <div><h1>Welcome, {user.name.split(' ')[0]}</h1><p>Maintain the eligibility rules the RM app runs. Edit a draft module by module, check the impact on demo applicants, then publish.</p></div>
        <div className="acts"><button type="button" className="btn ghost" onClick={() => onGo('configs')}>All configurations</button><button type="button" className="btn primary" onClick={() => onGo('publish')}>Review &amp; publish {c.id}</button></div>
      </div>
      <div className="tiles">
        <div className="tile"><span>Configurations</span><strong>{configs.length}</strong><em>{configs.filter((x) => x.active).length} active</em></div>
        <div className="tile"><span>Live in the RM app</span><strong className="ok-t">{live}</strong><em>published &amp; active</em></div>
        <div className="tile"><span>Unpublished changes</span><strong style={{ color: 'var(--warn)' }}>{drafts}</strong><em>drafts waiting</em></div>
        <div className="tile"><span>Applications checked</span><strong>{apps.length}</strong><em>{apps.filter((a) => a.status === 'Sent to sanction').length} sent to sanction</em></div>
      </div>
      <section className="mcard">
        <h3>{c.id} · {c.scope.productId} <small>{c.scope.applicantTypes.join(' / ')} · {c.scope.customerTypes.join(' / ')}</small></h3>
        <p className="sub">{c.published ? `Live version v${c.version}.` : 'Never published.'} {isDirty(c) ? 'The draft has changes that are not live yet.' : 'Draft matches the live version.'}</p>
        <div className="mtiles">
          {MODULES.map((x) => {
            const e = errBy(x.key); const w = warnings.filter((y) => y.module === x.key).length;
            return (
              <button key={x.key} type="button" className="mtile" onClick={() => onGo(x.key)}>
                <div className="row"><b>{x.icon} {x.label}</b>{e ? <span className="pill fail">{e} to fix</span> : w ? <span className="pill review">{w} to check</span> : <span className="pill pass">✓</span>}</div>
                <small>{moduleSummary(x.key, c.draft)}</small>
              </button>
            );
          })}
        </div>
      </section>
      <div className="mgrid g2">
        <section className="mcard">
          <h3>Needs your attention <small>{attention.length}</small></h3>
          <p className="sub">Red items block publishing. Amber items are worth a look.</p>
          <div className="attn">
            {attention.length ? attention.slice(0, 8).map((a, i) => <button key={i} type="button" onClick={() => onGo(a.module)}><span className={`dot ${a.sev}`} /><span>{a.text}</span><span className="kchip">{MODULES.find((x) => x.key === a.module)?.label}</span></button>) : <p className="hint">Nothing needs attention.</p>}
          </div>
        </section>
        <section className="mcard">
          <h3>Latest applications <small>from the RM app</small></h3>
          <p className="sub">Each one was decided with the published rules at the time.</p>
          <div className="tscroll"><table><tbody>
            {apps.slice(0, 6).map((a) => <tr key={a.id}><td className="mono">{a.id}</td><td>{a.name}<br /><span className="hint">{a.productId}</span></td><td className="r"><span className={`pill ${STATUS_TONE[a.status]}`}>{a.status}</span></td></tr>)}
            {!apps.length && <tr><td className="hint">No applications yet.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
      <AiDraft selected={c.id} onGo={onGo} onSelect={onSelect} onOpenLog={onOpenLog} />
    </>
  );
}
