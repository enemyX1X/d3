import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'apps', 'extension');
const output = path.join(root, 'dist', 'livia-extension');

await rm(output, { recursive: true, force: true });
await mkdir(path.dirname(output), { recursive: true });
await cp(source, output, { recursive: true, filter: (entry) => path.basename(entry) !== 'tests' });
await build({
  entryPoints: [path.join(source, 'character-runtime.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  minify: true,
  outfile: path.join(output, 'livia-character.js')
});
await mkdir(path.join(output, 'assets'), { recursive: true });
const modelAssets = path.join(root, 'apps', 'web', 'public', 'models');
for (const filename of await readdir(modelAssets)) {
  await cp(path.join(modelAssets, filename), path.join(output, 'assets', filename));
}

const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) {
  throw new Error('Expected a Manifest V3 extension.');
}

console.log(`Extension ready. In Chrome or Edge, load this folder: ${path.relative(root, output)}`);