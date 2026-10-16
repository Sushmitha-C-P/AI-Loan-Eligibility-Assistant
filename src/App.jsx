// LoanEligibilityCheck: one app, two roles. Sign-in routes the RM to the application flow and the Admin to the rules console.
import { useCallback, useState } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { useSession, currentUser } from './engine/session.js';
import Login from './Login.jsx';
import RmApp from './rm/RmApp.jsx';
import AdminConsole from './admin/AdminConsole.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import ActivityDrawer from './components/ActivityDrawer.jsx';

function Shell() {
  const { user, toastMsg } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logFocus, setLogFocus] = useState(undefined); // undefined = closed
  const openLog = useCallback((id) => setLogFocus(id || null), []);
  const closeLog = useCallback(() => setLogFocus(undefined), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  return (
    <>
      {user.role === 'admin' ? <AdminConsole onSettings={openSettings} onLog={openLog} /> : <RmApp onSettings={openSettings} onLog={openLog} />}
      {toastMsg && <div className="toast" role="status" aria-live="polite">{toastMsg}</div>}
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
      {logFocus !== undefined && <ActivityDrawer focusId={logFocus} onClose={closeLog} />}
    </>
  );
}

export default function App() {
  const session = useSession();
  const user = currentUser(session);
  if (!user) return <Login />;
  // key: a fresh provider per user, so the RM's in-progress application never leaks into another session
  return <AppProvider key={user.email} user={user}><Shell /></AppProvider>;
}
