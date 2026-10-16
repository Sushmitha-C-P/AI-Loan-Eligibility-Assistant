import { useState } from 'react';
import { USERS, DEMO_PASSWORD, validateLogin, signIn } from './engine/session.js';
import { Logo, Wordmark, initials } from './components/chrome.jsx';
import { Spinner } from './components/ui.jsx';

const FEATS = [
  ['1', 'One rulebook', 'Admins publish product rules once. Every RM application is checked against the published version.'],
  ['2', 'Rules decide, AI explains', 'The rules engine gives the decision. The AI fills forms from notes, reviews data and writes the remarks.'],
  ['3', 'Account Aggregator ready', 'Bank statements come in by AA consent or PDF upload and are analysed automatically.'],
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e?.preventDefault();
    const x = validateLogin(email, password);
    setErrs(x);
    if (Object.keys(x).length) { document.getElementById(x.email ? 'email' : 'password')?.focus(); return; }
    setBusy(true);
    setTimeout(() => signIn(email), 500);
  };
  const use = (u) => { setEmail(u.email); setPassword(DEMO_PASSWORD); setErrs({}); };

  return (
    <div className="login">
      <aside className="login-art">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Logo /><Wordmark /></div>
        <div>
          <h1>Loan eligibility in minutes, with rules you can audit.</h1>
          <p style={{ marginTop: 12 }}>Relationship managers capture the application. Product managers own the rules. The AI helps both, and never decides.</p>
        </div>
        <div className="login-feats">
          {FEATS.map(([n, t, d]) => <div key={n} className="login-feat"><i>{n}</i><div><b>{t}</b><span>{d}</span></div></div>)}
        </div>
      </aside>
      <main className="login-form">
        <form className="login-card" onSubmit={submit} noValidate>
          <div><h2>Sign in</h2><p className="hint" style={{ fontSize: 13, marginTop: 4 }}>Use your LoanEligibilityCheck work account.</p></div>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <div className={`ctl${errs.email ? ' bad' : ''}`}><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); if (errs.email) setErrs({ ...errs, email: '' }); }} placeholder="name@loaneligibilitycheck.in" aria-invalid={!!errs.email} /></div>
            {errs.email && <p className="err" role="alert">{errs.email}</p>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="inline">
              <div className={`ctl${errs.password ? ' bad' : ''}`}><input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); if (errs.password) setErrs({ ...errs, password: '' }); }} aria-invalid={!!errs.password} /></div>
              <button type="button" className="btn verify" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
            {errs.password && <p className="err" role="alert">{errs.password}</p>}
          </div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? <><Spinner />Signing in…</> : 'Sign in'}</button>
          <div>
            <p className="hint" style={{ marginBottom: 6 }}>Demo accounts · password <span className="mono">{DEMO_PASSWORD}</span></p>
            <div className="demo-acc">
              {USERS.map((u) => (
                <button key={u.email} type="button" onClick={() => use(u)}>
                  <span className={`avatar${u.role === 'admin' ? ' gold' : ''}`}>{initials(u.name)}</span>
                  <span><b>{u.name}</b><small>{u.title}</small></span>
                  <span className={`pill ${u.role === 'admin' ? 'gold' : 'brand'}`}>{u.role === 'admin' ? 'Admin console' : 'RM app'}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
