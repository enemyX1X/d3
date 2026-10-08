import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { modelForTask } from './model-router.mjs';
import { createOllamaProvider } from './ollama-provider.mjs';
import { createSpeechProvider } from './speech-provider.mjs';

const MAX_BODY_BYTES = 16_000;
const MAX_VISION_BODY_BYTES = 5_600_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 4_000;
const ALLOWED_TASKS = new Set(['fast', 'balanced', 'smart']);

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function binary(response, status, contentType, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': payload.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(payload);
}

function isLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string') return false;
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function hasValidToken(header, expected) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const known = Buffer.from(expected);
  return supplied.length === known.length && timingSafeEqual(supplied, known);
}

function validPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (Object.keys(payload).some((key) => !['task', 'messages'].includes(key))) return false;
  if (!ALLOWED_TASKS.has(payload.task) || !Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > MAX_MESSAGES) return false;
  let totalChars = 0;
  for (const message of payload.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    if (Object.keys(message).some((key) => !['role', 'content'].includes(key))) return false;
    if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_CHARS) return false;
    totalChars += message.content.length;
  }
  return totalChars <= 12_000;
}

function validVisionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (Object.keys(payload).some((key) => !['question', 'mimeType', 'image'].includes(key))) return false;
  if (typeof payload.question !== 'string' || !payload.question.trim() || payload.question.length > 500) return false;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(payload.mimeType)) return false;
  if (typeof payload.image !== 'string' || payload.image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.image)) return false;
  const bytes = Buffer.from(payload.image, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== payload.image) return false;
  if (payload.mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (payload.mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function validEmbeddingPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some((key) => key !== 'texts')) return false;
  if (!Array.isArray(payload.texts) || payload.texts.length < 1 || payload.texts.length > 32) return false;
  let totalChars = 0;
  for (const text of payload.texts) {
    if (typeof text !== 'string' || !text.trim() || text.length > 4_000) return false;
    totalChars += text.length;
  }
  return totalChars <= 12_000;
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readBytes(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body-too-large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createAgentServer({ token, allowedOrigins = [], provider = createOllamaProvider(), speechProvider, env = process.env } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('A LIVIA_AGENT_TOKEN of at least 32 characters is required.');
  const origins = new Set(allowedOrigins);
  const speech = speechProvider || createSpeechProvider({
    whisperUrl: env.WHISPER_CPP_URL,
    piperBinary: env.PIPER_BIN,
    piperModelPath: env.PIPER_MODEL_PATH,
    piperConfigPath: env.PIPER_CONFIG_PATH
  });

  return createServer(async (request, response) => {
    if (!isLoopbackHost(request.headers.host)) {
      json(response, 403, { ok: false, error: 'Loopback host required.' });
      return;
    }

    const origin = request.headers.origin;
    if (origin && !origins.has(origin)) {
      json(response, 403, { ok: false, error: 'Origin is not allowed.' });
      return;
    }
    const corsHeaders = origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'Origin'
    } : {};

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { ok: true, service: 'livia-agent', ollama: 'loopback-only' }, corsHeaders);
      return;
    }
    const speechTranscription = request.url === '/v1/speech/transcribe';
    const speechSynthesis = request.url === '/v1/speech/speak';
    if (request.method !== 'POST' || !['/v1/chat', '/v1/vision', '/v1/embeddings', '/v1/speech/transcribe', '/v1/speech/speak'].includes(request.url)) {
      json(response, 404, { ok: false, error: 'Route not found.' }, corsHeaders);
      return;
    }
    if (!hasValidToken(request.headers.authorization, token)) {
      json(response, 401, { ok: false, error: 'Authentication required.' }, corsHeaders);
      return;
    }

    if (speechTranscription) {
      const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/mpeg'].includes(mimeType)) {
        json(response, 400, { ok: false, error: 'Use a supported audio recording format.' }, corsHeaders);
        return;
      }
      let audio;
      try {
        audio = await readBytes(request, MAX_AUDIO_BYTES);
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'body-too-large';
        json(response, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'Audio recording exceeds 10 MB.' : 'Could not read audio recording.' }, corsHeaders);
        return;
      }
      try {
        const text = await speech.transcribe({ audio, mimeType });
        json(response, 200, { ok: true, text: String(text || '').slice(0, 4_000) }, corsHeaders);
      } catch {
        json(response, 502, { ok: false, error: 'Local transcription failed. Check whisper.cpp and its model.' }, corsHeaders);
      }
      return;
    }

    if (speechSynthesis) {
      let payload;
      try {
        payload = await readJson(request);
      } catch {
        json(response, 400, { ok: false, error: 'Body must be valid JSON.' }, corsHeaders);
        return;
      }
      if (!payload || typeof payload !== 'object' || Object.keys(payload).some((key) => key !== 'text') || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2_000) {
        json(response, 400, { ok: false, error: 'Speech text must be 1 to 2,000 characters.' }, corsHeaders);
        return;
      }
      try {
        const audio = Buffer.from(await speech.speak({ text: payload.text }));
        if (audio.length < 44 || audio.length > MAX_AUDIO_BYTES || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
          throw new Error('Invalid Piper audio.');
        }
        binary(response, 200, 'audio/wav', audio, corsHeaders);
      } catch {
        json(response, 502, { ok: false, error: 'Local speech synthesis failed. Configure Piper and its voice model.' }, corsHeaders);
      }
      return;
    }

    const isVisionRequest = request.url === '/v1/vision';
    const isEmbeddingRequest = request.url === '/v1/embeddings';
    let payload;
    try {
      payload = await readJson(request, isVisionRequest ? MAX_VISION_BODY_BYTES : MAX_BODY_BYTES);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'body-too-large';
      json(response, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'Request body is too large.' : 'Body must be valid JSON.' }, corsHeaders);
      return;
    }
    if (!isVisionRequest && !isEmbeddingRequest && !validPayload(payload)) {
      json(response, 400, { ok: false, error: 'Expected a supported task and bounded user/assistant messages.' }, corsHeaders);
      return;
    }
    if (isVisionRequest && !validVisionPayload(payload)) {
      json(response, 400, { ok: false, error: 'Expected a supported image and a question under 500 characters.' }, corsHeaders);
      return;
    }
    if (isEmbeddingRequest && !validEmbeddingPayload(payload)) {
      json(response, 400, { ok: false, error: 'Expected 1 to 32 bounded text inputs.' }, corsHeaders);
      return;
    }

    const task = isVisionRequest ? 'vision' : isEmbeddingRequest ? 'embedding' : payload.task;
    const model = modelForTask(task, env);
    if (!model) {
      const error = isVisionRequest
        ? 'Configure a local vision-capable model in LIVIA_MODEL_VISION.'
        : isEmbeddingRequest ? 'Configure a local embedding model in LIVIA_MODEL_EMBEDDING.' : 'No local model is configured for this task.';
      json(response, 503, { ok: false, error }, corsHeaders);
      return;
    }
    try {
      if (isEmbeddingRequest) {
        const vectors = await provider.embed({ model, texts: payload.texts });
        json(response, 200, { ok: true, task, model, vectors }, corsHeaders);
        return;
      }
      const content = isVisionRequest
        ? await provider.vision({ model, question: payload.question, image: payload.image })
        : await provider.chat({ model, messages: payload.messages });
      json(response, 200, { ok: true, task, model, content }, corsHeaders);
    } catch {
      json(response, 502, { ok: false, error: 'Local Ollama request failed. Check that Ollama is running and the model is installed.' }, corsHeaders);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const token = process.env.LIVIA_AGENT_TOKEN;
  if (!token || token.length < 32) {
    console.error('Set LIVIA_AGENT_TOKEN to a random value of at least 32 characters.');
    process.exitCode = 1;
  } else {
    const allowedOrigins = (process.env.LIVIA_ALLOWED_ORIGINS || 'http://localhost:3000')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    const port = Number(process.env.LIVIA_AGENT_PORT || 4317);
    let provider;
    try {
      provider = createOllamaProvider({ baseUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434' });
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Invalid Ollama URL.');
      process.exitCode = 1;
    }
    if (provider) {
      const server = createAgentServer({ token, allowedOrigins, provider });
      server.listen(port, '127.0.0.1', () => {
        console.log(`LIVIA Agent listening on 127.0.0.1:${port}`);
      });
    }
  }
}
