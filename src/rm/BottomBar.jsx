import { Spinner } from '../components/ui.jsx';

export default function BottomBar({ onBack, backLabel = '← Back', next, nextLabel, busy, left, children }) {
  return (
    <div className="bottombar">
      <div className="in">
        {onBack ? <button className="btn ghost" type="button" onClick={onBack}>{backLabel}</button> : left || <span />}
        <div className="right">
          {children}
          {next && <button className="btn primary" type="button" onClick={next} disabled={!!busy}>{busy ? <><Spinner />{busy}</> : nextLabel}</button>}
        </div>
      </div>
    </div>
  );
}
