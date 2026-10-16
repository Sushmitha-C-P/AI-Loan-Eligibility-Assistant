// RM home: the application pipeline.
import { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { useApps, STATUSES, STATUS_TONE, deleteApp } from '../engine/appsStore.js';
import { inr, fmtDate } from '../engine/format.js';

export default function Home({ onOpen, onNew }) {
  const { user } = useApp();
  const apps = useApps();
  const [q, setQ] = useState('');
  const [f, setF] = useState('All');
  const mine = apps;
  const list = useMemo(() => mine.filter((a) => (f === 'All' || a.status === f) && (!q || `${a.id} ${a.name} ${a.productId}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [mine, q, f]);
  const count = (st) => mine.filter((a) => a.status === st).length;
  const pipeline = mine.filter((a) => a.status !== 'Declined' && a.status !== 'Not eligible').reduce((x, a) => x + a.amount, 0);

  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Good day, {user.name.split(' ')[0]}</h1><p>Your loan applications. Open one to continue, or start a new eligibility check.</p></div>
        <button className="btn primary" type="button" onClick={onNew}>+ New application</button>
      </div>
      <div className="tiles">
        <div className="tile"><span>Applications</span><strong>{mine.length}</strong><em>{count('Draft')} in draft</em></div>
        <div className="tile"><span>Eligible</span><strong className="ok-t">{count('Eligible')}</strong><em>ready to send to sanction</em></div>
        <div className="tile"><span>Needs review</span><strong style={{ color: 'var(--warn)' }}>{count('Review')}</strong><em>deviation or missing data</em></div>
        <div className="tile"><span>Active pipeline</span><strong>₹{(pipeline / 100000).toFixed(1)} L</strong><em>{count('Sent to sanction')} sent to sanction</em></div>
      </div>
      <div className="toolbar">
        <div className="search"><span aria-hidden="true">⌕</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ID or product" aria-label="Search applications" /></div>
        <div className="fchips" role="group" aria-label="Filter by status">
          {['All', ...STATUSES].map((st) => <button key={st} type="button" className="fchip" aria-pressed={f === st} onClick={() => setF(st)}>{st}{st !== 'All' ? ` · ${count(st)}` : ''}</button>)}
        </div>
      </div>
      <div className="apps tscroll">
        <table>
          <thead><tr><th>Application</th><th>Applicant</th><th className="hide-sm">Product</th><th className="r">Amount</th><th>Status</th><th className="hide-sm">Updated</th><th /></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} onClick={() => onOpen(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(a.id)}>
                <td className="mono">{a.id}</td>
                <td className="who"><b>{a.name}</b><small>{a.applicantType}</small></td>
                <td className="hide-sm">{a.productId}</td>
                <td className="r num">{a.amount ? inr(a.amount) : '—'}</td>
                <td><span className={`pill ${STATUS_TONE[a.status]}`}>{a.status}</span></td>
                <td className="hide-sm hint">{fmtDate(new Date(a.updatedAt))}</td>
                <td className="r">{a.status === 'Draft' && <button type="button" className="xsm" title="Delete draft" aria-label={`Delete ${a.id}`} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete draft ${a.id}?`)) deleteApp(a.id); }}>×</button>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7}><div className="emptybox" style={{ margin: 8 }}>{mine.length ? 'No applications match this filter.' : 'No applications yet. Start a new one.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
