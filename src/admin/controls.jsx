// Small controlled inputs for the admin console (defined at module level so inputs keep focus while typing).
import { useMemo } from 'react';
import { useConfigs, saveDraft, getConfig } from '../engine/configStore.js';
import { validateModules } from '../engine/configValidation.js';

/** Current config + a path setter that writes straight into its draft. */
export function useDraft(id) {
  const configs = useConfigs();
  const c = configs.find((x) => x.id === id) || configs[0];
  const val = useMemo(() => (c ? validateModules(c.draft, c.scope) : { errors: {}, warnings: [] }), [c]);
  const set = (path, value) => {
    const keys = path.split('.');
    const next = structuredClone(getConfig(c.id).draft); // read the latest, so several set() calls in a row all stick
    let o = next; for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = typeof value === 'function' ? value(o[keys[keys.length - 1]]) : value;
    saveDraft(c.id, next);
  };
  return { c, m: c?.draft, set, errors: val.errors, warnings: val.warnings };
}

export const Err = ({ e }) => (e ? <p className="err" role="alert">{e}</p> : null);

export function NumIn({ id, value, onChange, err, prefix, suffix, disabled, placeholder, decimal, width }) {
  const clean = (v) => (decimal ? v.replace(/[^\d.-]/g, '').replace(/(\..*)\./g, '$1') : v.replace(/[^\d]/g, ''));
  return (
    <div className={`ctl${err ? ' bad' : ''}${disabled ? ' dis' : ''}`} style={width ? { width } : undefined}>
      {prefix && <span className="pre">{prefix}</span>}
      <input id={id} value={value ?? ''} inputMode={decimal ? 'decimal' : 'numeric'} disabled={disabled} placeholder={placeholder} aria-invalid={!!err}
        onChange={(e) => onChange(clean(e.target.value))} />
      {suffix && <span className="suf">{suffix}</span>}
    </div>
  );
}
export function MoneyIn({ id, value, onChange, err, disabled, placeholder }) {
  const shown = value === '' || value == null ? '' : Number(value).toLocaleString('en-IN');
  return (
    <div className={`ctl${err ? ' bad' : ''}${disabled ? ' dis' : ''}`}>
      <span className="pre">₹</span>
      <input id={id} value={shown} inputMode="numeric" disabled={disabled} placeholder={placeholder} aria-invalid={!!err} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 11))} />
    </div>
  );
}
export function Switch({ checked, onChange, label, disabled, id }) {
  return <label className="switch" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}><input id={id} type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label && <span>{label}</span>}</label>;
}
export function Chips({ options, value, onChange, disabled }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return <div className={`chipset${disabled ? ' dim' : ''}`}>{options.map((o) => <button key={o} type="button" className={`tog${value.includes(o) ? ' on' : ''}`} aria-pressed={value.includes(o)} disabled={disabled} onClick={() => toggle(o)}>{value.includes(o) ? '✓ ' : ''}{o}</button>)}</div>;
}
export function Sel({ id, value, onChange, options, disabled, err }) {
  return <div className={`ctl${err ? ' bad' : ''}${disabled ? ' dis' : ''}`}><select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}</select></div>;
}
export function MField({ label, htmlFor, children, err, hint, extra }) {
  return <div className="mf"><label htmlFor={htmlFor}>{label}{extra}</label>{children}{hint && <p className="hint">{hint}</p>}<Err e={err} /></div>;
}
