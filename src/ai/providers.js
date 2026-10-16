// Thin clients for Gemini and any OpenAI-compatible API (Groq, OpenAI, OpenRouter...). Browser fetch, no SDK.
import { PROVIDERS } from './settings.js';

const TIMEOUT_MS = 30000;

async function http(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* non-JSON error body */ }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 200) || res.statusText;
      const err = new Error(res.status === 429 ? `Rate limit reached (429). Wait a minute or switch model. ${msg}` : `${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`The AI provider did not answer within ${TIMEOUT_MS / 1000} seconds.`);
    if (e instanceof TypeError) throw new Error('Could not reach the AI provider. Check the internet connection or the base URL.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Send a chat to the configured model and ask for a JSON object back.
 * messages: [{ role: 'user' | 'assistant', content }]
 * Returns { text, usage: { input, output }, model }
 */
export async function chatJSON(settings, system, messages, { temperature = 0.2 } = {}) {
  const p = PROVIDERS[settings.provider];
  if (p.kind === 'gemini') {
    const url = `${p.baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature, responseMimeType: 'application/json' },
    };
    const json = await http(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey }, body: JSON.stringify(body) });
    const cand = json?.candidates?.[0];
    if (!cand) throw new Error(json?.promptFeedback?.blockReason ? `Blocked by provider safety filter: ${json.promptFeedback.blockReason}` : 'The model returned no answer.');
    const text = (cand.content?.parts || []).map((x) => x.text || '').join('');
    return { text, usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount }, model: json.modelVersion || settings.model };
  }
  const base = (settings.baseUrl || p.baseUrl).replace(/\/+$/, '');
  const body = {
    model: settings.model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, ...messages],
  };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` };
  if (settings.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Loan Eligibility Desk'; }
  const json = await http(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('The model returned no answer.');
  return { text, usage: { input: json.usage?.prompt_tokens, output: json.usage?.completion_tokens }, model: json.model || settings.model };
}

/** List models the key can use (for the settings dialog). */
export async function listModels(settings) {
  const p = PROVIDERS[settings.provider];
  if (p.kind === 'gemini') {
    const json = await http(`${p.baseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': settings.apiKey } });
    return (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini|gemma/i.test(m.name))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a));
  }
  const base = (settings.baseUrl || p.baseUrl).replace(/\/+$/, '');
  const json = await http(`${base}/models`, { headers: { Authorization: `Bearer ${settings.apiKey}` } });
  return (json.data || []).map((m) => m.id).filter((id) => !/whisper|tts|embed|guard|dall|image|audio|moderation/i.test(id)).sort();
}
