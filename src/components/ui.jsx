import { useApp } from '../store.jsx';
import { LABELS } from '../engine/validation.js';
import { formatMoney } from '../engine/format.js';

export function Spinner() { return <span className="spin" aria-hidden="true" />; }

export function Pill({ tone = 'na', children }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Field({ id, label, optional, src, hint, children, span, extra }) {
  const { s } = useApp();
  const err = s.errors[id];
  return (
    <div className={`field${span ? ' span2' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="opt">{typeof optional === 'string' ? optional : 'optional'}</span>}
        {src === 'auto' && <span className="src auto">Auto-fetched</span>}
        {src === 'manual' && <span className="src manual">Manual</span>}
        {s.ai[id] && <span className="src ai">AI-filled</span>}
        {extra}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {err ? <p className="err" role="alert">{err}</p> : null}
    </div>
  );
}

const MASKS = {
  pan: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
  mobile: (v) => { v = v.replace(/\D/g, ''); if (v.length > 10 && v.startsWith('91')) v = v.slice(2); return v.slice(0, 10); },
  pincode: (v) => v.replace(/\D/g, '').slice(0, 6),
  gstin: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15),
  udyam: (v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 19),
  startYear: (v) => v.replace(/\D/g, '').slice(0, 4),
  tenure: (v) => v.replace(/\D/g, '').slice(0, 3),
};

/** Text input bound to s.d[id] with masking, blur validation and error/AI styling. */
export function Input({ id, prefix, suffix, money, mask, className = '', readOnly, ctlClass = '', ...rest }) {
  const { s, setField, validateField } = useApp();
  const raw = s.d[id] ?? '';
  const value = money ? formatMoney(raw) : raw;
  const onChange = (e) => {
    let v = e.target.value;
    if (money) v = v.replace(/[^\d]/g, '').slice(0, 9);
    else if (mask) v = mask(v);
    else if (MASKS[id]) v = MASKS[id](v);
    setField(id, v);
  };
  const cls = ['ctl', s.errors[id] ? 'bad' : '', s.ai[id] ? 'aifill' : '', readOnly ? 'ro' : '', ctlClass].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {prefix && <span className="pre">{prefix}</span>}
      <input id={id} value={value} onChange={onChange} onBlur={() => !readOnly && (raw !== '' || s.errors[id]) && validateField(id)}
        aria-invalid={!!s.errors[id]} readOnly={readOnly} className={className} inputMode={money ? 'numeric' : rest.inputMode} {...rest} />
      {suffix && <span className="suf">{suffix}</span>}
    </div>
  );
}

export function Select({ id, options, placeholder, ...rest }) {
  const { s, setField, validateField } = useApp();
  const cls = ['ctl', s.errors[id] ? 'bad' : '', s.ai[id] ? 'aifill' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      <select id={id} value={s.d[id] ?? ''} onChange={(e) => { setField(id, e.target.value); }} onBlur={() => s.errors[id] && validateField(id)} aria-invalid={!!s.errors[id]}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}

export function Radios({ id, options, label }) {
  const { s, setField } = useApp();
  return (
    <>
      <div className="radios" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.value} className="radio">
            <input type="radio" name={id} value={o.value} checked={s.d[id] === o.value} onChange={() => setField(id, o.value)} />
            <b>{o.label}{s.ai[id] && s.d[id] === o.value ? <span className="src ai" style={{ marginLeft: 8 }}>AI-filled</span> : null}</b>
            <small>{o.sub}</small>
          </label>
        ))}
      </div>
      {s.errors[id] ? <p className="err" style={{ marginTop: 6 }}>{s.errors[id]}</p> : null}
    </>
  );
}

export function Check({ id, children }) {
  const { s, setField } = useApp();
  return (
    <>
      <label className="check"><input type="checkbox" id={id} checked={!!s.d[id]} onChange={(e) => setField(id, e.target.checked)} /> <span>{children}</span></label>
      {s.errors[id] ? <p className="err" style={{ marginTop: 6 }}>{s.errors[id]}</p> : null}
    </>
  );
}

export function ErrorSummary({ ids }) {
  const { s } = useApp();
  const errs = ids.filter((k) => s.errors[k]);
  if (!errs.length) return null;
  const focus = (k) => { const el = document.getElementById(k) || document.querySelector(`input[name="${k}"]`); el?.focus(); };
  return (
    <div className="errsum" role="alert">
      <b>{errs.length === 1 ? 'Fix 1 item' : `Fix ${errs.length} items`} to continue</b>
      <ul>{errs.map((k) => <li key={k}><button type="button" onClick={() => focus(k)}>{LABELS[k] || k}</button>: {s.errors[k]}</li>)}</ul>
    </div>
  );
}

export function StepHeader({ n, title, lede, eyebrow }) {
  return (
    <header className="ph">
      <p className="eyebrow">{eyebrow || `Step ${n} of 4`}</p>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

export function Actions({ back, next, nextLabel, busy, hint }) {
  const { goStep } = useApp();
  return (
    <div className="actions">
      {back != null ? <button className="btn ghost" type="button" onClick={() => goStep(back)}>← Back</button> : hint ? <span className="hint" style={{ alignSelf: 'center' }}>{hint}</span> : <span />}
      <div className="right"><button className="btn primary" type="button" onClick={next} disabled={busy}>{busy ? <><Spinner />{busy}</> : nextLabel}</button></div>
    </div>
  );
}
