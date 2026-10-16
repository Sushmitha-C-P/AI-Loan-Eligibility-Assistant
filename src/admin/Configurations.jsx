import { useState } from 'react';
import { useApp } from '../store.jsx';
import { useConfigs, isDirty, createConfig, setActive, blankModules, resetConfigs } from '../engine/configStore.js';
import { validateScope } from '../engine/configValidation.js';
import { PRODUCTS, APPLICANT_TYPES, CUSTOMER_TYPES, productById } from '../engine/master.js';
import { fmtDate } from '../engine/format.js';
import { Chips, Sel, MField, Switch } from './controls.jsx';

export function statusOf(c) {
  if (!c.active) return ['off', 'Inactive'];
  if (!c.published) return ['draft', 'Never published'];
  return isDirty(c) ? ['draft', `Live v${c.version} · draft changes`] : ['live', `Live v${c.version}`];
}

export function ScopeForm({ scope, onChange, errors }) {
  const p = productById(scope.productId);
  return (
    <div className="mgrid">
      <MField label="Product" htmlFor="sc-prod" err={errors['scope.productId']} hint={p ? `${p.loanType} · ${p.types.join(' / ')}` : ''}><Sel id="sc-prod" value={scope.productId} onChange={(v) => onChange({ ...scope, productId: v })} options={[{ value: '', label: 'Select product' }, ...PRODUCTS.map((x) => ({ value: x.id, label: `${x.id} (${x.loanType})` }))]} err={errors['scope.productId']} /></MField>
      <MField label="Applicant types" err={errors['scope.applicantTypes']}><Chips options={APPLICANT_TYPES} value={scope.applicantTypes} onChange={(v) => onChange({ ...scope, applicantTypes: v })} /></MField>
      <MField label="Customer types" err={errors['scope.customerTypes']}><Chips options={CUSTOMER_TYPES} value={scope.customerTypes} onChange={(v) => onChange({ ...scope, customerTypes: v })} /></MField>
    </div>
  );
}

export default function Configurations({ selected, onSelect, onGo }) {
  const { toast } = useApp();
  const configs = useConfigs();
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [copyFrom, setCopyFrom] = useState('');
  const create = () => {
    const e = validateScope(form, configs, null); setErrs(e);
    if (Object.keys(e).length) return;
    const src = configs.find((x) => x.id === copyFrom);
    const c = createConfig(form, src ? structuredClone(src.draft) : blankModules());
    setForm(null); onSelect(c.id); toast(`${c.id} created as a draft.`); onGo('global');
  };
  return (
    <>
      <div className="adm-head">
        <div><h1>Configurations</h1><p>One configuration per product and applicant scope. The RM app picks the active, published configuration that matches the application's product, applicant type and customer type.</p></div>
        <div className="acts">
          <button type="button" className="btn ghost" onClick={() => { if (confirm('Reset all configurations to the demo seed? Drafts will be lost.')) { resetConfigs(); toast('Configurations reset.'); } }}>Reset demo data</button>
          <button type="button" className="btn primary" onClick={() => { setForm({ applicantTypes: [], customerTypes: ['New', 'Existing'], productId: '' }); setErrs({}); }}>+ New configuration</button>
        </div>
      </div>
      {form && (
        <section className="mcard" style={{ borderColor: 'var(--brand)' }}>
          <h3>New configuration</h3><p className="sub">Choose the scope. You can start blank or copy the rules of an existing configuration.</p>
          <ScopeForm scope={form} onChange={(f) => { setForm(f); setErrs(validateScope(f, configs, null)); }} errors={errs} />
          <div style={{ maxWidth: 360, marginTop: 14 }}><MField label="Start from" htmlFor="copyFrom"><Sel id="copyFrom" value={copyFrom} onChange={setCopyFrom} options={[{ value: '', label: 'Blank rules' }, ...configs.map((x) => ({ value: x.id, label: `Copy ${x.id} · ${x.scope.productId}` }))]} /></MField></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><button type="button" className="btn primary sm" onClick={create}>Create draft</button><button type="button" className="btn ghost sm" onClick={() => setForm(null)}>Cancel</button></div>
        </section>
      )}
      <div className="apps tscroll">
        <table>
          <thead><tr><th>ID</th><th>Product</th><th>Applicants</th><th>Customers</th><th>Status</th><th>Updated</th><th>Active</th><th /></tr></thead>
          <tbody>
            {configs.map((c) => {
              const [tone, label] = statusOf(c);
              return (
                <tr key={c.id} className={c.active ? '' : 'inactive'} style={{ cursor: 'default', outline: c.id === selected ? '2px solid var(--brand-soft)' : undefined }}>
                  <td className="mono"><b>{c.id}</b></td>
                  <td>{c.scope.productId}<br /><span className="hint">{productById(c.scope.productId)?.loanType}</span></td>
                  <td>{c.scope.applicantTypes.join(', ')}</td>
                  <td>{c.scope.customerTypes.join(', ')}</td>
                  <td><span className={`status-chip ${tone}`}>{label}</span></td>
                  <td className="hint">{fmtDate(new Date(c.updatedAt))}</td>
                  <td><Switch checked={c.active} onChange={(v) => {
                    if (v) { const e = validateScope(c.scope, configs.map((x) => (x.id === c.id ? { ...x, active: true } : x)), c.id); if (Object.keys(e).length) { toast(Object.values(e)[0]); return; } }
                    setActive([c.id], v);
                  }} /></td>
                  <td className="r"><button type="button" className="btn ghost sm" onClick={() => { onSelect(c.id); onGo('global'); }}>Edit rules</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Scope changes are made on the Review &amp; publish page. Two active configurations may not cover the same product, applicant type and customer type.</p>
    </>
  );
}

