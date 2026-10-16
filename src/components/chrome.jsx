// Shared chrome: logo, AI status pill, AI activity button, user menu.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { PROVIDERS, isAiReady } from '../ai/settings.js';
import { useAiLog } from '../ai/log.js';
import { signOut } from '../engine/session.js';

export function Logo({ size = 34 }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l4-5 3 3 5-6" stroke="#E0B25E" /></svg>
    </span>
  );
}
export const Wordmark = () => <span className="wordmark">Loan<span>Sense</span></span>;
export const initials = (name) => name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

export function AiStatus({ onClick }) {
  const { settings, aiHealth } = useApp();
  const ready = isAiReady(settings);
  const tone = !ready ? '' : aiHealth ? (aiHealth.ok ? 'ok' : 'err') : 'warn';
  const name = PROVIDERS[settings.provider].label.split(' (')[0];
  return (
    <button type="button" className={`aistatus ${tone}`} onClick={onClick} title={aiHealth?.msg || (ready ? 'Configured, not tested yet' : 'No API key: offline templates')}>
      <span className="led" aria-hidden="true" />
      {ready ? <>AI: {name} <small>{settings.model}</small></> : <>AI offline · add key</>}
    </button>
  );
}

export function AiLogButton({ onClick }) {
  const log = useAiLog();
  return <button type="button" className="iconbtn" onClick={onClick}>AI activity {log.length > 0 && <span className="count">{log.length}</span>}</button>;
}

export function UserMenu({ extra = [] }) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!user) return null;
  return (
    <div className="usermenu" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className={`avatar${user.role === 'admin' ? ' gold' : ''}`}>{initials(user.name)}</span><span className="uname">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who"><b>{user.name}</b><small>{user.title}</small><small className="mono">{user.email}</small></div>
          {extra.map(([label, fn]) => <button key={label} type="button" role="menuitem" onClick={() => { setOpen(false); fn(); }}>{label}</button>)}
          <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
