// AI provider settings. Defaults come from .env.local (VITE_*); the in-app settings dialog overrides them
// and saves to this browser's localStorage only.
export const PROVIDERS = {
  gemini: { label: 'Google Gemini (free tier)', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'Starts with AIza…' },
  groq: { label: 'Groq (free tier)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', keyHint: 'Starts with gsk_…' },
  openai: { label: 'OpenAI (paid)', kind: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'Starts with sk-…' },
  openrouter: { label: 'OpenRouter (has free models)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', keyHint: 'Starts with sk-or-…' },
  custom: { label: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: '', defaultModel: '', keyUrl: '', keyHint: '' },
};

const KEY = 'led.ai.settings.v1';
const env = import.meta.env || {};

export function defaultSettings() {
  const provider = PROVIDERS[env.VITE_AI_PROVIDER] ? env.VITE_AI_PROVIDER : 'gemini';
  return {
    provider,
    apiKey: env.VITE_AI_API_KEY || '',
    model: env.VITE_AI_MODEL || PROVIDERS[provider].defaultModel,
    baseUrl: env.VITE_AI_BASE_URL || PROVIDERS[provider].baseUrl,
    enabled: true,
  };
}

export function loadSettings() {
  const base = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && PROVIDERS[saved.provider]) return { ...base, ...saved };
  } catch (_) { /* storage unavailable */ }
  return base;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
}

export const isAiReady = (s) => !!(s && s.enabled && s.apiKey && s.model && (PROVIDERS[s.provider].kind === 'gemini' || s.baseUrl));
