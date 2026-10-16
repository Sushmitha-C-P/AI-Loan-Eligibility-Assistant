import { POLICY } from './policy.js';

export function emi(P, rate, n) { const r = rate / 1200; if (!P || !n) return 0; const f = Math.pow(1 + r, n); return (P * r * f) / (f - 1); }
export function pv(E, rate, n) { const r = rate / 1200; if (E <= 0 || !n) return 0; return (E * (1 - Math.pow(1 + r, -n))) / r; }

export function rateFor(score) {
  const c = POLICY.cb;
  if (score > c.autoPass) return POLICY.rates.auto;
  if (score >= c.pass) return POLICY.rates.pass;
  if (score >= c.deviation) return POLICY.rates.deviation;
  return POLICY.rates.fail;
}
export function bandFor(score) {
  const c = POLICY.cb;
  if (score > c.autoPass) return ['Auto-pass band', 'pass'];
  if (score >= c.pass) return ['Pass band', 'pass'];
  if (score >= c.deviation) return ['Deviation band', 'review'];
  return ['Fail band', 'fail'];
}
// (notes) >5 years = 5, 3–5 = 4, 1–3 = 3, <1 = 0
export function stab(y) { if (y == null || isNaN(y)) return null; if (y > 5) return 5; if (y >= 3) return 4; if (y >= 1) return 3; return 0; }

// Verhoeff checksum — the algorithm UIDAI uses for the last digit of Aadhaar
const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const VINV = [0,4,3,2,1,5,6,7,8,9];
export function verhoeffValid(n) { let c = 0; const a = n.split('').reverse().map(Number); for (let i = 0; i < a.length; i++) c = VD[c][VP[i % 8][a[i]]]; return c === 0; }
export function verhoeffDigit(n) { let c = 0; const a = n.split('').reverse().map(Number); for (let i = 0; i < a.length; i++) c = VD[c][VP[(i + 1) % 8][a[i]]]; return VINV[c]; }
export const aadhaarFrom = (base11) => (base11 + verhoeffDigit(base11)).replace(/(\d{4})(?=\d)/g, '$1 ');

// GSTIN: 2-digit state + 10-char PAN + entity no. + 'Z' + checksum (mod-36)
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}
export const gstinFrom = (first14) => first14 + gstinCheckChar(first14);
export function gstinValid(g) { return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14]; }
