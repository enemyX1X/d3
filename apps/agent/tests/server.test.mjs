import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentServer } from '../server.mjs';
import { modelForTask } from '../model-router.mjs';
import { createOllamaProvider } from '../ollama-provider.mjs';

const token = 'test-token-with-more-than-thirty-two-characters';

async function withServer(options, run) {
  const server = createAgentServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('agent binds for local use and authenticates chat requests', async () => {
  let received;
  await withServer({
    token,
    allowedOrigins: ['http://localhost:3000'],
    env: { LIVIA_MODEL_FAST: 'qwen-fast' },
    provider: { chat: async (request) => { received = request; return 'Local answer'; } }
  }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'livia-agent', ollama: 'loopback-only' });

    const denied = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 'fast', messages: [{ role: 'user', content: 'hello' }] })
    });
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'fast', messages: [{ role: 'user', content: 'hello' }] })
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true, task: 'fast', model: 'qwen-fast', content: 'Local answer' });
    assert.equal(received.model, 'qwen-fast');
    assert.equal(received.messages[0].content, 'hello');
  });
});

test('agent accepts IPv6 loopback hosts while preserving origin checks', async () => {
  let received;
  const server = createAgentServer({
    token,
    allowedOrigins: ['http://localhost:3000'],
    provider: { chat: async (request) => { received = request; return 'ipv6-local-answer'; } }
  });
  await new Promise((resolve) => server.listen(0, '::1', resolve));
  const baseUrl = `http://[::1]:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'fast', messages: [{ role: 'user', content: 'hello via ipv6' }] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, task: 'fast', model: 'qwen3:4b', content: 'ipv6-local-answer' });
    assert.equal(received.messages[0].content, 'hello via ipv6');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('agent rejects disallowed origins and malformed or oversized conversation payloads', async () => {
  let calls = 0;
  await withServer({ token, allowedOrigins: ['http://localhost:3000'], provider: { chat: async () => { calls += 1; return 'no'; } } }, async (baseUrl) => {
    const rejectedOrigin = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'fast', messages: [{ role: 'user', content: 'hello' }] })
    });
    assert.equal(rejectedOrigin.status, 403);

    const invalidPayload = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'fast', extra: 'not allowed', messages: [{ role: 'user', content: 'hello' }] })
    });
    assert.equal(invalidPayload.status, 400);

    const tooLarge = await fetch(`${baseUrl}/v1/chat`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'fast', messages: [{ role: 'user', content: 'x'.repeat(16_100) }] })
    });
    assert.equal(tooLarge.status, 413);
    assert.equal(calls, 0);
  });
});

test('model router accepts only configured task classes', () => {
  assert.equal(modelForTask('fast', { LIVIA_MODEL_FAST: 'local-fast' }), 'local-fast');
  assert.equal(modelForTask('balanced', {}), 'qwen3:4b');
  assert.equal(modelForTask('vision', { LIVIA_MODEL_VISION: 'qwen3-vl:8b' }), 'qwen3-vl:8b');
  assert.equal(modelForTask('vision', {}), null);
  assert.equal(modelForTask('embedding', { LIVIA_MODEL_EMBEDDING: 'nomic-embed-text' }), 'nomic-embed-text');
  assert.equal(modelForTask('embedding', {}), null);
  assert.equal(modelForTask('arbitrary', {}), null);
});

test('Ollama provider rejects non-loopback endpoints and bounds response text', async () => {
  assert.throws(() => createOllamaProvider({ baseUrl: 'https://example.com' }), /loopback/);
  let calledUrl;
  const provider = createOllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    fetchImpl: async (url, options) => {
      calledUrl = url;
      assert.equal(options.method, 'POST');
      const request = JSON.parse(options.body);
      assert.equal(request.stream, false);
      return { ok: true, json: async () => ({ message: { content: 'answer' } }) };
    }
  });
  assert.equal(await provider.chat({ model: 'local', messages: [{ role: 'user', content: 'hi' }] }), 'answer');
  assert.equal(calledUrl, 'http://127.0.0.1:11434/api/chat');
});

test('Ollama vision provider sends screenshot bytes only to the configured loopback model', async () => {
  let sent;
  const provider = createOllamaProvider({
    fetchImpl: async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ message: { content: 'A page with a search button.' } }) };
    }
  });
  const answer = await provider.vision({ model: 'qwen3-vl:8b', question: 'Find the main control.', image: 'aW1hZ2U=' });

  assert.equal(answer, 'A page with a search button.');
  assert.equal(sent.url, 'http://127.0.0.1:11434/api/chat');
  assert.deepEqual(sent.body.messages[1].images, ['aW1hZ2U=']);
  assert.match(sent.body.messages[0].content, /untrusted visual input/);
});

test('Ollama embedding provider posts bounded text to the loopback embed endpoint', async () => {
  let sent;
  const provider = createOllamaProvider({
    fetchImpl: async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }) };
    }
  });
  const vectors = await provider.embed({ model: 'nomic-embed-text', texts: ['page title and summary', 'semantic query'] });

  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
  assert.equal(sent.url, 'http://127.0.0.1:11434/api/embed');
  assert.deepEqual(sent.body, { model: 'nomic-embed-text', input: ['page title and summary', 'semantic query'] });
});

test('embedding route validates bounded text and returns local vectors', async () => {
  let received;
  await withServer({
    token,
    env: { LIVIA_MODEL_EMBEDDING: 'nomic-embed-text' },
    provider: { chat: async () => '', embed: async (request) => { received = request; return [[0.1, 0.2], [0.3, 0.4]]; } }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ texts: ['a saved page', 'a search query'] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, task: 'embedding', model: 'nomic-embed-text', vectors: [[0.1, 0.2], [0.3, 0.4]] });
    assert.deepEqual(received.texts, ['a saved page', 'a search query']);

    const invalid = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ texts: ['valid'], instruction: 'extra field' })
    });
    assert.equal(invalid.status, 400);
  });
});

test('speech routes authenticate audio input and return validated WAV output', async () => {
  let spokenText;
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(40)]);
  await withServer({
    token,
    speechProvider: {
      transcribe: async ({ audio, mimeType }) => `${mimeType}:${audio.length}`,
      speak: async ({ text }) => { spokenText = text; return wav; }
    }
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/speech/transcribe`, {
      method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.from([1, 2, 3])
    });
    assert.equal(denied.status, 401);

    const transcript = await fetch(`${baseUrl}/v1/speech/transcribe`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/webm;codecs=opus' }, body: Buffer.from([1, 2, 3])
    });
    assert.equal(transcript.status, 200);
    assert.deepEqual(await transcript.json(), { ok: true, text: 'audio/webm:3' });

    const speech = await fetch(`${baseUrl}/v1/speech/speak`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hello' })
    });
    assert.equal(speech.status, 200);
    assert.equal(speech.headers.get('content-type'), 'audio/wav');
    assert.deepEqual(Buffer.from(await speech.arrayBuffer()), wav);
    assert.equal(spokenText, 'Hello');

    const rejected = await fetch(`${baseUrl}/v1/speech/speak`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(2_001) })
    });
    assert.equal(rejected.status, 400);
  });
});

test('vision route requires auth and only forwards validated local image bytes', async () => {
  let received;
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  await withServer({
    token,
    env: { LIVIA_MODEL_VISION: 'qwen-vl-local' },
    provider: { chat: async () => 'text', vision: async (request) => { received = request; return 'A local screenshot description'; } }
  }, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/v1/vision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/jpeg', image: jpg, question: 'Describe this screen.' })
    });
    assert.equal(unauthorized.status, 401);

    const valid = await fetch(`${baseUrl}/v1/vision`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/jpeg', image: jpg, question: 'Describe this screen.' })
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { ok: true, task: 'vision', model: 'qwen-vl-local', content: 'A local screenshot description' });
    assert.equal(received.image, jpg);
    assert.equal(received.question, 'Describe this screen.');

    const wrongSignature = await fetch(`${baseUrl}/v1/vision`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/png', image: jpg, question: 'Describe this screen.' })
    });
    assert.equal(wrongSignature.status, 400);
  });
});
