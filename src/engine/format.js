export const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

export const money = (s) => { const t = String(s ?? '').replace(/[^\d]/g, ''); return t === '' ? null : parseInt(t, 10); };
export const num = (s) => money(s) || 0;
export const yrs = (s) => { if (s === '' || s == null) return null; const n = parseFloat(s); return isNaN(n) ? NaN : n; };
export const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const lakh = (n) => '₹' + (n / 100000).toFixed(1) + ' lakh';
export const lakhShort = (n) => (n / 100000).toFixed(1);
export const pct = (n) => (isFinite(n) ? n.toFixed(1) : '∞') + '%';
export const floor10k = (n) => Math.max(0, Math.floor(n / 10000) * 10000);
export const formatMoney = (raw) => { const n = money(raw); return n == null ? '' : n.toLocaleString('en-IN'); };

export function parseDate(s) { if (!s) return null; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; }
export function ageOn(dobStr, at = TODAY) {
  const d = parseDate(dobStr); if (!d) return null;
  let a = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) a--;
  return a;
}
export function yearsSince(dateStr) { const d = parseDate(dateStr); if (!d) return null; return (TODAY - d) / (365.25 * 864e5); }
export function fmtDate(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
export function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function amountWords(n) {
  if (!n) return '';
  if (n >= 10000000) return (n / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' crore';
  if (n >= 100000) return (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' lakh';
  return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' thousand';
}
export const joinList = (a) => (a.length <= 1 ? a[0] || '' : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
