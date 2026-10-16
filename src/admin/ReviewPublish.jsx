// Review & publish: blocking errors, what changed since the live version, impact on demo applicants,
// AI policy review, then publish. The RM app only ever reads the published copy.
import { useState } from 'react';
import { useApp } from '../store.jsx';
import { useConfigs, isDirty, publish, discardDraft, saveScope } from '../engine/configStore.js';
import { validateModules, validateScope, MODULE_OF } from '../engine/configValidation.js';
import { reviewConfig } from '../ai/tasks.js';
import { isAiReady } from '../ai/settings.js';
import { fmtDate } from '../engine/format.js';
import { Spinner } from '../components/ui.jsx';
import { Checks } from '../components/AiExplain.jsx';
import { MODULES } from './modules.jsx';
import { moduleSummary } from './Dashboard.jsx';
import { ScopeForm, statusOf } from './Configurations.jsx';
import Preview from './Preview.jsx';

function flatten(o, pre = '', out = {}) {
  if (Array.isArray(o)) { o.forEach((x, i) => flatten(x, `${pre}.${i + 1}`, out)); if (!o.length) out[pre] = '(none)'; return out; }
  if (o && typeof o === 'object') { Object.entries(o).forEach(([k, v]) => { if (k !== 'id') flatten(v, pre ? `${pre}.${k}` : k, out); }); return out; }
  out[pre] = o === '' ? '—' : String(o); return out;
}
const pretty = (p) => p.replace(/^(\w+)\./, (_, m) => `${MODULES.find((x) => x.key === m)?.label || m} › `).replace(/\./g, ' › ');

export default function ReviewPublish({ c, onGo, onOpenLog }) {
  const { settings, toast } = useApp();
  const configs = useConfigs();
  const [scope, setScope] = useState(null);
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmPub, setConfirmPub] = useState(false);
  const { errors, warnings } = validateModules(c.draft, c.scope);
  const errList = Object.entries(errors);
  const dirty = isDirty(c);
  const a = c.published ? flatten(c.published) : {}; const b = flatten(c.draft);
  const changes = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  const [tone, label] = statusOf(c);
  const scopeErr = scope ? validateScope(scope, configs, c.id) : {};

  const runAi = async () => { setBusy(true); try { setAi(await reviewConfig(settings, c)); } catch (e) { setAi({ error: e.message }); } finally { setBusy(false); } };
  const doPublish = () => { publish(c.id); setConfirmPub(false); toast(`${c.id} v${(c.version || 0) + 1} published. The RM app uses it from the next check.`); };

  return (
    <>
      <div className="adm-head">
        <div><h1>Review &amp; publish</h1><p>The RM app keeps using the live version until you publish. Publishing creates a new version; applications record the version they were checked with.</p></div>
        <div className="acts"><span className={`status-chip ${tone}`}>{label}</span></div>
      </div>

      <section className="mcard">
        <h3>{c.id} · {c.scope.productId} <small>{c.scope.applicantTypes.join(' / ')} · {c.scope.customerTypes.join(' / ')} · {c.published ? `published ${fmtDate(new Date(c.publishedAt))}` : 'never published'}</small></h3>
        {!scope ? <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setScope(structuredClone(c.scope))}>Edit scope</button> : (
          <div style={{ marginTop: 12 }}>
            <ScopeForm scope={scope} onChange={setScope} errors={scopeErr} />
            <p className="hint" style={{ marginTop: 8 }}>Scope takes effect as soon as you save it, because it decides which applications use this configuration.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button type="button" className="btn primary sm" disabled={Object.keys(scopeErr).length > 0} onClick={() => { saveScope(c.id, scope); setScope(null); toast('Scope saved.'); }}>Save scope</button><button type="button" className="btn ghost sm" onClick={() => setScope(null)}>Cancel</button></div>
          </div>
        )}
        <div className="summ" style={{ marginTop: 14 }}>
          {MODULES.map((x) => {
            const e = errList.filter(([k]) => MODULE_OF(k) === x.key).length;
            return <button key={x.key} type="button" className="mtile" onClick={() => onGo(x.key)}><div className="row"><b>{x.label}</b>{e ? <span className="pill fail">{e}</span> : <span className="pill pass">✓</span>}</div><small>{moduleSummary(x.key, c.draft)}</small></button>;
          })}
        </div>
      </section>

      <div className="mgrid g2">
        <section className="mcard">
          <h3>Blocking errors <small>{errList.length}</small></h3>
          <div className="attn" style={{ marginTop: 10 }}>
            {errList.length ? errList.map(([k, v]) => <button key={k} type="button" onClick={() => onGo(MODULE_OF(k))}><span className="dot fail" /><span>{v}</span><span className="kchip">{MODULES.find((x) => x.key === MODULE_OF(k))?.label}</span></button>) : <p className="ok-t">✓ No blocking errors.</p>}
          </div>
          {warnings.length > 0 && <><h3 style={{ marginTop: 16, fontSize: 14 }}>Warnings <small>{warnings.length}</small></h3><div className="attn" style={{ marginTop: 8 }}>{warnings.map((w, i) => <button key={i} type="button" onClick={() => onGo(w.module)}><span className="dot review" /><span>{w.text}</span><span className="kchip">{MODULES.find((x) => x.key === w.module)?.label}</span></button>)}</div></>}
        </section>
        <section className="mcard">
          <h3>Changes since the live version <small>{c.published ? changes.length : 'first version'}</small></h3>
          {!c.published ? <p className="hint" style={{ marginTop: 8 }}>Everything is new. Publishing makes this configuration live.</p>
            : changes.length ? <div className="changes" style={{ marginTop: 10 }}>{changes.map((k) => <div key={k}><span>{pretty(k)}</span><s>{a[k] ?? '—'}</s><span>→</span><b>{b[k] ?? '(removed)'}</b></div>)}</div>
              : <p className="hint" style={{ marginTop: 8 }}>No changes. The draft matches the live version.</p>}
        </section>
      </div>

      <section className="mcard">
        <h3>AI policy review <span className="pill ai">{isAiReady(settings) ? settings.model : 'rule-based (no key)'}</span></h3>
        <p className="sub">A second pair of eyes on the draft: loose or strict thresholds, missing checks, contradictions. Advisory only; it cannot publish or change anything.</p>
        <button type="button" className="btn ghost sm" onClick={runAi} disabled={busy}>{busy ? <><Spinner />Reviewing…</> : ai ? 'Review again' : 'Review draft with AI'}</button>
        {ai?.error && <p className="err" style={{ marginTop: 8 }}>{ai.error}</p>}
        {ai && !ai.error && (
          <div className="findings" style={{ marginTop: 10 }}>
            <p><b>{ai.findings.length ? `${ai.findings.length} point${ai.findings.length > 1 ? 's' : ''} to consider.` : 'Nothing stands out.'}</b> {ai.summary} {ai.mode === 'ai' && <span className="mono muted">· {ai.ms} ms</span>}</p>
            {ai.findings.map((f, i) => (
              <button key={i} type="button" className={`finding ${f.severity}`} onClick={() => f.module !== 'scope' && onGo(f.module)}>
                <span className={`pill ${f.severity === 'high' ? 'fail' : f.severity === 'medium' ? 'review' : 'na'}`}>{f.severity}</span>
                <span><b>{f.message}</b>{f.suggestion && <><br /><span className="muted">{f.suggestion}</span></>}</span>
                <span className="kchip">{MODULES.find((x) => x.key === f.module)?.label || 'Scope'}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Checks checks={ai.checks} />{ai.logId && <button type="button" className="btn ghost sm" onClick={() => onOpenLog(ai.logId)}>View prompt &amp; response</button>}</div>
          </div>
        )}
      </section>

      <Preview c={c} title="Impact on demo applicants (published → draft)" />

      <section className="mcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><b>{errList.length ? `Fix ${errList.length} error${errList.length > 1 ? 's' : ''} to publish` : dirty ? `Ready to publish v${(c.version || 0) + 1}` : 'Nothing to publish'}</b><p className="hint">{c.active ? 'This configuration is active.' : 'This configuration is inactive; publishing will not affect the RM app until it is made active.'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {c.published && dirty && <button type="button" className="btn ghost" onClick={() => { if (confirm('Discard all draft changes and go back to the live version?')) { discardDraft(c.id); toast('Draft changes discarded.'); } }}>Discard draft changes</button>}
          {!confirmPub
            ? <button type="button" className="btn primary" disabled={errList.length > 0 || !dirty} onClick={() => setConfirmPub(true)}>Publish v{(c.version || 0) + 1}</button>
            : <><button type="button" className="btn ghost" onClick={() => setConfirmPub(false)}>Cancel</button><button type="button" className="btn gold" onClick={doPublish}>Confirm publish</button></>}
        </div>
      </section>
    </>
  );
}
