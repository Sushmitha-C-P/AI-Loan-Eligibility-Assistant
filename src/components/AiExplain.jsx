import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { explainResult } from '../ai/tasks.js';
import { isAiReady } from '../ai/settings.js';
import { Spinner } from './ui.jsx';

const LANGS = [['en', 'English'], ['ta', 'தமிழ் Tamil'], ['hi', 'हिन्दी Hindi']];

export function Checks({ checks }) {
  if (!checks?.length) return null;
  return <div className="checks">{checks.map((c, i) => <span key={i} className={`chk ${c.ok ? 'ok' : 'bad'}`} title={c.detail || ''}>{c.ok ? '✓' : '✕'} {c.name}{!c.ok && c.detail ? `: ${c.detail}` : ''}</span>)}</div>;
}

export default function AiExplain({ result, onOpenLog, title = 'AI explanation' }) {
  const { s, settings, setAiHealth, toast } = useApp();
  const [cache, setCache] = useState({});
  const [tab, setTab] = useState('rm');
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(0);
  const ready = isAiReady(settings);

  async function generate(l) {
    setLoading(l); t0.current = performance.now(); setElapsed(0);
    const r = await explainResult(settings, result, s.d, l);
    setCache((c) => ({ ...(Object.values(c)[0]?.forId === result.id ? c : {}), [l]: { ...r, forId: result.id } }));
    if (r.mode === 'ai') setAiHealth({ ok: true, msg: `Last call ${r.ms} ms`, at: new Date() });
    else if (r.mode === 'fallback') setAiHealth({ ok: !!r.checks?.length, msg: r.checks?.length ? 'Connected · last answer rejected by guardrail' : r.reason, at: new Date() });
    setLoading('');
  }

  useEffect(() => { if (!Object.keys(cache).length) generate('en'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) return; const t = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 100); return () => clearInterval(t); }, [loading]);

  const current = cache.en || cache[lang] || Object.values(cache)[0];
  const cust = cache[lang];
  const stale = current && current.forId !== result.id;

  const changeLang = (l) => { setLang(l); setTab('cust'); if (!cache[l] || cache[l].forId !== result.id) generate(l); };
  const regenerate = () => { setCache({}); generate(tab === 'cust' ? lang : 'en').then(() => { if (tab === 'cust' && lang !== 'en') generate('en'); }); };

  const shown = tab === 'rm' ? current : cust;
  const copy = () => {
    if (!shown) return;
    const v = shown.value;
    const txt = tab === 'rm' ? [v.headline, v.summary, 'Positives: ' + v.positives.join('; '), 'Concerns: ' + v.concerns.join('; '), 'Next steps: ' + v.next_steps.join('; ')].join('\n') : v.customer_message;
    navigator.clipboard?.writeText(txt).then(() => toast('Copied.'), () => toast('Copy was blocked by the browser.'));
  };

  return (
    <div className="explain">
      <div className="explain-h">
        <div className="sech">{title} <span className="pill ai">Non-decisional</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tabs" role="group" aria-label="Audience">
            <button type="button" aria-pressed={tab === 'rm'} onClick={() => setTab('rm')}>For RM</button>
            <button type="button" aria-pressed={tab === 'cust'} onClick={() => { setTab('cust'); if (!cust) generate(lang); }}>For customer</button>
          </div>
          <select className="langsel" value={lang} onChange={(e) => changeLang(e.target.value)} aria-label="Customer message language">
            {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" className="btn ghost sm" onClick={regenerate} disabled={!!loading}>{loading ? <><Spinner />{elapsed.toFixed(1)}s</> : 'Regenerate'}</button>
        </div>
      </div>

      <div className="explain-b" aria-live="polite">
        {stale && <p className="stale">The inputs changed in the what-if simulator. Regenerate to explain the new result.</p>}
        {(loading && !shown) ? (
          <div className="skeleton" aria-label="Generating"><span className="timer">{ready ? `Calling ${settings.model}…` : 'Building template…'} {elapsed.toFixed(1)}s</span><i style={{ width: '60%' }} /><i /><i style={{ width: '85%' }} /><i style={{ width: '40%' }} /></div>
        ) : shown ? (
          <>
            {shown.mode === 'fallback' && <p className="fallback-note"><b>Template fallback used.</b> {shown.reason}. The explanation below is built from the rules engine output without AI.</p>}
            {tab === 'rm' ? (
              <>
                <h4>{shown.value.headline}</h4>
                <p>{shown.value.summary}</p>
                <div className="lists">
                  <div><h5>Positives</h5><ul>{shown.value.positives.length ? shown.value.positives.map((x, i) => <li key={i}>{x}</li>) : <li>None</li>}</ul></div>
                  <div><h5>Concerns</h5><ul>{shown.value.concerns.length ? shown.value.concerns.map((x, i) => <li key={i}>{x}</li>) : <li>None</li>}</ul></div>
                  <div><h5>Next steps</h5><ul>{shown.value.next_steps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
              </>
            ) : (
              <p className="custmsg" lang={shown.mode === 'ai' ? lang : 'en'}>{shown.value.customer_message}</p>
            )}
            {tab === 'cust' && lang !== 'en' && shown.mode !== 'ai' && <p className="hint">Tamil and Hindi need an AI key. Showing the English template.</p>}
          </>
        ) : null}
      </div>

      <div className="explain-f">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="ai-meta">
            {shown?.mode === 'ai' && <><span className="pill pass">Live AI</span><span className="mono">{shown.model} · {shown.ms} ms</span></>}
            {shown?.mode === 'offline' && <span className="pill na">Offline template · add a key in AI settings for live AI</span>}
            {shown?.mode === 'fallback' && <span className="pill review">Fallback</span>}
            <span>Generated only from the rules engine output. It cannot change the decision.</span>
          </div>
          <Checks checks={shown?.checks} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {shown?.logId && <button type="button" className="btn ghost sm" onClick={() => onOpenLog(shown.logId)}>View prompt &amp; response</button>}
          <button type="button" className="btn ghost sm" onClick={copy}>Copy</button>
        </div>
      </div>
    </div>
  );
}
