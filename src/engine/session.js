// Demo sign-in. Two roles share one app: the RM captures applications, the Admin maintains the rules.
// In production this is your SSO / identity provider; passwords are never checked in the browser.
import { useSyncExternalStore } from 'react';

export const USERS = [
  { email: 'rm.anand@loaneligibilitycheck.in', name: 'Anand Krishnan', role: 'rm', title: 'Relationship Manager · Chennai' },
  { email: 'priya.sharma@loaneligibilitycheck.in', name: 'Priya Sharma', role: 'admin', title: 'Product Manager · Credit Policy' },
];
export const DEMO_PASSWORD = 'demo@123';
const KEY = 'loaneligibilitycheck.session.v1';

let session = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return USERS.find((u) => u.email === s?.email) ? s : null; } catch (_) { return null; } })();
const subs = new Set();
const emit = () => { try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch (_) { /* ignore */ } subs.forEach((f) => f()); };

export const useSession = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => session);

export function validateLogin(email, password) {
  const e = {};
  const em = (email || '').trim().toLowerCase();
  if (!em) e.email = 'Enter your work email.';
  else if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(em)) e.email = 'Enter a valid email, e.g. name@loaneligibilitycheck.in.';
  else if (!em.endsWith('@loaneligibilitycheck.in')) e.email = 'Use your @loaneligibilitycheck.in work email.';
  else if (!USERS.find((u) => u.email === em)) e.email = 'No account with this email. Use one of the demo accounts below.';
  if (!password) e.password = 'Enter your password.';
  else if (password.length < 6) e.password = 'Password has at least 6 characters.';
  else if (!e.email && password !== DEMO_PASSWORD) e.password = 'Wrong password. The demo password is shown below.';
  return e;
}
export function signIn(email) { const u = USERS.find((x) => x.email === email.trim().toLowerCase()); session = { email: u.email, at: new Date().toISOString() }; emit(); return u; }
export function signOut() { session = null; emit(); }
export const currentUser = (s) => USERS.find((u) => u.email === s?.email) || null;
