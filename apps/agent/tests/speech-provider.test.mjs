import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createSpeechProvider } from '../speech-provider.mjs';

const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(40)]);

test('Whisper adapter sends bounded audio to its loopback inference service', async () => {
  let requestUrl;
  let uploaded;
  const speech = createSpeechProvider({
    fetchImpl: async (url, options) => {
      requestUrl = url;
      const file = options.body.get('file');
      uploaded = Buffer.from(await file.arrayBuffer());
      return { ok: true, json: async () => ({ text: '  local   words  ' }) };
    }
  });
  const transcript = await speech.transcribe({ audio: Buffer.from([1, 2, 3]), mimeType: 'audio/webm;codecs=opus' });

  assert.equal(requestUrl, 'http://127.0.0.1:8080/inference');
  assert.deepEqual(uploaded, Buffer.from([1, 2, 3]));
  assert.equal(transcript, 'local words');
  await assert.rejects(() => speech.transcribe({ audio: Buffer.alloc(1), mimeType: 'text/plain' }), /Unsupported/);
});

test('Piper adapter uses fixed arguments without a shell and returns bounded WAV bytes', async () => {
  let invocation;
  let spokenText;
  const speech = createSpeechProvider({
    piperBinary: 'piper-local',
    piperModelPath: 'C:/models/en.onnx',
    piperConfigPath: 'C:/models/en.onnx.json',
    spawnImpl: (binary, args, options) => {
      invocation = { binary, args, options };
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      child.stdin = {
        end(text) {
          spokenText = text;
          const output = args[args.indexOf('--output_file') + 1];
          writeFile(output, wav).then(() => setImmediate(() => child.emit('close', 0)));
        }
      };
      return child;
    }
  });
  const result = await speech.speak({ text: 'Hello from LIVIA.' });

  assert.equal(invocation.binary, 'piper-local');
  assert.equal(invocation.options.shell, false);
  assert.ok(invocation.args.includes('C:/models/en.onnx'));
  assert.equal(spokenText, 'Hello from LIVIA.');
  assert.deepEqual(result, wav);
  await assert.rejects(() => createSpeechProvider().speak({ text: 'Hello' }), /PIPER_MODEL_PATH/);
});

test('speech adapters reject non-loopback service URLs', () => {
  assert.throws(() => createSpeechProvider({ whisperUrl: 'https://speech.example/inference' }), /loopback/);
});
