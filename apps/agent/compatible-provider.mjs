export function createCompatibleProvider({
  apiKey,
  baseUrl = 'https://openrouter.ai/api/v1',
  fetchImpl = fetch,
  timeoutMs = 90_000,
  referer = 'http://localhost:3000',
  appName = 'LIVIA'
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('A provider API key is required.');
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Compatible model providers must use an HTTPS endpoint without embedded credentials.');
  }
  const endpoint = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/chat/completions`;

  return {
    async chat({ model, messages, jsonMode = false }) {
      if (typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || !messages.length) {
        throw new Error('A model and bounded conversation are required.');
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'http-referer': referer,
          'x-title': appName
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`Compatible provider request failed (${response.status}).`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Compatible provider returned an invalid response.');
      return content.slice(0, 12_000);
    }
  };
}
