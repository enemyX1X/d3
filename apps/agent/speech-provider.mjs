import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/mpeg']);

function loopbackEndpoint(rawUrl, defaultUrl, path) {
  const url = new URL(rawUrl || defaultUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Speech services must use loopback HTTP endpoints.');
  }
  if (url.pathname === '/') url.pathname = path;
  return url.toString();
}

async function synthesizeWithPiper({ text, binary, modelPath, configPath, spawnImpl }) {
  if (!modelPath) throw new Error('Configure PIPER_MODEL_PATH before using local speech synthesis.');
  const directory = await mkdtemp(join(tmpdir(), 'livia-piper-'));
  const outputPath = join(directory, 'speech.wav');
  const args = ['--model', modelPath, '--output_file', outputPath];
  if (configPath) args.push('--config', configPath);

  try {
    const child = spawnImpl(binary, args, { shell: false, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    const completed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Piper synthesis timed out.'));
      }, 30_000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error('Piper synthesis failed.'));
      });
    });
    child.stdin.end(text);
    await completed;
    const audio = await readFile(outputPath);
    if (audio.length < 44 || audio.length > MAX_AUDIO_BYTES || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Piper returned invalid audio.');
    }
    return audio;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function createSpeechProvider({
  whisperUrl = 'http://127.0.0.1:8080/inference',
  piperBinary = 'piper',
  piperModelPath = '',
  piperConfigPath = '',
  fetchImpl = fetch,
  spawnImpl = spawn
} = {}) {
  const whisperEndpoint = loopbackEndpoint(whisperUrl, 'http://127.0.0.1:8080/inference', '/inference');

  return {
    async transcribe({ audio, mimeType }) {
      const bytes = Buffer.from(audio || []);
      const mediaType = String(mimeType || '').split(';')[0].trim().toLowerCase();
      if (!AUDIO_TYPES.has(mediaType) || !bytes.length || bytes.length > MAX_AUDIO_BYTES) {
        throw new Error('Unsupported or oversized audio input.');
      }
      const form = new FormData();
      form.set('file', new Blob([bytes], { type: mediaType }), `livia-recording.${mediaType === 'audio/webm' ? 'webm' : 'audio'}`);
      form.set('response_format', 'json');
      form.set('temperature', '0');
      const response = await fetchImpl(whisperEndpoint, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) throw new Error('whisper.cpp request failed.');
      const payload = await response.json();
      const text = typeof payload?.text === 'string' ? payload.text : typeof payload?.transcription === 'string' ? payload.transcription : null;
      if (text === null) throw new Error('whisper.cpp returned an invalid transcript.');
      return text.replace(/\s+/g, ' ').trim().slice(0, 4_000);
    },
    async speak({ text }) {
      if (typeof text !== 'string' || !text.trim() || text.length > 2_000) throw new Error('Speech text must be 1 to 2,000 characters.');
      return synthesizeWithPiper({
        text: text.trim(),
        binary: piperBinary,
        modelPath: piperModelPath,
        configPath: piperConfigPath,
        spawnImpl
      });
    }
  };
}
