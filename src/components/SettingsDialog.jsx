import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { PROVIDERS } from '../ai/settings.js';
import { chatJSON, listModels } from '../ai/providers.js';
import { parseJSON } from '../ai/guardrails.js';
import { logStart, logUpdate } from '../ai/log.js';
import { Spinner } from './ui.jsx';

export default function SettingsDialog({ onClose }) {
  const { settings, setSettings, setAiHealth } = useApp();
  const [f, setF] = useState(settings);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const first = useRef(null);
  const p = PROVIDERS[f.provider];

  useEffect(() => { first.current?.focus(); const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const pick = (provider) => { const pp = PROVIDERS[provider]; setF({ ...f, provider, model: pp.defaultModel, baseUrl: pp.baseUrl }); setModels([]); setMsg(null); };

  async function load() {
    if (!f.apiKey) { setMsg({ ok: false, text: 'Paste the API key first.' }); return; }
    setBusy('models'); setMsg(null);
    try { const m = await listModels(f); setModels(m); setMsg({ ok: true, text: `${m.length} models available for this key. Pick one below.` }); if (m.length && !m.includes(f.model)) setF((x) => ({ ...x, model: m.find((n) => /flash/.test(n) && !/lite|image|tts|live|thinking|exp/.test(n)) || m[0] })); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(''); }
  }

  async function test() {
    if (!f.apiKey) { setMsg({ ok: false, text: 'Paste the API key first.' }); return; }
    setBusy('test'); setMsg(null);
    const id = logStart({ task: 'Connection test', provider: f.provider, model: f.model, request: { system: 'Reply with JSON {"ok":true,"model":"<your model name>"}', messages: [{ role: 'user', content: 'Connection test. Return the JSON.' }] } });
    const t0 = performance.now();
    try {
      const r = await chatJSON(f, 'Reply with JSON {"ok":true,"model":"<your model name>"}', [{ role: 'user', content: 'Connection test. Return the JSON.' }]);
      const ms = Math.round(performance.now() - t0); const o = parseJSON(r.text);
      logUpdate(id, { status: o?.ok ? 'ok' : 'rejected', ms, response: r.text, usage: r.usage, model: r.model });
      setMsg({ ok: !!o?.ok, text: o?.ok ? `Connected to ${r.model} in ${ms} ms. JSON mode works.` : `The model answered but not with valid JSON: ${r.text.slice(0, 120)}` });
      if (o?.ok) setAiHealth({ ok: true, msg: `Test ${ms} ms`, at: new Date() });
    } catch (e) {
      logUpdate(id, { status: 'error', ms: Math.round(performance.now() - t0), error: e.message });
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(''); }
  }

  const save = () => { setSettings({ ...f, enabled: true }); onClose(); };
  const offline = () => { setSettings({ ...f, enabled: false }); onClose(); };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="set-h">
        <div className="dialog-h">
          <div><h2 id="set-h">AI settings</h2><p className="hint">Connect a real model. The rules engine works the same with or without it.</p></div>
          <button className="xbtn" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dialog-b">
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <div className="ctl"><select id="provider" ref={first} value={f.provider} onChange={(e) => pick(e.target.value)}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            {p.keyUrl && <p className="hint">Get a key: <a href={p.keyUrl} target="_blank" rel="noreferrer">{p.keyUrl.replace('https://', '')}</a></p>}
          </div>
          <div className="field">
            <label htmlFor="apiKey">API key</label>
            <div className="inline">
              <div className="ctl"><input id="apiKey" type={show ? 'text' : 'password'} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value.trim() })} placeholder={p.keyHint || 'API key'} autoComplete="off" spellCheck={false} /></div>
              <button type="button" className="btn verify" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {p.kind === 'openai' && (
            <div className="field">
              <label htmlFor="baseUrl">Base URL <span className="opt">OpenAI-compatible</span></label>
              <div className="ctl"><input id="baseUrl" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value.trim() })} placeholder="https://…/v1" /></div>
            </div>
          )}
          <div className="field">
            <label htmlFor="model">Model</label>
            <div className="inline">
              {models.length ? (
                <div className="ctl"><select id="model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>{models.map((m) => <option key={m}>{m}</option>)}</select></div>
              ) : (
                <div className="ctl"><input id="model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value.trim() })} placeholder={p.defaultModel} /></div>
              )}
              <button type="button" className="btn verify" onClick={load} disabled={busy === 'models'}>{busy === 'models' ? <><Spinner />Loading</> : 'Load models'}</button>
            </div>
            <p className="hint">Model names change often. Use Load models to see exactly what your key can call.</p>
          </div>
          {msg && <p className={msg.ok ? 'test-ok' : 'test-bad'} role="status">{msg.ok ? '✓ ' : '✕ '}{msg.text}</p>}
          <p className="note">The key is saved only in this browser (localStorage) and sent only to the provider. This is fine for a demo. In production, calls go through your backend so the key never reaches the browser.</p>
        </div>
        <div className="dialog-f">
          <button type="button" className="btn ghost" onClick={offline}>Use offline mode</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" onClick={test} disabled={busy === 'test'}>{busy === 'test' ? <><Spinner />Testing</> : 'Test connection'}</button>
            <button type="button" className="btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
