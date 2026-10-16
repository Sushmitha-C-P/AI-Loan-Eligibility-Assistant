import { useEffect } from 'react';
import { useAiLog } from '../ai/log.js';
import { PROVIDERS } from '../ai/settings.js';
import { Checks } from './AiExplain.jsx';

const TONE = { ok: 'pass', running: 'brand', error: 'fail', rejected: 'review', blocked: 'fail' };
const LABEL = { ok: 'OK', running: 'Running', error: 'Error', rejected: 'Rejected by guardrail', blocked: 'Blocked' };

export default function ActivityDrawer({ focusId, onClose }) {
  const log = useAiLog();
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k);
    if (focusId) setTimeout(() => document.getElementById('log-' + focusId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    return () => window.removeEventListener('keydown', k);
  }, [focusId, onClose]);

  return (
    <aside className="drawer" role="dialog" aria-label="AI activity log">
      <div className="drawer-h">
        <div><h3 style={{ fontSize: 16 }}>AI activity</h3><p className="hint">Every live model call: masked prompt, raw response, latency and guardrail checks.</p></div>
        <button className="xbtn" type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="drawer-b">
        {!log.length && <div className="emptybox">No AI calls yet. Try "Extract with AI" on step 1, or run a check to see the explanation call.</div>}
        {log.map((e) => (
          <div key={e.id} id={'log-' + e.id} className={`logitem${e.id === focusId ? ' focus' : ''}`}>
            <div className="logitem-h">
              <b>{e.task}</b>
              <span className={`pill ${TONE[e.status]}`}>{LABEL[e.status]}</span>
            </div>
            <div className="ai-meta" style={{ marginTop: 4 }}>
              <span>{e.at.toLocaleTimeString('en-IN')}</span>
              <span className="mono">{PROVIDERS[e.provider]?.label.split(' (')[0]} · {e.model}</span>
              {e.ms != null && <span className="mono">{e.ms} ms</span>}
              {e.usage?.input != null && <span className="mono">{e.usage.input} in / {e.usage.output ?? '?'} out tokens</span>}
            </div>
            {e.error && <p className="err" style={{ marginTop: 6 }}>{e.error}</p>}
            <div style={{ marginTop: 6 }}><Checks checks={e.checks} /></div>
            <details><summary>Prompt sent (PII masked)</summary><pre>{`SYSTEM:\n${e.request?.system}\n\n${(e.request?.messages || []).map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')}`}</pre></details>
            {e.response && <details><summary>Raw model response</summary><pre>{e.response}</pre></details>}
          </div>
        ))}
      </div>
    </aside>
  );
}
