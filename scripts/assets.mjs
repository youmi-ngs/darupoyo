import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../public/models/', import.meta.url);
await mkdir(root, { recursive: true });
for (const kind of ['audio', 'vision']) await cp(new URL('../node_modules/@mediapipe/tasks-' + kind + '/wasm', import.meta.url), new URL(kind, root), { recursive: true });
for (const [name, path, expected] of [['pose.task','pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task','59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'], ['yamnet.tflite','audio_classifier/yamnet/float32/1/yamnet.tflite','4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf']]) {
  const target = new URL(name, root);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  try { if (hash(await readFile(target)) === expected) continue; } catch {}
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/' + path);
  if (!response.ok) throw new Error('Model download failed: ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error('Model checksum mismatch: ' + name);
  await writeFile(target, bytes);
}
