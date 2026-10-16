// Saved loan applications (the RM's pipeline). Browser-only for the demo: localStorage.
// In production this is your loan-origination database behind an API.
import { useSyncExternalStore } from 'react';
import { SAMPLES, mockBureau, mockBank, mockGst } from './mocks.js';

const KEY = 'loaneligibilitycheck.apps.v1';
export const STATUSES = ['Draft', 'Eligible', 'Review', 'Not eligible', 'Sent to sanction', 'Declined'];
export const STATUS_TONE = { Draft: 'na', Eligible: 'pass', Review: 'review', 'Not eligible': 'fail', 'Sent to sanction': 'brand', Declined: 'fail' };
export const statusFromKey = (key) => (key === 'fail' ? 'Not eligible' : key === 'pass' ? 'Eligible' : 'Review');

const nameOf = (d) => (d.applicantType === 'Business' ? d.businessName : d.fullName) || 'Unnamed applicant';

function seedOne(key, n, status, daysAgo, step = 3) {
  const smp = SAMPLES[key];
  const d = JSON.parse(JSON.stringify(smp.d));
  const at = new Date(Date.now() - daysAgo * 864e5).toISOString();
  return {
    id: 'APP-' + String(n).padStart(4, '0'), name: nameOf(d), applicantType: d.applicantType, productId: d.productId, amount: Number(d.amount), status, owner: 'rm.anand@loaneligibilitycheck.in', updatedAt: at, createdAt: at,
    state: { d, v: { id: true, pan: true, mobile: true, udyam: !!d.udyam, gstin: !!d.gstin }, bureau: mockBureau(d.pan, d.applicantType === 'Business'), bank: { ...mockBank(d.pan, 6), source: 'aa', aggregator: 'Ignosis' }, bankSkipped: false, gst: mockGst(d.pan, d.gstin), step, maxStep: step, decision: status === 'Sent to sanction' ? { status, remarks: 'Documents collected. Forwarded to credit.', at } : null },
  };
}
function seed() { return [seedOne('meena', 1041, 'Sent to sanction', 3), seedOne('farhan', 1042, 'Review', 1), seedOne('ramesh', 1043, 'Not eligible', 1)]; }

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(s)) return s; } catch (_) { /* ignore */ }
  return seed();
}
let apps = load();
const subs = new Set();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(apps)); } catch (_) { /* ignore */ } subs.forEach((f) => f()); };

export const useApps = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => apps);
export const getApp = (id) => apps.find((a) => a.id === id);
export function nextAppId() { const n = Math.max(1040, ...apps.map((a) => parseInt(a.id.replace(/\D/g, ''), 10) || 0)) + 1; return 'APP-' + String(n).padStart(4, '0'); }

/** Insert or update from the live application state. */
export function upsertApp(id, s, status, owner) {
  const now = new Date().toISOString();
  const state = { d: s.d, v: s.v, bureau: s.bureau, bank: s.bank, bankSkipped: s.bankSkipped, gst: s.gst, step: s.step, maxStep: s.maxStep, decision: s.decision };
  const prev = getApp(id);
  const rec = { id, name: nameOf(s.d), applicantType: s.d.applicantType || '—', productId: s.d.productId || '—', amount: Number(s.d.amount) || 0, status: status || prev?.status || 'Draft', owner: prev?.owner || owner, createdAt: prev?.createdAt || now, updatedAt: now, state };
  apps = prev ? apps.map((a) => (a.id === id ? rec : a)) : [rec, ...apps];
  emit();
  return rec;
}
export function deleteApp(id) { apps = apps.filter((a) => a.id !== id); emit(); }
export function resetApps() { apps = seed(); emit(); }
