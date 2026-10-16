// Tiny external store for the AI activity log, so judges can see every live call.
import { useSyncExternalStore } from 'react';

let entries = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function logStart(e) {
  const entry = { id: Math.random().toString(36).slice(2, 9), at: new Date(), status: 'running', checks: [], ...e };
  entries = [entry, ...entries].slice(0, 50);
  emit();
  return entry.id;
}
export function logUpdate(id, patch) {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
}
export function useAiLog() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => entries);
}
