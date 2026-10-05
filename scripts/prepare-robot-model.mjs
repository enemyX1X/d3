import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = path.join(root, 'apps', 'web', 'public', 'models', 'box-02_robot.glb');
const bytes = await readFile(modelPath);

if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
  throw new Error('Expected a binary glTF 2.0 model.');
}

let jsonChunk;
let binaryChunk;
for (let offset = 12; offset < bytes.length;) {
  const length = bytes.readUInt32LE(offset);
  const type = bytes.readUInt32LE(offset + 4);
  const chunk = bytes.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) jsonChunk = JSON.parse(chunk.toString('utf8').trimEnd());
  if (type === 0x004e4942) binaryChunk = chunk;
  offset += 8 + length;
}

if (!jsonChunk || !binaryChunk) throw new Error('The GLB is missing its JSON or binary chunk.');

const images = jsonChunk.images || [];
const embeddedImages = images.filter((image) => Number.isInteger(image.bufferView));

if (embeddedImages.length) {
  const imageViews = new Set(embeddedImages.map((image) => image.bufferView));
  const accessorViews = new Set();
  for (const accessor of jsonChunk.accessors || []) {
    if (Number.isInteger(accessor.bufferView)) accessorViews.add(accessor.bufferView);
    if (accessor.sparse) {
      accessorViews.add(accessor.sparse.indices.bufferView);
      accessorViews.add(accessor.sparse.values.bufferView);
    }
  }

  for (const [index, image] of images.entries()) {
    if (!Number.isInteger(image.bufferView)) continue;
    const view = jsonChunk.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const filename = `box-02_robot_texture_${index}.${extension}`;
    await writeFile(path.join(path.dirname(modelPath), filename), binaryChunk.subarray(start, start + view.byteLength));
    delete image.bufferView;
    image.uri = filename;
  }

  const compactedBufferViews = [];
  const remappedViews = new Map();
  const binaryParts = [];
  let binaryLength = 0;
  for (const [index, view] of jsonChunk.bufferViews.entries()) {
    if (imageViews.has(index) && !accessorViews.has(index)) continue;
    const alignedOffset = Math.ceil(binaryLength / 4) * 4;
    if (alignedOffset > binaryLength) binaryParts.push(Buffer.alloc(alignedOffset - binaryLength));
    const start = view.byteOffset || 0;
    binaryParts.push(binaryChunk.subarray(start, start + view.byteLength));
    remappedViews.set(index, compactedBufferViews.length);
    compactedBufferViews.push({ ...view, byteOffset: alignedOffset });
    binaryLength = alignedOffset + view.byteLength;
  }

  for (const accessor of jsonChunk.accessors || []) {
    if (Number.isInteger(accessor.bufferView)) accessor.bufferView = remappedViews.get(accessor.bufferView);
    if (accessor.sparse) {
      accessor.sparse.indices.bufferView = remappedViews.get(accessor.sparse.indices.bufferView);
      accessor.sparse.values.bufferView = remappedViews.get(accessor.sparse.values.bufferView);
    }
  }
  for (const image of images) delete image.bufferView;
  jsonChunk.bufferViews = compactedBufferViews;
  jsonChunk.buffers[0].byteLength = binaryLength;
  binaryChunk = Buffer.concat(binaryParts, binaryLength);

  const jsonData = Buffer.from(JSON.stringify(jsonChunk), 'utf8');
  const paddedJsonLength = Math.ceil(jsonData.length / 4) * 4;
  const paddedJson = Buffer.alloc(paddedJsonLength, 0x20);
  jsonData.copy(paddedJson);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJsonLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  const totalLength = 12 + jsonHeader.length + paddedJson.length + binaryHeader.length + binaryChunk.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  await writeFile(modelPath, Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, binaryChunk]));
} else {
  for (const image of images) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    const imagePath = path.join(path.dirname(modelPath), image.uri);
    await readFile(imagePath);
  }
}

console.log(`Robot model ready with ${images.length} local texture assets.`);