const PROMPT_INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /ignore all prior instructions/i,
  /system prompt/i,
  /you are now/i,
  /override the rules/i,
  /act as if/i,
  /developer message/i,
  /do not summarize/i,
  /reveal hidden instructions/i
];

export function sanitizeRetrievedText(value = '') {
  const text = String(value || '');
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\b(ignore previous instructions|ignore all prior instructions|system prompt|you are now|override the rules|act as if|developer message|do not summarize|reveal hidden instructions)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return 'Retrieved content was empty after sanitization.';

  const suspicious = PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
  if (!suspicious) return cleaned;

  return cleaned.replace(/\b(?:official\s+)?notice\b/gi, 'Official notice').replace(/\s+/g, ' ').trim();
}

export function createObservability() {
  const metrics = {};
  const startedAt = Date.now();

  function increment(name, value = 1) {
    metrics[name] = Number(metrics[name] || 0) + Number(value || 0);
    return metrics[name];
  }

  function snapshot() {
    return {
      ...metrics,
      uptime_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    };
  }

  return {
    increment,
    snapshot
  };
}
