// Relationship Manager app: applications list + the 4-step eligibility flow.
import { useState } from 'react';
import { useApp } from '../store.jsx';
import { STEPS } from '../engine/policy.js';
import { SAMPLES } from '../engine/mocks.js';
import { Logo, Wordmark, AiStatus, AiLogButton, UserMenu } from '../components/chrome.jsx';
import Home from './Home.jsx';
import ApplicantStep from './ApplicantStep.jsx';
import BankStep from './BankStep.jsx';
import FinancialStep from './FinancialStep.jsx';
import DecisionStep from './DecisionStep.jsx';
import CaseFile from './CaseFile.jsx';

function Progress() {
  const { s, goStep } = useApp();
  return (
    <nav className="progress" aria-label="Application steps">
      {STEPS.map(([t, sub], i) => {
        const cls = i === s.step ? 'active' : i < s.maxStep || (s.result && i < 3) ? 'done' : '';
        const disabled = i > s.maxStep || (i === 3 && !s.result);
        return <button key={t} type="button" className={`pstep ${cls}`} disabled={disabled} onClick={() => goStep(i)} aria-current={i === s.step ? 'step' : undefined}><i /><span><b>{i + 1}. {t}</b><small>{sub}</small></span></button>;
      })}
    </nav>
  );
}

export default function RmApp({ onSettings, onLog }) {
  const { s, newApplication, openApplication, loadSample, runToResult } = useApp();
  const [view, setView] = useState('home');
  const Step = [ApplicantStep, BankStep, FinancialStep, DecisionStep][s.step];
  const home = () => { setView('home'); window.scrollTo({ top: 0 }); };

  return (
    <>
      <header className="appbar">
        <div className="brandrow"><Logo /><Wordmark /></div>
        <nav aria-label="Main">
          <button type="button" aria-current={view === 'home' ? 'page' : undefined} onClick={home}>Applications</button>
          <button type="button" aria-current={view === 'flow' ? 'page' : undefined} onClick={() => { if (!s.appId) newApplication(); setView('flow'); }}>{s.appId && view === 'flow' ? s.appId : 'New application'}</button>
        </nav>
        <div className="right">
          <AiStatus onClick={onSettings} />
          <AiLogButton onClick={() => onLog(null)} />
          <UserMenu extra={[['AI settings', onSettings]]} />
        </div>
      </header>
      {view === 'home' ? (
        <Home onOpen={(id) => { openApplication(id); setView('flow'); window.scrollTo({ top: 0 }); }} onNew={() => { newApplication(); setView('flow'); window.scrollTo({ top: 0 }); }} />
      ) : (
        <div className="flow">
          <div className="flowhead">
            <h1>{s.appId} <span className="hint" style={{ fontWeight: 400, fontSize: 13 }}>· {s.d.applicantType} application</span></h1>
            <div className="demo">
              <label htmlFor="sampleSel">Demo applicant</label>
              <select id="sampleSel" value={s.sample} onChange={(e) => loadSample(e.target.value)}>
                <option value="">Blank form</option>
                {Object.entries(SAMPLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn primary sm" type="button" onClick={runToResult}>Run to decision</button>
            </div>
          </div>
          <Progress />
          <main className="main"><Step key={s.step} onOpenLog={onLog} onHome={home} /></main>
          <CaseFile />
        </div>
      )}
    </>
  );
}
