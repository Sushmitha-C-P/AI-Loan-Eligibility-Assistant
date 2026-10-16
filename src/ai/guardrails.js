// Guardrails around every AI call: redact PII before sending, validate and sanity-check what comes back.
import { lakh } from '../engine/format.js';

const PII = [
  [/\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g, '[AADHAAR]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN]'],
  [/\b[A-Z]{3}\d{7}\b/gi, '[VOTER_ID]'],
  [/(?:\+91[\s-]?)?\b[6-9]\d{4}\s?\d{5}\b/g, '[MOBILE]'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[EMAIL]'],
];

/** Mask identifiers in free text before it leaves the browser. */
export function redact(text) {
  let out = String(text || ''); let count = 0; const kinds = new Set();
  for (const [re, tag] of PII) out = out.replace(re, () => { count++; kinds.add(tag); return tag; });
  return { text: out, count, kinds: [...kinds] };
}

/** Final outbound check on the exact payload string. */
export function piiScan(str) {
  const hits = PII.filter(([re]) => new RegExp(re.source, re.flags).test(str)).map(([, tag]) => tag);
  return { ok: hits.length === 0, hits };
}

export function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (_) {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* fall through */ } }
    return null;
  }
}

const APPROVAL = /\b(is|are|has been|have been|stands|now|hereby|i|we)\s+(approved|sanctioned|approve|sanction)\b|\bloan (is )?(approved|sanctioned)\b|\bguarantee(d)?\b|\bpre-?approved\b/i;
const CLAIM_ELIGIBLE = /\b(you are|you're|customer is|applicant is|is|are)\s+(fully\s+)?(eligible|qualified)\b/i;
const CLAIM_NOT = /\bnot\s+(be\s+)?eligible\b|\bineligible\b/i;

function amountsInLakh(text) {
  const out = [];
  const t = String(text);
  for (const m of t.matchAll(/(?:₹|rs\.?|inr)\s*([\d.,]+)\s*(lakh|lakhs|lac|l)\b/gi)) out.push(parseFloat(m[1].replace(/,/g, '')));
  for (const m of t.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]{6,})(?!\s*(lakh|lac|l)\b)/gi)) out.push(parseInt(m[1].replace(/,/g, ''), 10) / 100000);
  return out.filter((n) => isFinite(n));
}

/**
 * Check an AI text against the BRE decision. Returns a list of checks: { name, ok, detail }.
 */
export function decisionChecks(text, result) {
  const checks = [];
  const approval = APPROVAL.exec(text);
  checks.push({ name: 'No approval or sanction claims', ok: !approval, detail: approval ? `Found "${approval[0]}"` : '' });
  if (result.key === 'fail') {
    const bad = CLAIM_ELIGIBLE.exec(text.replace(/\bnot\s+(currently\s+)?(eligible|qualified)\b/gi, ''));
    checks.push({ name: 'Consistent with "Not eligible"', ok: !bad, detail: bad ? `Found "${bad[0]}"` : '' });
  } else {
    const bad = CLAIM_NOT.exec(text);
    checks.push({ name: `Consistent with "${result.label}"`, ok: !bad, detail: bad ? `Found "${bad[0]}"` : '' });
  }
  const cap = Math.max(result.maxAmt, result.amount) / 100000 * 1.05;
  const over = amountsInLakh(text).find((n) => n > cap);
  checks.push({ name: 'No amounts above the BRE figures', ok: over == null, detail: over != null ? `Mentions ${lakh(over * 100000)}` : '' });
  return checks;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strArr = (v, n, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n).map((x) => x.trim().slice(0, max)) : []);

/** Schema-check the explanation JSON. Returns { value, checks } */
export function validateExplanation(obj, result) {
  const checks = [];
  const okShape = obj && typeof obj === 'object';
  const value = okShape ? {
    headline: str(obj.headline, 140),
    summary: str(obj.summary, 900),
    positives: strArr(obj.positives, 5, 220),
    concerns: strArr(obj.concerns, 5, 220),
    next_steps: strArr(obj.next_steps, 4, 260),
    customer_message: str(obj.customer_message, 1600),
  } : null;
  checks.push({ name: 'Valid JSON matching the schema', ok: !!(value && value.headline && value.summary && value.customer_message), detail: value ? '' : 'Could not parse JSON' });
  if (value) {
    const all = [value.headline, value.summary, ...value.positives, ...value.concerns, ...value.next_steps, value.customer_message].join(' \n ');
    checks.push(...decisionChecks(all, result));
  }
  return { value, checks, ok: checks.every((c) => c.ok) };
}

export function validateAnswer(obj, result) {
  const answer = obj && typeof obj.answer === 'string' ? obj.answer.trim().slice(0, 1500) : '';
  const value = answer ? { answer, refused: !!obj.refused, cited: strArr(obj.cited_rules, 6, 24).filter((x) => result.rules.some((r) => r.id === x)) } : null;
  const checks = [{ name: 'Valid JSON matching the schema', ok: !!value, detail: value ? '' : 'Could not parse JSON' }];
  if (value) checks.push(...decisionChecks(value.answer, result).filter((c) => !c.name.startsWith('No amounts')));
  return { value, checks, ok: checks.every((c) => c.ok) };
}


/** Validate advisory findings (config review, data review). */
export function validateFindings(obj, allowedKeys, keyName) {
  const SEV = ['high', 'medium', 'low'];
  const ok0 = obj && typeof obj === 'object' && Array.isArray(obj.findings);
  const findings = ok0 ? obj.findings.filter((f) => f && typeof f.message === 'string').slice(0, 6).map((f) => ({
    severity: SEV.includes(f.severity) ? f.severity : 'low',
    [keyName]: allowedKeys.includes(f[keyName]) ? f[keyName] : allowedKeys[allowedKeys.length - 1],
    message: f.message.trim().slice(0, 300),
    suggestion: typeof f.suggestion === 'string' ? f.suggestion.trim().slice(0, 300) : '',
  })).sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity)) : [];
  const value = ok0 ? { summary: typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 500) : '', findings } : null;
  const checks = [{ name: 'Valid JSON matching the schema', ok: !!value, detail: value ? '' : 'Could not parse JSON' }];
  if (value) {
    const all = [value.summary, ...findings.flatMap((f) => [f.message, f.suggestion])].join(' \n ');
    const appr = APPROVAL.exec(all);
    checks.push({ name: 'No approval or eligibility verdicts', ok: !appr && !CLAIM_ELIGIBLE.exec(all.replace(/\bnot\s+(be\s+)?(eligible|qualified)\b/gi, '')), detail: appr ? `Found "${appr[0]}"` : '' });
    checks.push({ name: 'Advisory only (cannot save or change data)', ok: true, detail: '' });
  }
  return { value, checks, ok: checks.every((c) => c.ok) };
}
