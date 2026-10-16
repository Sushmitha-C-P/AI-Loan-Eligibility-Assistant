// Admin console: maintain the eligibility configurations the RM app runs.
import { useEffect, useState } from 'react';
import { useConfigs } from '../engine/configStore.js';
import { validateModules, MODULE_OF } from '../engine/configValidation.js';
import { Logo, Wordmark, AiStatus, AiLogButton, UserMenu, initials } from '../components/chrome.jsx';
import { useApp } from '../store.jsx';
import Dashboard from './Dashboard.jsx';
import Configurations, { statusOf } from './Configurations.jsx';
import ReviewPublish from './ReviewPublish.jsx';
import { MODULES, GlobalRules, CreditBureau, BankAnalyzer, TaxItr, BalanceSheet } from './modules.jsx';

const PAGES = { global: GlobalRules, bureau: CreditBureau, bank: BankAnalyzer, tax: TaxItr, balance: BalanceSheet };
const KEY = 'loaneligibilitycheck.admin.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };

export default function AdminConsole({ onSettings, onLog }) {
  const { user } = useApp();
  const configs = useConfigs();
  const saved = load();
  const [page, setPage] = useState(saved.page || 'dashboard');
  const [sel, setSel] = useState(saved.sel || 'CFG-001');
  const [open, setOpen] = useState(false);
  const c = configs.find((x) => x.id === sel) || configs[0];
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ page, sel: c?.id })); } catch (_) { /* ignore */ } }, [page, c?.id]);
  const go = (p) => { setPage(p); setOpen(false); window.scrollTo({ top: 0 }); };
  const { errors, warnings } = c ? validateModules(c.draft, c.scope) : { errors: {}, warnings: [] };
  const badge = (k) => { const e = Object.keys(errors).filter((x) => MODULE_OF(x) === k).length; const w = warnings.filter((x) => x.module === k).length; return e ? <span className="badge red">{e}</span> : w ? <span className="badge">{w}</span> : null; };
  const [tone, label] = c ? statusOf(c) : ['off', ''];
  const title = page === 'dashboard' ? 'Dashboard' : page === 'configs' ? 'Configurations' : page === 'publish' ? 'Review & publish' : MODULES.find((x) => x.key === page)?.label;
  const Page = PAGES[page];

  const Item = ({ k, icon, children }) => <button type="button" className={`sb-item${page === k ? ' active' : ''}`} onClick={() => go(k)} aria-current={page === k ? 'page' : undefined}><span className="ic2">{icon}</span>{children}{PAGES[k] && badge(k)}</button>;

  return (
    <div className="adm">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sb${open ? ' open' : ''}`} aria-label="Admin navigation">
        <div className="brandrow"><Logo /><Wordmark /></div>
        <Item k="dashboard" icon="⌂">Dashboard</Item>
        <Item k="configs" icon="☰">Configurations</Item>
        <div className="sb-label">Rules · {c?.id}</div>
        {MODULES.map((x) => <Item key={x.key} k={x.key} icon={x.icon}>{x.label}</Item>)}
        <div className="sb-label">Go live</div>
        <Item k="publish" icon="✓">Review &amp; publish</Item>
        <div className="sb-foot"><span className="avatar gold">{initials(user.name)}</span><div><b>{user.name}</b><small>{user.title}</small></div></div>
      </aside>
      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="iconbtn adm-hamb" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <div className="crumb">Admin console › <b>{title}</b></div>
          <div className="right">
            <div className="cfgpick">
              <label htmlFor="cfgSel">Editing</label>
              <select id="cfgSel" value={c?.id} onChange={(e) => setSel(e.target.value)}>
                {configs.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.scope.productId}{x.active ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
            <span className={`status-chip ${tone}`}>{label}</span>
            <AiStatus onClick={onSettings} />
            <AiLogButton onClick={() => onLog(null)} />
            <UserMenu extra={[['AI settings', onSettings]]} />
          </div>
        </header>
        <main className="adm-content">
          {!c ? <div className="emptybox">No configurations.</div>
            : page === 'dashboard' ? <Dashboard c={c} onGo={go} onSelect={setSel} onOpenLog={onLog} />
              : page === 'configs' ? <Configurations selected={c.id} onSelect={setSel} onGo={go} />
                : page === 'publish' ? <ReviewPublish c={c} onGo={go} onOpenLog={onLog} />
                  : <Page id={c.id} />}
        </main>
      </div>
    </div>
  );
}
